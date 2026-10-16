import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, projectTypeLabel, signedUrls, stageLabel, STAGES } from "@/lib/storage";
import { fileToDataUrl } from "@/lib/studio-client";
import { Studio, type StudioInstruction } from "@/components/Studio";
import { SendApproval, ShareLinks } from "@/components/SendApproval";
import { ArchiveImport } from "@/components/ArchiveImport";
import { CloudImport } from "@/components/CloudImport";
import { ProjectItems } from "@/components/ProjectItems";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileManager } from "@/components/FileManager";
import { usePrefs, type DictKey } from "@/lib/prefs";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Dieline Studio" }, { name: "description", content: "Packaging project workspace." }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { t } = usePrefs();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);
  const [instruction, setInstruction] = useState<StudioInstruction>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [guideCtx, setGuideCtx] = useState<{ text: string; images: string[] }>();

  const project = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const files = useQuery({
    queryKey: ["files", id],
    queryFn: async () => {
      const { data } = await supabase.from("project_files").select("*").eq("project_id", id).order("created_at", { ascending: false });
      const urls = await signedUrls((data ?? []).filter((f) => !f.path.endsWith(".svg")).map((f) => f.path));
      return (data ?? []).map((f) => ({ ...f, url: urls[f.path] }));
    },
  });
  const approvals = useQuery({
    queryKey: ["approvals", id],
    queryFn: async () => (await supabase.from("approvals").select("*").eq("project_id", id).order("created_at", { ascending: false })).data ?? [],
    refetchInterval: 20000,
  });
  const activity = useQuery({
    queryKey: ["activity", id],
    queryFn: async () => (await supabase.from("activity").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(100)).data ?? [],
    refetchInterval: 20000,
  });
  const guides = useQuery({
    queryKey: ["style_guides_min"],
    queryFn: async () => (await supabase.from("style_guides").select("id,name,brand").order("name")).data ?? [],
  });
  const learnings = useQuery({
    queryKey: ["learnings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("approvals")
        .select("stage,status,comment,chosen")
        .neq("status", "pending")
        .neq("comment", "")
        .order("responded_at", { ascending: false })
        .limit(20);
      return (data ?? []).map((a) => `- [${a.stage}/${a.status}] ${a.comment}`).join("\n");
    },
  });

  const p = project.data;

  // Build style guide context (text + first images) for the AI
  useEffect(() => {
    (async () => {
      if (!p?.style_guide_id) return setGuideCtx(undefined);
      const { data: g } = await supabase.from("style_guides").select("*").eq("id", p.style_guide_id).single();
      if (!g) return setGuideCtx(undefined);
      const urls = await signedUrls(g.image_paths.slice(0, 4));
      const images = await Promise.all(
        Object.values(urls).map(async (u) => fileToDataUrl(await (await fetch(u)).blob()).catch(() => "")),
      );
      setGuideCtx({
        text: `NAME: ${g.name}\nBRAND: ${g.brand}\nCOLORS: ${g.colors}\nFONTS: ${g.fonts}\nIMAGERY: ${g.imagery}\nSUB-STYLES / DIRECTIONS:\n${g.directions}\nRULES & NOTES: ${g.notes}`,
        images: images.filter(Boolean),
      });
    })();
  }, [p?.style_guide_id]);

  async function update(patch: Record<string, unknown>) {
    const { error } = await supabase.from("projects").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["project", id] });
  }

  async function saveAsGuide() {
    if (!p) return;
    const imgs = (files.data ?? []).filter((f) => ["mockup", "concept"].includes(f.kind)).slice(0, 4).map((f) => f.path);
    const { error } = await supabase.from("style_guides").insert({
      name: `${p.name} style`,
      brand: p.customer_name,
      kind: "generated",
      notes: p.approved_concept || p.style_notes,
      image_paths: imgs,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved to the style guide library");
  }

  function apply(a: { id: string; stage: string; comment: string; marks: unknown; chosen: string | null }) {
    const marks = Array.isArray(a.marks) ? (a.marks as { note: string }[]) : [];
    const text = [a.chosen && `Customer chose: ${a.chosen}`, a.comment, ...marks.map((m, i) => `Mark ${i + 1}: ${m.note}`)].filter(Boolean).join("\n");
    setApplyingId(a.id);
    setInstruction({ id: a.id + Date.now(), text, target: a.stage === "concept" ? "concept" : "artwork" });
  }

  async function applyDone() {
    if (applyingId) {
      await supabase.from("approvals").update({ applied: true }).eq("id", applyingId);
      await logActivity(id, "Customer changes applied automatically by AI — review and re-send", "ai");
      qc.invalidateQueries({ queryKey: ["approvals", id] });
      qc.invalidateQueries({ queryKey: ["activity", id] });
    }
    setApplyingId(null);
    setInstruction(null);
  }

  if (!p) return <div className="p-10 text-muted-foreground">{t("proj.loading")}</div>;
  const stageIdx = STAGES.findIndex((s) => s.id === p.stage);

  return (
    <main className="mx-auto max-w-[1500px] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/dashboard" className="font-mono text-xs text-muted-foreground hover:text-foreground">{t("proj.back")}</Link>
          <h1 className="text-3xl font-extrabold tracking-tight">{p.name}</h1>
          <p className="text-sm text-muted-foreground">{[projectTypeLabel(p.project_type), p.customer_name, p.supplier && `Supplier: ${p.supplier}`, p.supplier_item].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={p.style_guide_id ?? ""}
            onChange={(e) => update({ style_guide_id: e.target.value || null })}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">{t("proj.noguide")}</option>
            {guides.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <Button variant="outline" onClick={saveAsGuide}>{t("proj.saveguide")}</Button>
          <Button variant="cut" onClick={() => setSendOpen(true)}>{t("proj.send")}</Button>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-5 gap-1">
        {STAGES.map((s, i) => (
          <li key={s.id} className={`rounded px-3 py-2 font-mono text-[11px] uppercase ${i < stageIdx ? "bg-secondary text-muted-foreground" : i === stageIdx ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`}>
            {i < stageIdx ? "✓ " : ""}{t(`stage.${s.id}` as DictKey)}
          </li>
        ))}
      </ol>

      <Tabs defaultValue="design" className="mt-5">
        <TabsList>
          <TabsTrigger value="design">{t("tab.design")}</TabsTrigger>
          <TabsTrigger value="approvals">{t("tab.approvals")} {approvals.data?.some((a) => a.status !== "pending" && !a.applied && a.status !== "approved") ? "•" : ""}</TabsTrigger>
          <TabsTrigger value="files">{t("tab.files")} ({files.data?.length ?? 0})</TabsTrigger>
          {p.project_type !== "single" && <TabsTrigger value="items">{t("tab.items")}</TabsTrigger>}
          <TabsTrigger value="details">{t("tab.details")}</TabsTrigger>
          <TabsTrigger value="history">{t("tab.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="design" forceMount className="data-[state=inactive]:hidden">
          {guideCtx && <p className="mb-3 font-mono text-xs text-accent">{t("proj.guideactive")}</p>}
          <Studio
            project={p}
            styleGuide={guideCtx}
            learnings={learnings.data}
            instruction={instruction}
            onInstructionDone={applyDone}
            onFilesChanged={() => qc.invalidateQueries({ queryKey: ["files", id] })}
            onStyleGuideChange={async (gid) => {
              await supabase.from("projects").update({ style_guide_id: gid }).eq("id", id);
              qc.invalidateQueries({ queryKey: ["project", id] });
            }}
          />
        </TabsContent>

        <TabsContent value="approvals">
          <div className="space-y-4">
            {approvals.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing sent yet. Use “Send for approval”.</p>}
            {approvals.data?.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] uppercase text-accent">{stageLabel(a.stage)} · to {a.recipient_name || a.recipient_role} ({a.recipient_role})</p>
                    <p className="font-semibold">
                      {a.status === "pending" ? "Waiting for reply" : a.status === "approved" ? "✓ Approved" : a.status === "changes" ? "Changes requested" : "Rejected"}
                      {a.responder_name && ` by ${a.responder_name}`}
                      {a.chosen && ` — chose “${a.chosen}”`}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                  {a.status !== "pending" && a.status !== "approved" && (
                    <Button variant={a.applied ? "outline" : "cut"} size="sm" disabled={!!applyingId} onClick={() => apply(a)}>
                      {applyingId === a.id ? "Applying…" : a.applied ? "Apply again" : "Apply changes with AI"}
                    </Button>
                  )}
                </div>
                {a.comment && <p className="mt-2 whitespace-pre-wrap text-sm">“{a.comment}”</p>}
                {Array.isArray(a.marks) && a.marks.length > 0 && (
                  <ol className="mt-2 list-decimal pl-5 text-sm text-muted-foreground">
                    {(a.marks as { note: string }[]).map((m, i) => <li key={i}>{m.note}</li>)}
                  </ol>
                )}
                {a.status === "pending" && (
                  <div className="mt-3">
                    <ShareLinks token={a.token} phone={a.recipient_role === "customer" ? p.customer_phone : ""} email={a.recipient_role === "customer" ? p.customer_email : ""} projectName={p.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="files">
          <div className="space-y-6">
            <ArchiveImport projectId={id} onDone={() => qc.invalidateQueries({ queryKey: ["files", id] })} />
            <CloudImport projectId={id} onDone={() => qc.invalidateQueries({ queryKey: ["files", id] })} />
            {grouped.map(([label, list]) => (
              <section key={label}>
                <h3 className="mb-2 font-semibold">{label} <span className="font-mono text-xs text-muted-foreground">({list.length})</span></h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                  {list.map((f) => (
                    <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" onClick={async (e) => {
                      if (f.url) return;
                      e.preventDefault();
                      const { data } = await supabase.storage.from("studio").createSignedUrl(f.path, 600, { download: true });
                      if (data) window.open(data.signedUrl, "_blank");
                    }} className="rounded-md border bg-card p-1 hover:border-foreground">
                      {f.url && /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.path) ? <img src={f.url} alt="" className="aspect-square w-full rounded object-cover" /> : <div className="bg-grid flex aspect-square items-center justify-center rounded bg-muted font-mono text-xs uppercase">{f.path.split(".").pop()}</div>}
                      <div className="flex items-center justify-between gap-1 px-1 pt-1">
                        <p className="truncate text-[11px]">{f.label}</p>
                        <button
                          aria-label="Download file"
                          title="Download · הורדה"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const { data, error } = await supabase.storage.from("studio").createSignedUrl(f.path, 60, { download: f.label.split("/").pop() || true });
                            if (error || !data) return toast.error("Couldn't create a download link");
                            window.open(data.signedUrl, "_blank");
                          }}
                        >
                          ⬇
                        </button>
                        <button
                          aria-label="Delete file"
                          title="Delete · מחיקה"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            await supabase.storage.from("studio").remove([f.path]);
                            await supabase.from("project_files").delete().eq("id", f.id);
                            qc.invalidateQueries({ queryKey: ["files", id] });
                            toast.success("File deleted");
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <p className="px-1 font-mono text-[10px] text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</p>
                    </a>
                  ))}
                  {list.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                </div>
              </section>
            ))}
          </div>
        </TabsContent>

        {p.project_type !== "single" && (
          <TabsContent value="items">
            <ProjectItems projectId={id} />
          </TabsContent>
        )}

        <TabsContent value="details">
          <DetailsForm project={p} onSave={update} />
        </TabsContent>

        <TabsContent value="history">
          <ol className="space-y-2">
            {activity.data?.map((h) => (
              <li key={h.id} className="flex gap-3 border-b pb-2 text-sm">
                <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                <span className="w-24 shrink-0 font-mono text-[11px] uppercase text-accent">{h.kind}</span>
                <span>{h.message} {h.actor && <span className="text-muted-foreground">— {h.actor}</span>}</span>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>

      <SendApproval
        project={p}
        files={files.data ?? []}
        open={sendOpen}
        onOpenChange={setSendOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["approvals", id] });
          qc.invalidateQueries({ queryKey: ["activity", id] });
          qc.invalidateQueries({ queryKey: ["project", id] });
        }}
      />
    </main>
  );
}

function DetailsForm({ project, onSave }: { project: Record<string, unknown>; onSave: (p: Record<string, unknown>) => void }) {
  const keys = [
    ["name", "Project / product name"],
    ["customer_name", "Customer"],
    ["customer_email", "Customer email"],
    ["customer_phone", "Customer WhatsApp / phone"],
    ["supplier", "Supplier / factory"],
    ["supplier_item", "Supplier item / model no."],
  ] as const;
  const [f, setF] = useState(() => Object.fromEntries(keys.map(([k]) => [k, String(project[k] ?? "")])));
  return (
    <div className="grid max-w-2xl gap-3">
      {keys.map(([k, l]) => (
        <div key={k} className="space-y-1">
          <Label>{l}</Label>
          <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="bg-card" />
        </div>
      ))}
      <div className="space-y-1">
        <Label>Stage</Label>
        <select defaultValue={String(project["stage"])} onChange={(e) => onSave({ stage: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <Button onClick={() => onSave(f)}>Save details</Button>
    </div>
  );
}
