import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Send, FolderPlus, BookmarkPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { streamConcept, type ChatMsg } from "@/lib/studio-client";
import { parseConcepts } from "@/lib/ideas";
import { logActivity } from "@/lib/storage";
import { Button } from "@/components/ui/button";
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
  text: "Hey! I'm your free-ideas studio — no product needed. Tell me about a brand, a category, a trend or a vibe, and I'll sketch packaging concepts for you. When you like something, save it as a **project** or file it under **ideas**.\n\nהיי! כאן מייצרים רעיונות חופשיים בלי מוצר. ספרו לי על מותג, קטגוריה או טרנד — ואציע קונספטים. בסוף אפשר לשמור כפרויקט או כרעיונות.",
};

function IdeasChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMsg[]>([OPENING]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.text.trim())?.text ?? "";
  const hasConcepts = parseConcepts(lastAssistant).length > 0 && messages.length > 1;

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;
    const next: ChatMsg[] = [...messages, { role: "user", text }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setDraft("");
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

  async function saveAsProject() {
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
      await logActivity(p.id, "Project created from the ideas chat", "concept");
      toast.success("Saved as a project · נשמר כפרויקט");
      navigate({ to: "/projects/$id", params: { id: p.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
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
          <p className="text-sm text-muted-foreground">Free concept creation — before a product is loaded · יצירת קונספטים חופשית, בלי מוצר</p>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-card p-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {m.text || (thinking && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={chatEnd} />
      </div>

      {hasConcepts && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="cut" onClick={saveAsProject} disabled={saving || thinking}>
            <FolderPlus className="size-4" /> Save as project · שמירה כפרויקט
          </Button>
          <Button variant="outline" onClick={saveToIdeas} disabled={saving || thinking}>
            <BookmarkPlus className="size-4" /> Save to ideas · שמירה לרעיונות
          </Button>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="A brand, category, trend or vibe… · מותג, קטגוריה, טרנד או וייב…"
          className="min-h-12 bg-card"
        />
        <Button variant="cut" onClick={send} disabled={thinking || !draft.trim()} className="self-end">
          <Send className="size-4" />
        </Button>
      </div>
    </main>
  );
}
