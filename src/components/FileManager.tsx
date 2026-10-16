import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, Download, LayoutGrid, List, Square, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToStudio } from "@/lib/storage";
import { usePrefs, type DictKey } from "@/lib/prefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ProjectFile = {
  id: string;
  kind: string;
  label: string;
  path: string;
  created_at: string;
  url?: string | undefined;
};

const KINDS = ["product", "concept", "mockup", "dieline", "artwork", "final", "docs"] as const;

export function FileManager({ projectId, files, onChanged }: { projectId: string; files: ProjectFile[]; onChanged: () => void }) {
  const { t } = usePrefs();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [sort, setSort] = useState<"new" | "old" | "name">("new");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    let out = files.filter((f) => (kind === "all" || f.kind === kind) && f.label.toLowerCase().includes(q.toLowerCase()));
    out = [...out].sort((a, b) =>
      sort === "name" ? a.label.localeCompare(b.label) : sort === "old" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at),
    );
    return out;
  }, [files, q, kind, sort]);

  async function upload(listIn: FileList | null) {
    if (!listIn?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(listIn)) {
        const path = await uploadToStudio(projectId, f, f.name);
        await supabase.from("project_files").insert({ project_id: projectId, kind: "docs", label: f.name, path });
      }
      onChanged();
      toast.success(`${listIn.length} ✓`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadOne(f: ProjectFile) {
    const { data, error } = await supabase.storage.from("studio").createSignedUrl(f.path, 60, { download: f.label.split("/").pop() || true });
    if (error || !data) return toast.error("Couldn't create a download link");
    window.open(data.signedUrl, "_blank");
  }

  async function remove(ids: string[]) {
    const rows = files.filter((f) => ids.includes(f.id));
    await supabase.storage.from("studio").remove(rows.map((f) => f.path));
    await supabase.from("project_files").delete().in("id", ids);
    setSelected(new Set());
    setSelecting(false);
    onChanged();
    toast.success(t("fm.delete") + " ✓");
  }

  const sel = list.filter((f) => selected.has(f.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input placeholder={t("fm.search")} value={q} onChange={(e) => setQ(e.target.value)} className="w-52 bg-background" />
        <div className="flex flex-wrap gap-1">
          {["all", ...KINDS].map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${kind === k ? "border-accent text-accent ring-1 ring-accent" : "text-muted-foreground hover:border-foreground"}`}
            >
              {k === "all" ? t("fm.all") : t(`kind.${k}` as DictKey)}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="new">{t("fm.sort.new")}</option>
          <option value="old">{t("fm.sort.old")}</option>
          <option value="name">{t("fm.sort.name")}</option>
        </select>
        <div className="ms-auto flex items-center gap-1">
          <button title={t("fm.upload")} onClick={() => uploadRef.current?.click()} disabled={busy} className="grid size-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:border-accent hover:text-accent">
            <Upload className="size-4" />
          </button>
          <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          <button title={view === "grid" ? "list" : "grid"} onClick={() => setView(view === "grid" ? "list" : "grid")} className="grid size-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:border-accent hover:text-accent">
            {view === "grid" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
          </button>
          <Button size="sm" variant={selecting ? "cut" : "outline"} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
            {t("fm.select")}
          </Button>
        </div>
      </div>

      {selecting && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/50 px-3 py-2 text-sm">
          <button className="inline-flex items-center gap-1.5 hover:text-accent" onClick={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((f) => f.id)))}>
            {selected.size === list.length && list.length > 0 ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
            {t("fm.selectall")}
          </button>
          <span className="font-mono text-xs text-muted-foreground">{selected.size} / {list.length}</span>
          <div className="ms-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={!sel.length} onClick={() => sel.forEach((f) => void downloadOne(f))}>
              <Download className="size-4" /> {t("fm.download")}
            </Button>
            <Button size="sm" variant="destructive" disabled={!sel.length} onClick={() => { if (window.confirm(t("fm.confirmdelete"))) void remove([...selected]); }}>
              <Trash2 className="size-4" /> {t("fm.delete")}
            </Button>
          </div>
        </div>
      )}

      <div className={view === "grid" ? "grid grid-cols-2 gap-3 p-3 md:grid-cols-4 lg:grid-cols-6" : "divide-y"}>
        {list.map((f) => {
          const isImg = f.url && /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.path);
          const thumb = isImg ? (
            <img src={f.url} alt="" className={view === "grid" ? "aspect-square w-full rounded object-cover" : "size-10 rounded object-cover"} />
          ) : (
            <div className={`bg-grid flex items-center justify-center rounded bg-muted font-mono text-xs uppercase ${view === "grid" ? "aspect-square" : "size-10"}`}>
              {f.path.split(".").pop()}
            </div>
          );
          const actions = (
            <div className="flex items-center gap-1">
              <button aria-label={t("fm.download")} title={t("fm.download")} className="shrink-0 p-1 text-muted-foreground hover:text-foreground" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void downloadOne(f); }}>
                <Download className="size-4" />
              </button>
              <button aria-label={t("fm.delete")} title={t("fm.delete")} className="shrink-0 p-1 text-muted-foreground hover:text-destructive" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void remove([f.id]); }}>
                <Trash2 className="size-4" />
              </button>
            </div>
          );
          const body = view === "grid" ? (
            <>
              {thumb}
              <div className="flex items-center justify-between gap-1 px-1 pt-1">
                <p className="truncate text-[11px]">{f.label}</p>
                {actions}
              </div>
              <p className="px-1 font-mono text-[10px] text-muted-foreground">
                {t(`kind.${f.kind}` as DictKey) !== `kind.${f.kind}` ? t(`kind.${f.kind}` as DictKey) : f.kind} · {new Date(f.created_at).toLocaleDateString()}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2">
              {thumb}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{f.label}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{f.kind} · {new Date(f.created_at).toLocaleString()}</p>
              </div>
              {actions}
            </div>
          );
          return selecting ? (
            <button key={f.id} onClick={() => toggle(f.id)} className={`relative rounded-md border bg-card p-1 text-start transition-colors ${selected.has(f.id) ? "border-accent ring-1 ring-accent" : "hover:border-foreground"}`}>
              {view === "list" ? body : body}
              <span className="absolute end-1.5 top-1.5 rounded bg-background/80 text-accent">{selected.has(f.id) ? <CheckSquare className="size-4" /> : <Square className="size-4 text-muted-foreground" />}</span>
            </button>
          ) : (
            <div key={f.id} className={`rounded-md border bg-card transition-colors hover:border-foreground ${view === "grid" ? "p-1" : ""}`}>{body}</div>
          );
        })}
        {list.length === 0 && <p className="col-span-full px-3 py-10 text-center text-sm text-muted-foreground">{t("fm.empty")}</p>}
      </div>
    </section>
  );
}
