import { useRef, useState } from "react";
import { Download, ImageUp, Loader2, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authHeaders, download, fileToDataUrl } from "@/lib/studio-client";
import { streamImage } from "@/lib/stream-image";
import { usePrefs } from "@/lib/prefs";

export function BackgroundRemoval() {
  const { lang } = usePrefs();
  const he = lang === "he";
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [original, setOriginal] = useState("");
  const [result, setResult] = useState("");
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  async function process() {
    if (!file || busy) return;
    setBusy(true); setError(""); setResult(""); setFinal(false);
    const form = new FormData();
    form.append("purpose", "remove-background"); form.append("image", file);
    try {
      await streamImage("/api/edit-image", form, (src, done) => { setResult(src); setFinal(done); }, undefined, await authHeaders());
    } catch (e) { setError(e instanceof Error ? e.message : (he ? "צריבת הרקע נכשלה" : "Background removal failed")); setFinal(false); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Scissors className="size-4" />{he ? "צריבת רקע" : "Remove background"}</Button>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{he ? "צריבת רקע" : "Remove background"}</DialogTitle></DialogHeader>
      <input ref={picker} type="file" accept="image/*" className="hidden" aria-label={he ? "תמונה לצריבת רקע" : "Image to remove background"} onChange={async (e) => {
        const chosen = e.target.files?.[0]; e.target.value = ""; if (!chosen) return;
        setFile(chosen); setResult(""); setFinal(false); setError(""); setOriginal(await fileToDataUrl(chosen));
      }} />
      <Button variant="outline" disabled={busy} onClick={() => picker.current?.click()}><ImageUp className="size-4" />{he ? "טעינת תמונה" : "Upload image"}</Button>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="mb-2 text-sm text-muted-foreground">{he ? "מקור" : "Original"}</p><div className="flex aspect-square items-center justify-center rounded-lg border bg-secondary">{original && <img src={original} alt={he ? "תמונת מקור" : "Original image"} className="h-full w-full object-contain" />}</div></div>
        <div><p className="mb-2 text-sm text-muted-foreground">{he ? "מוצר ללא רקע" : "Product cutout"}</p><div className="flex aspect-square items-center justify-center rounded-lg border bg-grid">{result ? <img src={result} alt={he ? "מוצר ללא רקע" : "Product cutout"} className={`h-full w-full object-contain transition-[filter] ${final ? "blur-0" : "blur-2xl"}`} /> : busy && <Loader2 className="size-6 animate-spin text-accent" />}</div></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button onClick={process} disabled={!file || busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}{busy ? (he ? "צורב רקע…" : "Removing background…") : (he ? "צריבת רקע" : "Remove background")}</Button>{final && !busy && <Button variant="outline" onClick={() => download(result, "product-cutout.png")}><Download className="size-4" />{he ? "הורדת PNG שקוף" : "Download transparent PNG"}</Button>}</div>
    </DialogContent>
  </Dialog>;
}