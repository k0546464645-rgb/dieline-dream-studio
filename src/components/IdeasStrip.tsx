import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lightbulb, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { streamConcept, type ChatMsg } from "@/lib/studio-client";
import { parseConcepts } from "@/lib/ideas";
import { Button } from "@/components/ui/button";

type Idea = { id: string; title: string; summary: string; content: string; category: string; source: string; created_at: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export function IdeasStrip() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const autoRan = useRef(false);

  const { data: ideas } = useQuery({
    queryKey: ["ideas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ideas").select("*").order("created_at", { ascending: false }).limit(12);
      if (error) throw error;
      return (data ?? []) as Idea[];
    },
  });

  async function autopilot() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: projects } = await supabase
        .from("projects")
        .select("name,project_type,approved_concept")
        .order("updated_at", { ascending: false })
        .limit(8);
      const { data: existing } = await supabase.from("ideas").select("title,summary").order("created_at", { ascending: false }).limit(20);
      const context = (projects ?? [])
        .map((p) => `- ${p.name} (${p.project_type})${p.approved_concept ? ` — approved direction: ${p.approved_concept.slice(0, 120)}` : ""}`)
        .join("\n");
      const known = (existing ?? []).map((i) => `- ${i.title}: ${i.summary}`).join("\n");
      const prompt = `AUTOPILOT RESEARCH TASK. You are the studio's research autopilot.
The studio recently worked on these products and categories:
${context || "(no projects yet — pick trending consumer packaged goods categories)"}
Ideas the studio already has — learn from them, build beyond them, NEVER repeat or rephrase them:
${known || "(none yet)"}
Research current packaging trends in exactly these domains and propose 3 FRESH concept ideas the studio has not done yet.
Start EACH with a line exactly in the form "## Concept N: <Name>". For each: one-line big idea, then palette, typography, finish and why it fits the trend. Be concise and specific. Do not repeat the approved directions above — build beyond them.`;
      const msgs: ChatMsg[] = [{ role: "user", text: prompt }];
      let full = "";
      await streamConcept(msgs, undefined, { autopilot: true }, (d) => (full += d));
      const parsed = parseConcepts(full).slice(0, 3);
      if (parsed.length === 0) throw new Error("Autopilot returned no ideas");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("ideas")
        .insert(parsed.map((i) => ({ ...i, source: "autopilot", created_by: u.user?.id ?? null })));
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Fresh ideas are in · רעיונות חדשים נכנסו");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Autopilot failed");
    } finally {
      setBusy(false);
    }
  }

  // Keep ideas fresh: auto-run once per visit when empty or the newest autopilot idea is stale.
  useEffect(() => {
    if (autoRan.current || ideas === undefined) return;
    const newest = ideas.find((i) => i.source === "autopilot");
    const stale = !newest || Date.now() - new Date(newest.created_at).getTime() > DAY_MS;
    if (ideas.length === 0 || stale) {
      autoRan.current = true;
      void autopilot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas]);

  async function remove(id: string) {
    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ideas"] });
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-5 text-accent" />
          <h2 className="text-xl font-extrabold tracking-tight">Fresh ideas · רעיונות טריים</h2>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">autopilot</span>
        </div>
        <Button variant="outline" size="sm" onClick={autopilot} disabled={busy}>
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Researching… · חוקר…" : "Refresh ideas · רענון רעיונות"}
        </Button>
      </div>

      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
        {busy && (ideas ?? []).length === 0 && (
          <div className="flex h-36 w-72 shrink-0 items-center justify-center rounded-lg border border-dashed bg-card font-mono text-xs text-muted-foreground">
            autopilot researching your categories…
          </div>
        )}
        {(ideas ?? []).map((idea) => (
          <article key={idea.id} className="crop-marks group w-72 shrink-0 rounded-lg border bg-card p-4 transition-colors hover:border-foreground">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold leading-snug">{idea.title}</h3>
              <button
                aria-label="Delete idea"
                title="Delete · מחיקה"
                onClick={() => void remove(idea.id)}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{idea.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px] uppercase">
              <span className={`rounded px-2 py-0.5 ${idea.source === "autopilot" ? "gradient-accent text-accent-foreground" : "bg-secondary"}`}>
                {idea.source === "autopilot" ? "autopilot" : "chat"}
              </span>
              {idea.category && <span className="rounded bg-secondary px-2 py-0.5">{idea.category}</span>}
            </div>
          </article>
        ))}
        {ideas && ideas.length === 0 && !busy && (
          <p className="text-sm text-muted-foreground">No ideas yet — hit refresh and the autopilot will research your categories.</p>
        )}
      </div>
    </section>
  );
}
