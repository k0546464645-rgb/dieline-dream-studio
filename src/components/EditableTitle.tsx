import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { usePrefs, type DictKey } from "@/lib/prefs";

type Tag = "h1" | "h2" | "h3" | "p" | "span";

/** Inline-editable title: hover to reveal a pencil, click to rename. Custom names persist on this device. */
export function EditableTitle({
  k,
  as = "span",
  className,
  inline,
}: {
  k: DictKey;
  as?: Tag;
  className?: string | undefined;
  inline?: boolean | undefined;
}) {
  const { t, lang, titles, setTitle } = usePrefs();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const Tag = as;
  const current = titles[k] || t(k);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <Tag className={className}>
        <input
          ref={ref}
          value={draft}
          dir="auto"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setTitle(k, draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setTitle(k, draft);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          style={{ width: `${Math.max(draft.length + 2, 6)}ch` }}
          className="rounded-md border border-accent bg-background px-2 py-0.5 text-current"
        />
      </Tag>
    );
  }

  return (
    <Tag className={`group/title inline-flex items-baseline gap-1 ${className ?? ""}`}>
      {current}
      <span
        role="button"
        tabIndex={-1}
        aria-label={lang === "he" ? "שינוי כותרת" : "Rename title"}
        title={lang === "he" ? "שינוי כותרת" : "Rename title"}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setDraft(titles[k] ?? t(k));
          setEditing(true);
        }}
        className="inline-flex cursor-pointer items-center self-center text-muted-foreground opacity-0 transition-opacity hover:text-accent group-hover/title:opacity-100"
      >
        <Pencil className={inline ? "size-3" : "size-3.5"} />
      </span>
    </Tag>
  );
}
