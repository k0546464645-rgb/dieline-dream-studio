/**
 * Pixel-exact placement: crops the faces of the ORIGINAL design images and
 * pastes them onto the detected dieline panels. Nothing is redrawn, so text
 * (Hebrew/English) and graphics stay identical to the source.
 */
export type PanelName = "front" | "back" | "left" | "right" | "top" | "bottom" | "other";
export type Box = { x: number; y: number; w: number; h: number };
export type DielineLayout = {
  panels: (Box & { name: PanelName; rotation: number })[];
  sources: (Box & { image: number; panel: PanelName })[];
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Average colour of the crop's border — used to fill the panel around the face. */
function edgeColor(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  if (!ctx) return "#ffffff";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < 32; i++) {
    for (const [x, y] of [[i, 0], [i, 31], [0, i], [31, i]] as const) {
      const o = (y * 32 + x) * 4;
      r += d[o] ?? 0;
      g += d[o + 1] ?? 0;
      b += d[o + 2] ?? 0;
      n++;
    }
  }
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
}

export async function composeExact(opts: {
  dieline: string;
  designs: string[];
  layout: DielineLayout;
  base?: string | undefined;
}): Promise<string> {
  const dl = await loadImage(opts.dieline);
  const designs = await Promise.all(opts.designs.map(loadImage));
  const base = opts.base ? await loadImage(opts.base) : undefined;
  const scale = Math.min(1, 2400 / Math.max(dl.width, dl.height)) || 1;
  const W = Math.round(dl.width * scale);
  const H = Math.round(dl.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  if (base) ctx.drawImage(base, 0, 0, W, H);

  let placed = 0;
  const used = new Set<PanelName>();
  for (const src of opts.layout.sources) {
    const img = designs[src.image - 1];
    if (!img || used.has(src.panel)) continue;
    const panel = opts.layout.panels.find((p) => p.name === src.panel);
    if (!panel) continue;
    used.add(src.panel);
    const sx = clamp(src.x) * img.width;
    const sy = clamp(src.y) * img.height;
    const sw = Math.max(1, clamp(src.w) * img.width);
    const sh = Math.max(1, clamp(src.h) * img.height);
    const px = clamp(panel.x) * W;
    const py = clamp(panel.y) * H;
    const pw = clamp(panel.w) * W;
    const ph = clamp(panel.h) * H;
    const rot = ((Math.round(panel.rotation / 90) % 4) + 4) % 4;
    // Target size in the panel's own (rotated) frame
    const tw = rot % 2 ? ph : pw;
    const th = rot % 2 ? pw : ph;
    const fit = Math.min(tw / sw, th / sh);
    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.rotate((rot * Math.PI) / 2);
    ctx.fillStyle = edgeColor(img, sx, sy, sw, sh);
    ctx.fillRect(-tw / 2, -th / 2, tw, th);
    ctx.drawImage(img, sx, sy, sw, sh, (-sw * fit) / 2, (-sh * fit) / 2, sw * fit, sh * fit);
    ctx.restore();
    placed++;
  }
  if (!placed) throw new Error("No matching panels found");

  // Keep the cut/fold lines visible on top
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(dl, 0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  return canvas.toDataURL("image/png");
}
