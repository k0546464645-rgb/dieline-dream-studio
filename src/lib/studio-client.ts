import { createParser } from "eventsource-parser";

export type ChatMsg = { role: "user" | "assistant"; text: string };

export async function streamConcept(
  messages: ChatMsg[],
  productImage: string | undefined,
  onDelta: (t: string) => void,
) {
  const res = await fetch("/api/concept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, productImage }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    let msg = t;
    try {
      msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? t;
    } catch {
      /* keep text */
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  let err: string | undefined;
  const parser = createParser({
    onEvent(ev) {
      try {
        const p = JSON.parse(ev.data);
        const type = ev.event || p.type;
        if (type === "response.output_text.delta" && typeof p.delta === "string") onDelta(p.delta);
        if (type === "error" || type === "response.failed")
          err = p?.error?.message ?? p?.response?.error?.message ?? "Concept generation failed";
      } catch {
        /* ignore */
      }
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(value);
  }
  if (err) throw new Error(err);
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

/** Converts an uploaded dieline (PNG/JPG/PDF/PDF-compatible .ai) to a PNG data URL. */
export async function dielineToPng(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/") && !name.endsWith(".eps")) {
    return fileToDataUrl(file);
  }
  if (name.endsWith(".eps")) {
    throw new Error("EPS files can't be read in the browser. In Illustrator, use File > Save As > PDF, then upload that.");
  }
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: buf }).promise;
  } catch {
    throw new Error(
      "Couldn't read this file. For .ai files, re-save with 'Create PDF Compatible File' checked, or export as PDF.",
    );
  }
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 2048 / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas.toDataURL("image/png");
}

/** Builds a layered SVG (Artwork + Dieline layers) that opens in Illustrator. */
export async function buildLayeredSvg(artwork: string, dieline: string, title: string) {
  const { w, h } = await imageSize(dieline);
  const esc = (s: string) => s.replace(/[<&>"]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}px" height="${h}px" viewBox="0 0 ${w} ${h}">
  <title>${esc(title)}</title>
  <g id="Artwork" data-name="Artwork">
    <image width="${w}" height="${h}" preserveAspectRatio="none" xlink:href="${artwork}"/>
  </g>
  <g id="Dieline" data-name="Dieline" style="mix-blend-mode:multiply">
    <image width="${w}" height="${h}" preserveAspectRatio="none" xlink:href="${dieline}"/>
  </g>
</svg>`;
}

export function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
