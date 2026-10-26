import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/prefs";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Exact, no-AI transfer: the design image is composited onto the dieline
 * pixel-for-pixel. Drag to position, use the slider to scale, then apply.
 * Nothing is redrawn, translated or restyled — the output is the original pixels.
 */
export function ManualPlacement({
  dieline,
  designs,
  onApply,
}: {
  dieline: string;
  designs: string[];
  onApply: (pngDataUrl: string) => void;
}) {
  const { lang } = usePrefs();
  const he = lang === "he";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [designIdx, setDesignIdx] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [imgs, setImgs] = useState<{ dl?: HTMLImageElement; ds: HTMLImageElement[] }>({ ds: [] });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const W = 1200;
  const H = 600;

  useEffect(() => {
    (async () => {
      const [dl, ...ds] = await Promise.all([loadImage(dieline), ...designs.map(loadImage)]);
      setImgs({ dl, ds });
    })().catch(() => undefined);
  }, [dieline, designs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dl = imgs.dl;
    const design = imgs.ds[designIdx];
    if (!canvas || !dl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    // Fit the dieline into the canvas, centered.
    const fit = Math.min(W / dl.width, H / dl.height);
    const dw = dl.width * fit;
    const dh = dl.height * fit;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    ctx.drawImage(dl, dx, dy, dw, dh);
    if (design) {
      const base = Math.min(dw / design.width, dh / design.height) * scale;
      const w = design.width * base;
      const h = design.height * base;
      ctx.drawImage(design, dx + dw / 2 - w / 2 + pos.x, dy + dh / 2 - h / 2 + pos.y, w, h);
    }
  }, [imgs, designIdx, pos, scale]);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>, phase: "down" | "move" | "up") {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (phase === "down") {
      drag.current = { sx: x, sy: y, ox: pos.x, oy: pos.y };
      canvas.setPointerCapture(e.pointerId);
    } else if (phase === "move" && drag.current) {
      setPos({ x: drag.current.ox + x - drag.current.sx, y: drag.current.oy + y - drag.current.sy });
    } else if (phase === "up") {
      drag.current = null;
    }
  }

  function apply() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onApply(canvas.toDataURL("image/png"));
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-accent">
        {he ? "העברה מדויקת — בלי AI, בלי שינויים" : "Exact transfer — no AI, no changes"}
      </p>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full cursor-move touch-none rounded-md border bg-white"
        onPointerDown={(e) => pointer(e, "down")}
        onPointerMove={(e) => pointer(e, "move")}
        onPointerUp={(e) => pointer(e, "up")}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {designs.length > 1 && (
          <div className="flex gap-1.5">
            {designs.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDesignIdx(i);
                  setPos({ x: 0, y: 0 });
                  setScale(1);
                }}
                className={`overflow-hidden rounded-md border ${i === designIdx ? "ring-2 ring-accent" : ""}`}
              >
                <img src={src} alt="" className="size-12 object-cover" />
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {he ? "גודל" : "Size"}
          <input
            type="range"
            min={0.2}
            max={2.5}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-32 accent-accent"
          />
        </label>
        <Button size="sm" variant="outline" onClick={() => { setPos({ x: 0, y: 0 }); setScale(1); }}>
          {he ? "איפוס" : "Reset"}
        </Button>
        <Button size="sm" onClick={apply}>
          {he ? "החלה על הפריסה" : "Apply to dieline"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {he
          ? "גוררים את העיצוב למקום, מתאימים גודל ולוחצים \"החלה\". העיצוב נשאר פיקסל-לפיקסל כמו המקור — אפשר לייצא ל-SVG / AI."
          : "Drag the design into place, adjust size and press Apply. The design stays pixel-for-pixel like the original — ready for SVG / AI export."}
      </p>
    </div>
  );
}
