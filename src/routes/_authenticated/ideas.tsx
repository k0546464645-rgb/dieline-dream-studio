import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, Download, FolderPlus, ImagePlus, Lightbulb, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders, download, streamConcept, type ChatMsg } from "@/lib/studio-client";
import { parseConcepts } from "@/lib/ideas";
import { logActivity, uploadToStudio } from "@/lib/storage";
import { imageFilesFrom } from "@/lib/chat-images";
import { AttachmentStrip, useChatAttachments, useImageDrop } from "@/components/ChatAttachments";
import { Button } from "@/components/ui/button";
import { VoiceButton } from "@/components/VoiceButton";
import { Textarea } from "@/components/ui/textarea";
import { usePrefs } from "@/lib/prefs";
import { BackgroundRemoval } from "@/components/BackgroundRemoval";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { streamImage } from "@/lib/stream-image";
import { hasVisualConcepts, projectProductSource, type IdeaVisual } from "@/lib/idea-visuals";

export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({
    meta: [
      { title: "Ideas chat — Dieline Studio" },
      { name: "description", content: "Create packaging concepts, style guides and product mockups without a product photo." },
      { property: "og:title", content: "Ideas & product mockups — Dieline Studio" },
      { property: "og:description", content: "Design product concepts and style guides, generate mockups and start a project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IdeasChat,
});

function IdeasChat() {
  const { t, lang } = usePrefs();
  const he = lang === "he";
  const [visuals, setVisuals] = useState<IdeaVisual[]>([]);
  const [rendering, setRendering] = useState(false);
  const [selected, setSelected] = useState(0);
  const [projectOpen, setProjectOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<"generated" | "upload">("generated");
  const [productPhoto, setProductPhoto] = useState<File>();
  const [projectName, setProjectName] = useState("");
  const [projectError, setProjectError] = useState("");
  const productPicker = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", text: t("ideas.opening") }]);
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
    if (!text || thinking || rendering) return;
    const att = images.length ? images : undefined;
    const next: ChatMsg[] = [...messages, { role: "user", text, images: att }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setDraft("");
    clear();
    setThinking(true);
    try {
      let full = "";
      await streamConcept(next, undefined, { ideaVisuals: true, language: lang }, (d) => {
        full += d;
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", text: (c[c.length - 1]?.text ?? "") + d };
          return c;
        });
        chatEnd.current?.scrollIntoView({ block: "end" });
      });
      if (hasVisualConcepts(full)) {
        setThinking(false);
        await createMockups(full, next.filter((m) => m.role === "user").map((m) => m.text).join("\n"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (he ? "יצירת הקונספט נכשלה" : "Concept generation failed"));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setThinking(false);
    }
  }

  async function createMockups(text: string, brief: string) {
    const concepts = parseConcepts(text);
    setRendering(true); setSelected(0);
    setVisuals(concepts.map((c) => ({ title: c.title, content: c.content, final: false })));
    try {
      const headers = await authHeaders();
      for (const [index, concept] of concepts.entries()) {
        try {
          await streamImage("/api/generate-image", { concept: concept.content, brief }, (image, final) => {
            setVisuals((current) => current.map((v, i) => i === index ? { ...v, image, final } : v));
          }, undefined, headers);
        } catch (e) {
          const error = e instanceof Error ? e.message : (he ? "יצירת ההדמיה נכשלה" : "Mockup generation failed");
          setVisuals((current) => current.map((v, i) => i === index ? { ...v, final: false, error } : v));
          toast.error(error);
          break; // A blocked request must not start further paid calls.
        }
      }
    } finally { setRendering(false); }
  }

  function openProject() {
    setProjectName(visuals[selected]?.title ?? parseConcepts(lastAssistant)[0]?.title ?? "");
    setSourceMode(visuals[selected]?.final ? "generated" : "upload");
    setProjectError(""); setProjectOpen(true);
  }

  async function startProject() {
    if (!lastAssistant || saving || !projectName.trim()) return;
    setSaving(true); setProjectError("");
    try {
      const visual = visuals[selected];
      const source = projectProductSource(sourceMode, visual?.final ? visual.image : undefined, productPhoto);
      const concept = visual?.content ?? lastAssistant;
      let adaptedMockup: string | undefined;
      if (sourceMode === "upload" && source instanceof File) {
        const form = new FormData();
        form.append("image[]", source);
        form.append("prompt", `Create a photorealistic packaging design mockup of the product in the FIRST reference image. Preserve its actual product shape, proportions, material and structure. Apply this concept's label, colors, typography and graphic style to the real product, not to an invented replacement. Show the complete product in a clear front view on a neutral studio backdrop. Any second reference image shows the style direction only, never the product geometry.\nCONCEPT AND STYLE GUIDE:\n${concept.slice(0, 8000)}`);
        if (visual?.image && visual.final) {
          const blob = await (await fetch(visual.image)).blob();
          form.append("image[]", new File([blob], "style-reference.png", { type: blob.type }));
        }
        await streamImage("/api/edit-image", form, (image, done) => { if (done) adaptedMockup = image; }, undefined, await authHeaders());
      }
      // Upload everything before creating the project: no navigation until all files are ready.
      const folder = `ideas/${crypto.randomUUID()}`;
      const productPath = await uploadToStudio(folder, source, source instanceof File ? source.name : "generated-product.png");
      const mockupPath = visual?.image && visual.final
        ? sourceMode === "generated" ? productPath : await uploadToStudio(folder, visual.image, "concept-mockup.png")
        : undefined;
      const adaptedPath = adaptedMockup ? await uploadToStudio(folder, adaptedMockup, "real-product-mockup.png") : undefined;
      const { data: p, error } = await supabase.from("projects").insert({
        name: projectName.trim(), project_type: "single", stage: "concept", messages: messages as never,
        approved_concept: concept, style_notes: concept, product_path: productPath,
      }).select("id").single();
      if (error) throw error;
      const rows = [{ project_id: p.id, kind: "product", path: productPath, label: source instanceof File ? source.name : visual?.title ?? "Product" }];
      if (mockupPath) rows.push({ project_id: p.id, kind: sourceMode === "generated" ? "mockup" : "concept", path: mockupPath, label: visual?.title ?? "Concept" });
      if (adaptedPath) rows.push({ project_id: p.id, kind: "mockup", path: adaptedPath, label: he ? "הדמיית המוצר שהועלה" : "Uploaded product mockup" });
      const guidePath = await uploadToStudio(folder, new Blob([concept], { type: "text/plain" }), "style-guide.txt");
      rows.push({ project_id: p.id, kind: "docs", path: guidePath, label: he ? "סטייל גייד" : "Style guide" });
      const { error: fileError } = await supabase.from("project_files").insert(rows);
      if (fileError) throw fileError;
      await logActivity(p.id, "Project started from the ideas chat", "concept");
      toast.success(he ? "הפרויקט נפתח" : "Project started");
      navigate({ to: "/projects/$id", params: { id: p.id } });
    } catch (e) {
      setProjectError(e instanceof Error ? e.message : (he ? "פתיחת הפרויקט נכשלה" : "Couldn't start the project"));
    } finally { setSaving(false); }
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
      toast.success(he ? `${rows.length} רעיונות נשמרו` : `${rows.length} ideas saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="gradient-accent flex h-10 w-10 items-center justify-center rounded-xl text-accent-foreground">
          <Lightbulb className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("ideas.title")}</h1>
          <p className="text-sm text-muted-foreground">{he ? "קונספטים · סטייל גייד · הדמיות מוצרים" : "Concepts · style guides · product mockups"}</p>
        </div>
        <div className="ms-auto shrink-0"><BackgroundRemoval /></div>
      </div>

      <div
        ref={chatBox}
        className={`mt-4 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-card p-4 transition-shadow ${
          dropOver ? "border-accent ring-2 ring-accent" : ""
        }`}
      >
        {dropOver && (
          <p className="pointer-events-none sticky top-0 z-10 rounded-md bg-accent px-3 py-1 text-center font-mono text-[11px] uppercase tracking-widest text-accent-foreground">
            {t("ideas.drop")}
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
        {visuals.length > 0 && <section className="space-y-3 border-t pt-4">
          <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-accent" />{he ? "הדמיות וסטייל גייד" : "Mockups & style guides"}{rendering && <Loader2 className="size-4 animate-spin" />}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visuals.map((v, i) => <article key={i} className={`min-w-0 overflow-hidden rounded-lg border bg-background ${i === selected ? "border-accent ring-1 ring-accent" : ""}`}>
              <div className="flex aspect-[3/2] items-center justify-center bg-secondary">{v.image ? <img src={v.image} alt={v.title} className={`h-full w-full object-contain transition-[filter] ${v.final ? "blur-0" : "blur-2xl"}`} /> : <Sparkles className="size-8 text-muted-foreground" />}</div>
              <div className="space-y-2 p-3"><h3 className="break-words text-sm font-semibold">{v.title}</h3>
                {v.error && <p role="alert" className="break-words text-xs text-destructive">{v.error}</p>}
                <details><summary className="cursor-pointer text-xs text-muted-foreground">{he ? "סטייל גייד" : "Style guide"}</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs">{v.content}</p></details>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant={i === selected ? "default" : "outline"} onClick={() => setSelected(i)} aria-pressed={i === selected}>{i === selected ? (he ? "נבחר" : "Selected") : (he ? "בחירה" : "Select")}</Button>{v.final && v.image && <Button size="icon" variant="ghost" title={he ? "הורדת הדמיה" : "Download mockup"} onClick={() => { if (v.image) download(v.image, `concept-${i + 1}.png`); }}><Download className="size-4" /></Button>}</div>
              </div>
            </article>)}
          </div>
        </section>}
        <div ref={chatEnd} />
      </div>

      {(started || hasConcepts) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="cut" onClick={openProject} disabled={saving || thinking || rendering || !started}>
            <FolderPlus className="size-4" /> {t("ideas.start")}
          </Button>
          {hasConcepts && (
            <Button variant="outline" onClick={saveToIdeas} disabled={saving || thinking || rendering}>
              <BookmarkPlus className="size-4" /> {t("ideas.save")}
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
          title={he ? "צירוף תמונות" : "Attach images"}
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
          placeholder={t("ideas.placeholder")}
          className="min-h-12 bg-card"
        />
        <VoiceButton className="self-end" disabled={thinking || rendering} onText={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />
        <Button variant="cut" onClick={send} disabled={thinking || rendering || (!draft.trim() && !images.length)} className="self-end">
          <Send className="size-4" />
        </Button>
      </div>
      <Dialog open={projectOpen} onOpenChange={(open) => { if (!saving) setProjectOpen(open); }}>
        <DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{he ? "התחלת פרויקט" : "Start project"}</DialogTitle></DialogHeader>
          <Input aria-label={he ? "שם הפרויקט" : "Project name"} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={he ? "שם הפרויקט" : "Project name"} />
          <div className="flex flex-wrap gap-2"><Button variant={sourceMode === "generated" ? "default" : "outline"} disabled={!visuals[selected]?.final} onClick={() => setSourceMode("generated")}>{he ? "שימוש במוצר שנוצר" : "Use generated product"}</Button><Button variant={sourceMode === "upload" ? "default" : "outline"} onClick={() => setSourceMode("upload")}>{he ? "העלאת מוצר אמיתי" : "Upload real product"}</Button></div>
          {sourceMode === "upload" && <><input ref={productPicker} type="file" accept="image/*" className="hidden" aria-label={he ? "תמונת מוצר לפרויקט" : "Project product photo"} onChange={(e) => { const f = e.target.files?.[0]; if (f) setProductPhoto(f); e.target.value = ""; }} /><Button variant="outline" onClick={() => productPicker.current?.click()}><ImagePlus className="size-4" />{productPhoto?.name ?? (he ? "בחירת תמונת מוצר" : "Choose product photo")}</Button></>}
          {projectError && <p role="alert" className="text-sm text-destructive">{projectError}</p>}
          <Button onClick={startProject} disabled={saving || !projectName.trim() || (sourceMode === "upload" && !productPhoto)}>{saving ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}{he ? "יצירת פרויקט" : "Create project"}</Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
