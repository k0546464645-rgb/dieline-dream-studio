import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, FolderPlus, ImagePlus, Lightbulb, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { streamConcept, type ChatMsg } from "@/lib/studio-client";
import { parseConcepts } from "@/lib/ideas";
import { logActivity } from "@/lib/storage";
import { imageFilesFrom } from "@/lib/chat-images";
import { AttachmentStrip, useChatAttachments, useImageDrop } from "@/components/ChatAttachments";
import { Button } from "@/components/ui/button";
import { VoiceButton } from "@/components/VoiceButton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({
    meta: [
      { title: "Ideas chat — Dieline Studio" },
      { name: "description", content: "Free concept chat — design ideas before a product is loaded." },
    ],
  }),
  component: IdeasChat,
});

const OPENING: ChatMsg = {
  role: "assistant",
  text: "Hey! I'm your free-ideas studio — no product needed. Tell me about a brand, a category, a trend or a vibe, and I'll sketch packaging concepts for you. You can also drag mood-board or competitor photos straight into this chat.\n\nWhen you like something, start a **project** from the chat or file it under **ideas**.\n\nהיי! כאן מייצרים רעיונות חופשיים בלי מוצר. ספרו לי על מותג, קטגוריה או טרנד — ואציע קונספטים. אפשר גם לגרור תמונות לתוך הצ׳אט. בסוף מתחילים פרויקט ישירות מהצ׳אט או שומרים כרעיונות.",
};

function IdeasChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMsg[]>([OPENING]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const { images, addFiles, remove, clear } = useChatAttachments();
  const dropOver = useImageDrop(chatBox, addFiles);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.text.trim())?.text ?? "";
  const hasConcepts = !thinking && parseConcepts(lastAssistant).length > 0 && messages.length > 1;
  const started = messages.some((m) => m.role === "user");

  async function send() {
    const text = draft.trim() || (images.length ? "Design from the attached reference images." : "");
    if (!text || thinking) return;
    const att = images.length ? images : undefined;
    const next: ChatMsg[] = [...messages, { role: "user", text, images: att }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setDraft("");
    clear();
    setThinking(true);
    try {
      await streamConcept(next, undefined, {}, (d) => {
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", text: (c[c.length - 1]?.text ?? "") + d };
          return c;
        });
        chatEnd.current?.scrollIntoView({ block: "end" });
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Concept generation failed");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setThinking(false);
    }
  }

  async function startProject() {
    if (!lastAssistant || saving) return;
    setSaving(true);
    try {
      const ideas = parseConcepts(lastAssistant);
      const name = ideas[0]?.title ?? messages.find((m) => m.role === "user")?.text.slice(0, 60) ?? "Idea project";
      const { data: p, error } = await supabase
        .from("projects")
        .insert({ name, project_type: "single", stage: "concept", messages: messages as never, approved_concept: lastAssistant })
        .select("id")
        .single();
      if (error) throw error;
      await logActivity(p.id, "Project started from the ideas chat", "concept");
      toast.success("Project started · הפרויקט נפתח");
      navigate({ to: "/projects/$id", params: { id: p.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the project");
    } finally {
      setSaving(false);
    }
  }

  async function saveToIdeas() {
    if (!lastAssistant || saving) return;
    setSaving(true);
    try {
      const ideas = parseConcepts(lastAssistant);
      const { data: u } = await supabase.auth.getUser();
      const rows = ideas.map((i) => ({ ...i, source: "chat", created_by: u.user?.id ?? null }));
      const { error } = await supabase.from("ideas").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} idea(s) filed · נשמרו ברעיונות`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="gradient-accent flex h-10 w-10 items-center justify-center rounded-xl text-accent-foreground">
          <Lightbulb className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Ideas chat · צ'אט רעיונות</h1>
          <p className="text-sm text-muted-foreground">
            Free concept creation — drag photos in, then start a project · יצירת קונספטים חופשית, גוררים תמונות ומתחילים פרויקט
          </p>
        </div>
      </div>

      <div
        ref={chatBox}
        className={`mt-4 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-card p-4 transition-shadow ${
          dropOver ? "border-accent ring-2 ring-accent" : ""
        }`}
      >
        {dropOver && (
          <p className="pointer-events-none sticky top-0 z-10 rounded-md bg-accent px-3 py-1 text-center font-mono text-[11px] uppercase tracking-widest text-accent-foreground">
            Drop images here · שחררו תמונות כאן
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {m.images?.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {m.images.map((src, j) => (
                    <img key={j} src={src} alt="" className="size-16 rounded-md border object-cover" />
                  ))}
                </div>
              ) : null}
              {m.text || (thinking && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={chatEnd} />
      </div>

      {(started || hasConcepts) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="cut" onClick={startProject} disabled={saving || thinking || !started}>
            <FolderPlus className="size-4" /> Start project from chat · התחלת פרויקט מהצ׳אט
          </Button>
          {hasConcepts && (
            <Button variant="outline" onClick={saveToIdeas} disabled={saving || thinking}>
              <BookmarkPlus className="size-4" /> Save to ideas · שמירה לרעיונות
            </Button>
          )}
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-3">
          <AttachmentStrip images={images} onRemove={remove} />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <label
          title="Attach images · צירוף תמונות"
          className="self-end grid size-11 cursor-pointer place-items-center rounded-md border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <ImagePlus className="size-4" />
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const files = imageFilesFrom(e.clipboardData?.files);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="A brand, category, trend or vibe… drag or paste images too · מותג, קטגוריה, טרנד או וייב…"
          className="min-h-12 bg-card"
        />
        <VoiceButton className="self-end" disabled={thinking} onText={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />
        <Button variant="cut" onClick={send} disabled={thinking || (!draft.trim() && !images.length)} className="self-end">
          <Send className="size-4" />
        </Button>
      </div>
    </main>
  );
}
