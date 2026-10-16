import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Cloud, Folder, File, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, uploadToStudio } from "@/lib/storage";
import { guessKind, MAX_SIZE } from "@/components/ArchiveImport";
import { downloadDriveItem, listDriveItems, type DriveItem, type DriveProvider } from "@/lib/cloud-drive.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PROVIDERS: { id: DriveProvider; label: string }[] = [
  { id: "google", label: "Google Drive" },
  { id: "onedrive", label: "OneDrive" },
];

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Browse Google Drive / OneDrive and import selected files into the project. */
export function CloudImport({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const list = useServerFn(listDriveItems);
  const download = useServerFn(downloadDriveItem);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<DriveProvider | null>(null);
  const [path, setPath] = useState<{ id?: string; name: string }[]>([]);
  const [items, setItems] = useState<DriveItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  async function load(p: DriveProvider, folderId?: string) {
    setLoading(true);
    setItems(null);
    setSelected(new Set());
    try {
      const { items } = await list({ data: { provider: p, folderId } });
      setItems(items);
    } catch (e) {
      toast.error((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function openProvider(p: DriveProvider) {
    setProvider(p);
    setPath([{ name: p === "google" ? "My Drive" : "OneDrive" }]);
    void load(p);
  }

  function enterFolder(item: DriveItem) {
    if (!provider) return;
    setPath((prev) => [...prev, { id: item.id, name: item.name }]);
    void load(provider, item.id);
  }

  function goBack() {
    if (!provider || path.length <= 1) return;
    const next = path.slice(0, -1);
    setPath(next);
    void load(provider, next[next.length - 1].id);
  }

  function toggle(item: DriveItem) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  async function importSelected() {
    if (!provider || !items) return;
    const chosen = items.filter((i) => selected.has(i.id) && !i.isFolder);
    if (!chosen.length) return toast.error("Select at least one file");
    let done = 0;
    let skipped = 0;
    for (const item of chosen) {
      if (item.size > MAX_SIZE) {
        skipped++;
        continue;
      }
      setBusy(`Importing ${done + 1}/${chosen.length}: ${item.name}`);
      try {
        const file = await download({ data: { provider, fileId: item.id, name: item.name } });
        const blob = base64ToBlob(file.base64, file.mimeType);
        const path = await uploadToStudio(`projects/${projectId}/uploads`, blob, item.name);
        const { error } = await supabase.from("project_files").insert({ project_id: projectId, kind: guessKind(item.name), label: item.name, path });
        if (error) throw error;
        done++;
      } catch (e) {
        toast.error(`Couldn't import ${item.name}: ${(e as Error).message}`);
      }
    }
    await logActivity(projectId, `Imported from ${provider === "google" ? "Google Drive" : "OneDrive"}: ${done} files filed${skipped ? `, ${skipped} skipped (too large)` : ""}`, "file");
    toast.success(`${done} files imported into this project${skipped ? ` — ${skipped} skipped (over 45 MB)` : ""}`);
    setBusy(null);
    setOpen(false);
    onDone();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => setOpen(true)}>
        <Cloud className="size-4" /> Import from cloud · ייבוא מהענן
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from cloud · ייבוא מהענן</DialogTitle>
          </DialogHeader>
          {!provider ? (
            <div className="grid grid-cols-2 gap-3 py-4">
              {PROVIDERS.map((p) => (
                <Button key={p.id} variant="outline" className="h-16" onClick={() => openProvider(p.id)}>
                  {p.label}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Button variant="ghost" size="sm" onClick={() => setProvider(null)}>‹ {provider === "google" ? "Google Drive" : "OneDrive"}</Button>
                {path.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={goBack}>
                    <ArrowLeft className="size-3.5" /> Back
                  </Button>
                )}
                <span className="truncate font-mono text-xs text-muted-foreground">{path.map((p) => p.name).join(" / ")}</span>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Loading…
                  </div>
                ) : !items?.length ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">This folder is empty</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
                      {item.isFolder ? (
                        <button className="flex flex-1 items-center gap-2 text-left hover:text-accent" onClick={() => enterFolder(item)}>
                          <Folder className="size-4 shrink-0" /> <span className="truncate">{item.name}</span>
                        </button>
                      ) : (
                        <label className="flex flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item)} />
                          <File className="size-4 shrink-0" />
                          <span className="truncate">{item.name}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                        </label>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{busy ?? `${selected.size} selected`}</span>
                <Button size="sm" variant="cut" disabled={!!busy || !selected.size} onClick={importSelected}>
                  Import selected · ייבוא
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
