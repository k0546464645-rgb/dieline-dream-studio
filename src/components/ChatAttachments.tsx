import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { MAX_CHAT_IMAGES, fileToChatImage, filesFromDataTransfer, imageFilesFrom } from "@/lib/chat-images";

export type ChatAttachments = {
  images: string[];
  addFiles: (files: File[]) => void;
  remove: (i: number) => void;
  clear: () => void;
};

/** Holds the images a designer drags, pastes or picks into a chat box. */
export function useChatAttachments(): ChatAttachments {
  const [images, setImages] = useState<string[]>([]);
  const taken = useRef(0);

  const addFiles = useCallback((files: File[]) => {
    const room = Math.max(0, MAX_CHAT_IMAGES - taken.current);
    const imgs = imageFilesFrom(files).slice(0, room);
    if (!imgs.length) return;
    taken.current += imgs.length;
    void Promise.all(imgs.map((f) => fileToChatImage(f))).then((urls) =>
      setImages((cur) => [...cur, ...urls].slice(0, MAX_CHAT_IMAGES)),
    );
  }, []);

  const remove = useCallback((i: number) => {
    taken.current = Math.max(0, taken.current - 1);
    setImages((cur) => cur.filter((_, j) => j !== i));
  }, []);

  const clear = useCallback(() => {
    taken.current = 0;
    setImages([]);
  }, []);

  return { images, addFiles, remove, clear };
}

/** Turns any element into a drop target for images. Returns true while a drag hovers it. */
export function useImageDrop(ref: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const carriesFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
      setOver(true);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget && el.contains(e.relatedTarget as Node)) return;
      setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      setOver(false);
      onFiles(filesFromDataTransfer(e.dataTransfer));
    };
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [ref, onFiles]);

  return over;
}

/** Thumbnails of the images waiting to be sent, each one removable. */
export function AttachmentStrip({ images, onRemove }: { images: string[]; onRemove: (i: number) => void }) {
  if (!images.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
      {images.map((src, i) => (
        <div key={i} className="relative">
          <img src={src} alt="" className="size-14 rounded-md border object-cover" />
          <button
            type="button"
            aria-label={`Remove image ${i + 1}`}
            onClick={() => onRemove(i)}
            className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-destructive text-destructive-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <span className="font-mono text-[11px] text-muted-foreground">
        {images.length}/{MAX_CHAT_IMAGES} attached · מצורפות
      </span>
    </div>
  );
}
