import { useRef, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, uploadToStudio } from "@/lib/storage";
import { Button } from "@/components/ui/button";

type Entry = { name: string; blob: Blob };

const MAX_SIZE = 45 * 1024 * 1024; // bucket limit is 50 MB

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  ai: "application/pdf",
  eps: "application/postscript",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  psd: "image/vnd.adobe.photoshop",
  txt: "text/plain",
  csv: "text/csv",
};

/** Guess which project folder section the file belongs to, from its name/extension. */
function guessKind(name: string): string {
  const n = name.toLowerCase();
  const ext = n.split(".").pop() ?? "";
  if (/(dieline|die-line|diecut|die-cut|layout|פריסה)/.test(n) || ["pdf", "ai", "eps", "dxf", "svg"].includes(ext)) return "dieline";
  if (/(concept|קונספט)/.test(n)) return "concept";
  if (/(mockup|mock-up|3d)/.test(n)) return "mockup";
  if (/(product|מוצר)/.test(n)) return "product";
  if (/(final|print|סופי)/.test(n)) return "final";
  if (["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff", "bmp", "psd"].includes(ext)) return "artwork";
  return "docs";
}

function cleanEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => {
    const base = e.name.split("/").pop() ?? "";
    return base && !base.startsWith(".") && !e.name.includes("__MACOSX");
  });
}

/** Extract a ZIP or RAR archive in the browser into a flat list of files. */
async function extractArchive(file: File): Promise<Entry[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const out: Entry[] = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const data = await entry.async("uint8array");
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      out.push({ name: path, blob: new Blob([data as BlobPart], { type: MIME[ext] ?? "" }) });
    }
    return out;
  }
  if (lower.endsWith(".rar")) {
    const [{ createExtractorFromData }, wasm] = await Promise.all([
      import("node-unrar-js"),
      import("node-unrar-js/esm/js/unrar.wasm?url"),
    ]);
    const wasmBinary = await (await fetch(wasm.default)).arrayBuffer();
    const extractor = await createExtractorFromData({ data: await file.arrayBuffer(), wasmBinary });
    const { files } = extractor.extract();
    const out: Entry[] = [];
    for (const f of files) {
      if (f.fileHeader.flags.directory || !f.extraction) continue;
      const name = f.fileHeader.name.replace(/\\/g, "/");
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      out.push({ name, blob: new Blob([f.extraction as BlobPart], { type: MIME[ext] ?? "" }) });
    }
    return out;
  }
  throw new Error("Only ZIP and RAR archives are supported");
}

/** Upload a compressed archive (ZIP/RAR) or a whole folder; files are extracted and filed under the project. */
export function ArchiveImport({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const arcRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function fileAll(entries: Entry[], sourceLabel: string) {
    const list = cleanEntries(entries);
    if (!list.length) return toast.error("No files found inside");
    let done = 0;
    let skipped = 0;
    for (const e of list) {
      if (e.blob.size > MAX_SIZE) {
        skipped++;
        continue;
      }
      setBusy(`Uploading ${done + 1}/${list.length}: ${e.name}`);
      try {
        const label = e.name;
        const path = await uploadToStudio(`projects/${projectId}/uploads`, e.blob, e.name.split("/").pop() || e.name);
        const { error } = await supabase.from("project_files").insert({ project_id: projectId, kind: guessKind(e.name), label, path });
        if (error) throw error;
        done++;
      } catch (err) {
        toast.error(`Couldn't save ${e.name}: ${(err as Error).message}`);
      }
    }
    await logActivity(projectId, `Uploaded ${sourceLabel}: ${done} files filed${skipped ? `, ${skipped} skipped (too large)` : ""}`, "file");
    toast.success(`${done} files extracted and filed in this project${skipped ? ` — ${skipped} skipped (over 45 MB)` : ""}`);
    onDone();
  }

  async function onArchive(files: FileList | null) {
    if (!files?.length) return;
    setBusy("Extracting archive…");
    try {
      for (const f of Array.from(files)) await fileAll(await extractArchive(f), `archive ${f.name}`);
    } catch (e) {
      toast.error(`Couldn't extract the archive: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (arcRef.current) arcRef.current.value = "";
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy("Reading files…");
    try {
      await fileAll(Array.from(files).map((f) => ({ name: f.name, blob: f })), "files");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Drag-and-drop: supports dropping several folders and/or archive files at once.
  const [dragging, setDragging] = useState(false);

  async function walkEntry(entry: FileSystemEntry, prefix: string, out: Entry[]): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ name: prefix + file.name, blob: file });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns results in batches — loop until empty
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    setBusy("Reading dropped items…");
    try {
      const loose: Entry[] = [];
      const archives: File[] = [];
      const items = Array.from(e.dataTransfer.items);
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          await walkEntry(entry, "", loose);
        } else {
          const f = item.getAsFile();
          if (!f) continue;
          if (/\.(zip|rar)$/i.test(f.name)) archives.push(f);
          else loose.push({ name: f.name, blob: f });
        }
      }
      for (const arc of archives) await fileAll(await extractArchive(arc), `archive ${arc.name}`);
      if (loose.length) await fileAll(loose, loose.some((l) => l.name.includes("/")) ? "folders" : "files");
      if (!archives.length && !loose.length) toast.error("Drop folders or ZIP/RAR archives here");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onFolder(files: FileList | null) {
    if (!files?.length) return;
    setBusy("Reading folder…");
    try {
      const entries: Entry[] = Array.from(files).map((f) => ({
        name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
        blob: f,
      }));
      await fileAll(entries, "folder");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      if (dirRef.current) dirRef.current.value = "";
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 ${dragging ? "border-foreground bg-secondary" : "border-input"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input ref={arcRef} type="file" accept=".zip,.rar" multiple className="hidden" onChange={(e) => onArchive(e.target.files)} />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <input
        ref={dirRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => onFolder(e.target.files)}
      />
      <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => arcRef.current?.click()}>
        Upload archive (ZIP / RAR) · העלאת קובץ דחוס
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => dirRef.current?.click()}>
        Upload folder · העלאת פולדר
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
        Upload files · העלאת קבצים
      </Button>
      {busy ? (
        <span className="font-mono text-xs text-muted-foreground">{busy}</span>
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">or drag folders / archives here — several folders at once works too</span>
      )}
    </div>
  );
}
