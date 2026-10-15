import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseItemsFile, type ImportedItem } from "@/lib/items-import";
import type { PackInfo } from "@/lib/studio-client";

/** Upload an Excel/CSV sheet of items; picking one fills the product information form. */
export function ItemsImport({ onPick }: { onPick: (info: Partial<PackInfo>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImportedItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(f: File) {
    setBusy(true);
    try {
      const parsed = await parseItemsFile(f);
      if (!parsed.length) return toast.error("No items found — check the sheet has the header row (Brand, Item no, Barcode…)");
      setItems(parsed);
      toast.success(`Found ${parsed.length} items in the file`);
    } catch (e) {
      toast.error(`Couldn't read the file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Drag handlers: dropping an Excel file on the button reads it directly.
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={dragging ? "border-dashed border-foreground" : undefined}
      >
        {busy ? "Reading file…" : "Import items from Excel — or drag the file here"}
      </Button>
      <Dialog open={!!items} onOpenChange={(o) => !o && setItems(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle>Choose an item to load</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {(items ?? []).map((it, i) => (
              <button
                key={i}
                className="rounded-md border bg-card px-4 py-3 text-right text-sm transition-colors hover:border-foreground"
                onClick={() => {
                  onPick(it.info);
                  setItems(null);
                  toast.success("Item loaded into the form — review the fields");
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
