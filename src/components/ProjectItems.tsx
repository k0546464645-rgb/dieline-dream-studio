import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedUrls, uploadToStudio } from "@/lib/storage";
import { parseItemsFile } from "@/lib/items-import";
import { emptyInfo, InfoForm } from "@/components/InfoForm";
import type { PackInfo } from "@/lib/studio-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Item = {
  id: string;
  name: string;
  info: Partial<PackInfo>;
  product_path: string | null;
  notes: string;
  url?: string;
};

/** Multi-product projects: each item is managed on its own (image, info, comments),
 *  and the collection view shows the whole line together. */
export function ProjectItems({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const excelRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const imgFor = useRef<string | null>(null);
  const [view, setView] = useState<"items" | "collection">("items");
  const [editing, setEditing] = useState<Item | null>(null);
  const [editInfo, setEditInfo] = useState<PackInfo>(emptyInfo);

  const items = useQuery({
    queryKey: ["project_items", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_items")
        .select("*")
        .eq("project_id", projectId)
        .order("sort")
        .order("created_at");
      if (error) throw error;
      const urls = await signedUrls((data ?? []).map((i) => i.product_path).filter(Boolean) as string[]);
      return (data ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        info: (i.info as Partial<PackInfo>) ?? {},
        product_path: i.product_path,
        notes: i.notes,
        url: i.product_path ? urls[i.product_path] : undefined,
      })) as Item[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["project_items", projectId] });

  async function addItem() {
    const { error } = await supabase.from("project_items").insert({ project_id: projectId, name: `Item ${(items.data?.length ?? 0) + 1}`, sort: items.data?.length ?? 0 });
    if (error) return toast.error(error.message);
    refresh();
  }

  async function addFromExcel(f: File) {
    try {
      const parsed = await parseItemsFile(f);
      if (!parsed.length) return toast.error("No items found — check the sheet has the header row");
      const base = items.data?.length ?? 0;
      const rows = parsed.map((it, i) => ({
        project_id: projectId,
        name: it.info.productName || it.label,
        info: it.info as never,
        sort: base + i,
      }));
      const { error } = await supabase.from("project_items").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} items added — each one is managed separately below`);
      refresh();
    } catch (e) {
      toast.error(`Couldn't read the file: ${(e as Error).message}`);
    } finally {
      if (excelRef.current) excelRef.current.value = "";
    }
  }

  async function patch(id: string, p: Record<string, unknown>) {
    const { error } = await supabase.from("project_items").update({ ...p, updated_at: new Date().toISOString() } as never).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }

  async function uploadImage(id: string, f: File) {
    try {
      const path = await uploadToStudio(`projects/${projectId}/items`, f, f.name);
      await patch(id, { product_path: path });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (imgRef.current) imgRef.current.value = "";
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("project_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  const list = items.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && addFromExcel(e.target.files[0])} />
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && imgFor.current && uploadImage(imgFor.current, e.target.files[0])} />
        <Button variant="cut" size="sm" onClick={addItem}>+ Add item · הוספת מוצר</Button>
        <Button variant="outline" size="sm" onClick={() => excelRef.current?.click()}>Import items from Excel · ייבוא מאקסל</Button>
        <div className="ml-auto flex rounded-md border">
          <button onClick={() => setView("items")} className={`px-3 py-1.5 text-xs font-mono uppercase ${view === "items" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Items · פריטים</button>
          <button onClick={() => setView("collection")} className={`px-3 py-1.5 text-xs font-mono uppercase ${view === "collection" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Collection · קולקציה</button>
        </div>
      </div>

      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">No items yet — add one by one, or import the whole items list from Excel and each row becomes a managed item.</p>
      )}

      {view === "items" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((it) => (
            <div key={it.id} className="rounded-lg border bg-card p-3">
              <button
                className="bg-grid flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-dashed text-xs text-muted-foreground hover:border-foreground"
                title="Upload product image · העלאת תמונת מוצר"
                onClick={() => {
                  imgFor.current = it.id;
                  imgRef.current?.click();
                }}
              >
                {it.url ? <img src={it.url} alt="" className="h-full w-full object-contain" /> : "+ product image"}
              </button>
              <input
                defaultValue={it.name}
                key={it.id + it.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && patch(it.id, { name: e.target.value.trim() })}
                className="mt-2 w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold hover:border-input focus:border-input focus:outline-none"
              />
              <textarea
                defaultValue={it.notes}
                key={it.id + "notes"}
                placeholder="Comments on this item · הערות על המוצר…"
                onBlur={(e) => e.target.value !== it.notes && patch(it.id, { notes: e.target.value })}
                className="mt-1 min-h-16 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(it);
                    setEditInfo({ ...emptyInfo, ...it.info });
                  }}
                >
                  Product info · מידע
                </Button>
                <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => remove(it.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-3 font-mono text-xs uppercase tracking-wider text-accent">The full collection · כל הקולקציה יחד</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {list.map((it) => (
              <figure key={it.id} className="rounded-md border bg-background p-2">
                <div className="bg-grid flex aspect-square items-center justify-center overflow-hidden rounded">
                  {it.url ? <img src={it.url} alt="" className="h-full w-full object-contain" /> : <span className="font-mono text-xs text-muted-foreground">no image</span>}
                </div>
                <figcaption className="mt-1 truncate text-sm font-semibold">{it.name}</figcaption>
                {it.info.scent && <p className="text-xs text-muted-foreground">{it.info.scent}</p>}
              </figure>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-background sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.name} — Product information</DialogTitle>
          </DialogHeader>
          <InfoForm value={editInfo} onChange={setEditInfo} />
          <Button
            variant="cut"
            onClick={() => {
              if (editing) patch(editing.id, { info: editInfo });
              setEditing(null);
              toast.success("Item info saved");
            }}
          >
            Save info
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
