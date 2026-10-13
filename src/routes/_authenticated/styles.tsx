import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedUrls, uploadToStudio } from "@/lib/storage";
import { extractInfo, fileToDataUrl } from "@/lib/studio-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/styles")({
  head: () => ({ meta: [{ title: "Style guides — Dieline Studio" }, { name: "description", content: "Brand and licensed style guide library." }] }),
  component: Styles,
});

type Guide = {
  id: string;
  name: string;
  brand: string;
  kind: string;
  colors: string;
  fonts: string;
  imagery: string;
  directions: string;
  notes: string;
  image_paths: string[];
};
const blank: Omit<Guide, "id"> = { name: "", brand: "", kind: "uploaded", colors: "", fonts: "", imagery: "", directions: "", notes: "", image_paths: [] };

function Styles() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<(Omit<Guide, "id"> & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["style_guides"],
    queryFn: async () => {
      const { data, error } = await supabase.from("style_guides").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      const urls = await signedUrls((data ?? []).flatMap((g) => g.image_paths.slice(0, 4)));
      return { guides: data as Guide[], urls };
    },
  });

  async function addImages(files: FileList | null) {
    if (!files || !edit) return;
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const f of Array.from(files).slice(0, 12)) paths.push(await uploadToStudio("style-guides", f, f.name));
      const next = { ...edit, image_paths: [...edit.image_paths, ...paths] };
      // Let AI read colors / fonts / imagery from the first page if fields are empty
      if (!edit.colors && files[0]?.type.startsWith("image/")) {
        const r = await extractInfo(await fileToDataUrl(files[0])).catch(() => null);
        if (r?.styleNotes) next.notes = next.notes ? next.notes : r.styleNotes;
      }
      setEdit(next);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!edit?.name.trim()) return toast.error("Name the style guide");
    const { id, ...row } = edit;
    const res = id
      ? await supabase.from("style_guides").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id)
      : await supabase.from("style_guides").insert(row);
    if (res.error) return toast.error(res.error.message);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["style_guides"] });
    toast.success("Style guide saved");
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this style guide?")) return;
    await supabase.from("style_guides").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["style_guides"] });
  }

  return (
    <main className="mx-auto max-w-[1500px] px-6 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">library</p>
          <h1 className="text-4xl font-extrabold tracking-tight">Style guides</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your own brand guides, licensed character guides, and guides saved from approved projects.</p>
        </div>
        <Button variant="cut" onClick={() => setEdit({ ...blank })}>+ New style guide</Button>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data?.guides.map((g) => (
          <div key={g.id} className="crop-marks rounded-lg border bg-card p-4">
            <div className="grid grid-cols-4 gap-1">
              {g.image_paths.slice(0, 4).map((p) => (
                <img key={p} src={data.urls[p]} alt="" className="aspect-square w-full rounded border object-cover" />
              ))}
              {g.image_paths.length === 0 && <div className="bg-grid col-span-4 h-20 rounded border bg-muted" />}
            </div>
            <p className="mt-3 font-mono text-[11px] uppercase text-accent">{g.kind === "generated" ? "from a project" : "uploaded guide"} · {g.brand || "—"}</p>
            <h3 className="text-lg font-bold">{g.name}</h3>
            <p className="line-clamp-3 text-sm text-muted-foreground">{g.directions || g.colors || g.notes}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEdit(g)}>Open</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(g.id)}>Delete</Button>
            </div>
          </div>
        ))}
        {data && data.guides.length === 0 && <p className="text-sm text-muted-foreground">No style guides yet.</p>}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto bg-background sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit style guide" : "New style guide"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="bg-card" placeholder="Hello Kitty – Classic" /></div>
                <div className="space-y-1"><Label>Brand / license</Label><Input value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} className="bg-card" placeholder="Sanrio" /></div>
              </div>
              {(
                [
                  ["colors", "Colors (names + hex)"],
                  ["fonts", "Fonts & typography"],
                  ["imagery", "Characters, images & graphic elements"],
                  ["directions", "Sub-styles / directions (one per line — the chat will ask which one)"],
                  ["notes", "Usage rules & other notes"],
                ] as const
              ).map(([k, l]) => (
                <div key={k} className="space-y-1">
                  <Label>{l}</Label>
                  <Textarea value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="min-h-16 bg-card" />
                </div>
              ))}
              <div className="space-y-1">
                <Label>Guide pages & reference images ({edit.image_paths.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {edit.image_paths.map((p) => (
                    <button key={p} title="Remove" onClick={() => setEdit({ ...edit, image_paths: edit.image_paths.filter((x) => x !== p) })} className="rounded border px-2 py-1 font-mono text-[11px] hover:border-destructive">
                      {p.split("/").pop()?.slice(14, 34)} ✕
                    </button>
                  ))}
                </div>
                <Input type="file" multiple accept="image/*" disabled={busy} onChange={(e) => addImages(e.target.files)} className="bg-card" />
                <p className="text-xs text-muted-foreground">Upload guide pages as images (PNG/JPG). The first 4 are shown to the AI when designing.</p>
              </div>
              <Button variant="cut" onClick={save} disabled={busy}>{busy ? "Uploading…" : "Save style guide"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
