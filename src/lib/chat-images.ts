import { fileToDataUrl } from "@/lib/studio-client";

/** Max images that can travel with a single chat message. */
export const MAX_CHAT_IMAGES = 4;

export function imageFilesFrom(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.type.startsWith("image/"));
}

/** Image files carried by a drop or paste event (folders dropped alongside files are skipped). */
export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  if (dt.items?.length) {
    Array.from(dt.items).forEach((it) => {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    });
  } else if (dt.files) {
    Array.from(dt.files).forEach((f) => out.push(f));
  }
  return imageFilesFrom(out);
}

/** Reads an image file and downscales it so it can travel with a chat message. */
export async function fileToChatImage(file: File, max = 896): Promise<string> {
  return resizeDataUrl(await fileToDataUrl(file), max);
}

function resizeDataUrl(src: string, max: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || max;
      const h = img.naturalHeight || max;
      const scale = Math.min(1, max / Math.max(w, h));
      if (scale >= 1 && src.length < 300_000) return resolve(src);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const c = canvas.getContext("2d");
      if (!c) return resolve(src);
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
