import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/stream-image";
import { download } from "@/lib/studio-client";

export type ConceptOption = { n: string; name: string; body: string };

export function parseConcepts(text: string): ConceptOption[] {
  const re = /^#{1,3}\s*Concept\s*(\d+)\s*[:\-–—]\s*(.+)$/gim;
  const hits = [...text.matchAll(re)];
  return hits.map((m, i) => ({
    n: m[1]!,
    name: m[2]!.replace(/\*/g, "").trim(),
    body: text.slice((m.index ?? 0) + m[0].length, hits[i + 1]?.index ?? text.length).replace(/\*\*|`/g, "").trim(),
  }));
}

function Preview({ src, final, busy }: { src?: string | undefined; final?: boolean | undefined; busy?: boolean | undefined }) {
  return (
    <div className="bg-grid flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted">
      {src ? (
        <img
          src={src}
          alt=""
          className={`h-full w-full object-contain transition-[filter] duration-700 ${final ? "blur-0" : "blur-2xl"}`}
        />
      ) : (
        <p className="px-4 text-center font-mono text-xs text-muted-foreground">
          {busy ? "Rendering…" : "No visual yet"}
        </p>
      )}
    </div>
  );
}

export function DesignBoard({
  open,
  onOpenChange,
  productFile,
  options,
  approved,
  thinking,
  mockup,
  mockupFinal,
  mockBusy,
  onChoose,
  onRender,
  onRefine,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  productFile?: File | undefined;
  options: ConceptOption[];
  approved: string;
  thinking: boolean;
  mockup?: string | undefined;
  mockupFinal: boolean;
  mockBusy: boolean;
  onChoose: (o: ConceptOption) => void;
  onRender: () => void;
  onRefine: (text: string) => void;
}) {
  const [previews, setPreviews] = useState<Record<string, { src: string; final: boolean }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [refine, setRefine] = useState("");

  async function preview(o: ConceptOption) {
    if (!productFile) return;
    setBusy((b) => ({ ...b, [o.n]: true }));
    const form = new FormData();
    form.append(
      "prompt",
      `Photorealistic 3D studio render of THIS exact product (keep its real shape, proportions and material) with packaging graphics in this design direction. Three-quarter front view, soft light, neutral backdrop.\n\nDIRECTION "${o.name}":\n${o.body.slice(0, 2000)}`,
    );
    form.append("image[]", productFile);
    try {
      await streamImage("/api/edit-image", form, (src, final) =>
        setPreviews((p) => ({ ...p, [o.n]: { src, final } })),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [o.n]: false }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[min(1400px,95vw)] overflow-y-auto bg-background sm:max-w-[min(1400px,95vw)]">
        <DialogHeader>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Design board</p>
          <DialogTitle className="text-3xl font-extrabold tracking-tight">
            {approved ? "Approved design" : "Choose a direction"}
          </DialogTitle>
          <DialogDescription>
            {approved
              ? "Review the final design, re-render it or ask for changes."
              : "Preview each concept on your product, then choose the direction to develop."}
          </DialogDescription>
        </DialogHeader>

        {thinking && (
          <p className="font-mono text-xs text-muted-foreground">The designer is writing… this updates live.</p>
        )}

        {approved ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Preview src={mockup} final={mockupFinal} busy={mockBusy} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="cut" onClick={onRender} disabled={mockBusy || thinking}>
                  {mockBusy ? "Rendering…" : mockup ? "Re-render design" : "Render design"}
                </Button>
                {mockup && mockupFinal && (
                  <Button variant="outline" onClick={() => download(mockup, "design.png")}>
                    Download PNG
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-4 text-sm leading-relaxed">
                {approved}
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={refine}
                  onChange={(e) => setRefine(e.target.value)}
                  placeholder="Ask for changes, e.g. warmer colors, bigger logo…"
                  className="min-h-[52px] resize-none bg-background"
                />
                <Button
                  className="h-auto"
                  disabled={!refine.trim() || thinking}
                  onClick={() => {
                    onRefine(refine.trim());
                    setRefine("");
                  }}
                >
                  Update
                </Button>
              </div>
            </div>
          </div>
        ) : options.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No concepts yet.</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {options.map((o) => (
              <div key={o.n} className="crop-marks flex flex-col rounded-lg border bg-card p-4">
                <p className="font-mono text-xs text-accent">CONCEPT {o.n}</p>
                <h3 className="mb-3 text-xl font-bold tracking-tight">{o.name}</h3>
                <Preview src={previews[o.n]?.src} final={previews[o.n]?.final} busy={busy[o.n]} />
                <div className="mt-3 max-h-48 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {o.body}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => preview(o)} disabled={busy[o.n] || !productFile}>
                    {busy[o.n] ? "Rendering…" : previews[o.n] ? "Re-render" : "Visual preview"}
                  </Button>
                  <Button variant="cut" size="sm" onClick={() => onChoose(o)} disabled={thinking}>
                    Choose this direction
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
