import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, pathToFile, signedUrl, uploadToStudio } from "@/lib/storage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/stream-image";
import { authHeaders } from "@/lib/studio-client";
import { composeExact } from "@/lib/exact-layout";
import {
  buildLayeredSvg,
  buildAiFile,
  dataUrlToFile,
  detectLayout,
  dielineToPng,
  extractInfo,
  download,
  fileToDataUrl,
  streamConcept,
  streamQc,
  type ChatMsg,
  type PackInfo,
} from "@/lib/studio-client";
import { DesignBoard, parseConcepts, type ConceptOption } from "@/components/DesignBoard";
import { InfoForm, LANGUAGES, emptyInfo, infoPrompt } from "@/components/InfoForm";
import { ItemsImport } from "@/components/ItemsImport";
import { VoiceButton } from "@/components/VoiceButton";
import { AttachmentStrip, useChatAttachments, useImageDrop } from "@/components/ChatAttachments";
import { imageFilesFrom } from "@/lib/chat-images";
import { Check, Download, GripVertical, ImagePlus, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { usePrefs, type DictKey } from "@/lib/prefs";
import { PACKAGING_OPTIONS, mockupSlots, mockupKind, savedMockupSlot, type MockupCounts } from "@/lib/mockup-layout";
import { EditableTitle } from "@/components/EditableTitle";
import { ManualPlacement } from "@/components/ManualPlacement";

/** Drag-to-reorder wrapper for the step windows; order persists per column in localStorage. */
function SortableSteps({ group, className, children }: { group: string; className?: string | undefined; children: React.ReactNode }) {
  const items = React.Children.toArray(children) as React.ReactElement[];
  const ids = items.map((c) => String(c.key));
  const [order, setOrder] = useState<string[]>(ids);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ds-step-order") ?? "{}") as Record<string, string[]>;
      const s = saved[group];
      if (Array.isArray(s)) setOrder([...s.filter((k) => ids.includes(k)), ...ids.filter((k) => !s.includes(k))]);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(o: string[]) {
    setOrder(o);
    try {
      const saved = JSON.parse(localStorage.getItem("ds-step-order") ?? "{}") as Record<string, string[]>;
      saved[group] = o;
      localStorage.setItem("ds-step-order", JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }

  const byKey = new Map(items.map((c) => [String(c.key), c]));
  return (
    <div className={className}>
      {order.map((k) => {
        const child = byKey.get(k);
        if (!child) return null;
        return (
          <div
            key={k}
            draggable
            onDragStart={(e) => {
              dragId.current = k;
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragId.current;
              if (!from || from === k) return;
              const next = order.filter((x) => x !== from);
              next.splice(next.indexOf(k), 0, from);
              persist(next);
              dragId.current = null;
            }}
            className="group/step relative"
          >
            <GripVertical className="absolute end-2 top-4 z-10 size-4 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover/step:opacity-100" />
            {child}
          </div>
        );
      })}
    </div>
  );
}


function Step({ n, titleKey, children }: { n: string; titleKey: DictKey; children: React.ReactNode }) {
  return (
    <section className="crop-marks rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-xs text-accent">{n}</span>
        <EditableTitle k={titleKey} as="h2" className="text-lg font-semibold tracking-tight" />
      </div>
      {children}
    </section>
  );
}

function StepButton({
  n,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { n: string }) {
  return (
    <Button variant="cut" className={`gap-2.5 ${className ?? ""}`} {...props}>
      <span className="grid size-5 place-items-center rounded-full bg-accent-foreground/20 font-mono text-[10px] font-bold">
        {n}
      </span>
      {children}
    </Button>
  );
}

function ImageSlot({
  src,
  final,
  empty,
  loading,
}: {
  src?: string | undefined;
  final?: boolean | undefined;
  empty: string;
  loading?: boolean | undefined;
}) {
  const { lang } = usePrefs();
  return (
    <div className="bg-grid flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted">
      {src ? (
        <img
          src={src}
          alt={empty}
          className={`h-full w-full object-contain transition-[filter] duration-700 ${final ? "blur-0" : "blur-2xl"}`}
        />
      ) : (
        <p className="px-6 text-center font-mono text-xs text-muted-foreground">
          {loading ? (lang === "he" ? "יוצר הדמיה…" : "Rendering…") : empty}
        </p>
      )}
    </div>
  );
}

export type StudioProject = {
  id: string;
  name: string;
  messages: unknown;
  approved_concept: string;
  info: unknown;
  style_notes: string;
  style_guide_id: string | null;
  project_type: string;
  product_path: string | null;
};
export type StudioInstruction = { id: string; text: string; target: "concept" | "artwork" } | null;

async function urlToDataUrl(url: string) {
  return fileToDataUrl(await (await fetch(url)).blob());
}

export function Studio({
  project,
  styleGuide,
  learnings,
  instruction,
  onInstructionDone,
  onFilesChanged,
  onStyleGuideChange,
}: {
  project: StudioProject;
  styleGuide?: { text: string; images: string[] } | undefined;
  onStyleGuideChange?: (id: string | null) => void;
  learnings?: string | undefined;
  instruction?: StudioInstruction;
  onInstructionDone?: () => void;
  onFilesChanged?: () => void;
}) {
  const { t, lang } = usePrefs();
  const he = lang === "he";
  const [product, setProduct] = useState<string>();
  const [productFile, setProductFile] = useState<File>();
  const [messages, setMessages] = useState<ChatMsg[]>(Array.isArray(project.messages) ? (project.messages as ChatMsg[]) : []);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const [mockups, setMockups] = useState<Record<string, string | undefined>>({});
  const [mockFinal, setMockFinal] = useState<Record<string, boolean | undefined>>({});
  const [mockBusy, setMockBusy] = useState<string | null>(null);
  const [packCounts, setPackCounts] = useState<MockupCounts>({});
  const [mockBatch, setMockBatch] = useState(false);
  const mockLock = useRef(false);
  const slots = mockupSlots(packCounts);

  function setPackagingCount(id: string, count: number) {
    const next = { ...packCounts, [id]: Math.max(0, count) };
    setPackCounts(next);
    localStorage.setItem(`ds-mockup-requests:${project.id}`, JSON.stringify(next));
  }

  const [dieline, setDieline] = useState<string>();
  const [dielineName, setDielineName] = useState("");
  const dielineOriginal = useRef<ArrayBuffer | undefined>(undefined);
  const [art, setArt] = useState<string>();
  const [artFinal, setArtFinal] = useState(false);
  const [artBusy, setArtBusy] = useState(false);
  const [svgBusy, setSvgBusy] = useState(false);
  const [masterDieline, setMasterDieline] = useState<string>();
  const [masterDielineName, setMasterDielineName] = useState("");
  const [masterArt, setMasterArt] = useState<string>();
  const [masterArtFinal, setMasterArtFinal] = useState(false);
  const [masterArtBusy, setMasterArtBusy] = useState(false);

  const [approved, setApproved] = useState<string>(project.approved_concept ?? "");
  const [info, setInfo] = useState<PackInfo>({ ...emptyInfo, ...((project.info as Partial<PackInfo>) ?? {}) });
  const chatEnd = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const { images: attachImages, addFiles, remove: removeAttach, clear: clearAttach } = useChatAttachments();
  const dropOver = useImageDrop(chatBox, addFiles);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.text ?? "";
  const concept = approved || lastAssistant;
  const options = approved ? [] : parseConcepts(lastAssistant);
  const [task, setTask] = useState<"concept" | "ready" | "guide" | "direct" | null>(null);
  const [directDesigns, setDirectDesigns] = useState<string[]>([]);
  const [guidesList, setGuidesList] = useState<{ id: string; name: string; brand: string }[]>([]);
  const [pendingGuide, setPendingGuide] = useState<string | null>(null);
  const [conceptProjects, setConceptProjects] = useState<{ id: string; name: string; approved_concept: string }[]>([]);
  const [readyConcept, setReadyConcept] = useState("");
  const [refFile, setRefFile] = useState<File>();
  const [boardOpen, setBoardOpen] = useState(false);
  const [styleNotes, setStyleNotes] = useState(project.style_notes ?? "");
  const [qc, setQc] = useState("");
  const [qcBusy, setQcBusy] = useState(false);
  const loaded = useRef(false);

  async function saveFile(kind: string, data: string | Blob, label: string) {
    try {
      const path = await uploadToStudio(project.id, data, kind);
      await supabase.from("project_files").insert({ project_id: project.id, kind, label, path });
      onFilesChanged?.();
      return path;
    } catch (e) {
      toast.error(`Couldn't save ${kind}: ${(e as Error).message}`);
      return undefined;
    }
  }

  // Load saved product + latest dieline / mockup / artwork
  useEffect(() => {
    (async () => {
      let savedCounts: MockupCounts | undefined;
      try {
        const stored = localStorage.getItem(`ds-mockup-requests:${project.id}`);
        if (stored) {
          const parsed = JSON.parse(stored) as MockupCounts;
          savedCounts = Object.fromEntries(PACKAGING_OPTIONS.map(({ id }) => [id, Number.isSafeInteger(parsed[id]) && (parsed[id] ?? 0) >= 0 ? parsed[id] : 0])) as MockupCounts;
          setPackCounts(savedCounts);
        }
      } catch { /* Fall back to saved images. */ }
      if (project.product_path) {
        const f = await pathToFile(project.product_path, "product.png").catch(() => undefined);
        if (f) {
          setProductFile(f);
          setProduct(await fileToDataUrl(f));
          setTask((t) => t ?? (project.approved_concept ? "ready" : "concept"));
        }
      }
      const { data } = await supabase
        .from("project_files")
        .select("kind,path,label,created_at")
        .eq("project_id", project.id)
        .or("kind.in.(dieline,artwork,dieline-master,artwork-master),kind.like.mockup%,kind.like.design-direct%")
        .order("created_at", { ascending: false });
      const latest = (k: string) => data?.find((d) => d.kind === k);
      const d = latest("dieline"), m = latest("mockup"), mb = latest("mockup-back"), a = latest("artwork");
      if (d) { setDieline(await urlToDataUrl(await signedUrl(d.path))); setDielineName(d.label || "dieline"); }
      if (m) { const s = await urlToDataUrl(await signedUrl(m.path)); setMockups((x) => ({ ...x, front: s })); setMockFinal((x) => ({ ...x, front: true })); }
      if (mb) { const s = await urlToDataUrl(await signedUrl(mb.path)); setMockups((x) => ({ ...x, back: s })); setMockFinal((x) => ({ ...x, back: true })); }
      const restored = new Set<string>();
      const restoredCounts: MockupCounts = {};
      for (const file of data ?? []) {
        const slot = savedMockupSlot(file.kind);
        if (!slot || slot === "front" || slot === "back" || restored.has(slot)) continue;
        restored.add(slot);
        const image = await urlToDataUrl(await signedUrl(file.path));
        setMockups((current) => ({ ...current, [slot]: image }));
        setMockFinal((current) => ({ ...current, [slot]: true }));
        const [id, number] = slot.split("-");
        if (id) restoredCounts[id] = Math.max(restoredCounts[id] ?? 0, Number(number));
      }
      if (!savedCounts) setPackCounts(restoredCounts);
      const savedDesigns: string[] = [];
      for (const file of (data ?? []).filter((d) => d.kind.startsWith("design-direct")).reverse()) {
        savedDesigns.push(await urlToDataUrl(await signedUrl(file.path)));
      }
      if (savedDesigns.length) {
        setDirectDesigns(savedDesigns);
        setTask((tk) => tk ?? "direct");
      }
      if (a) { setArt(await urlToDataUrl(await signedUrl(a.path))); setArtFinal(true); }
      const dm = latest("dieline-master"), am = latest("artwork-master");
      if (dm) { setMasterDieline(await urlToDataUrl(await signedUrl(dm.path))); setMasterDielineName(dm.label || "master carton"); }
      if (am) { setMasterArt(await urlToDataUrl(await signedUrl(am.path))); setMasterArtFinal(true); }
      loaded.current = true;
    })().catch(() => (loaded.current = true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Autosave chat, concept, info and style notes
  useEffect(() => {
    if (thinking) return undefined;
    const t = setTimeout(() => {
      void supabase
        .from("projects")
        .update({
          messages: messages as never,
          approved_concept: approved,
          info: info as never,
          style_notes: styleNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", project.id);
    }, 800);
    return () => clearTimeout(t);
  }, [messages, approved, info, styleNotes, thinking, project.id]);

  // Apply customer feedback automatically
  useEffect(() => {
    if (!instruction) return;
    (async () => {
      if (instruction.target === "artwork" && dieline) await renderArtwork(instruction.text);
      else await send(`Customer feedback to apply:\n${instruction.text}\n\nUpdate the design accordingly and restate it in full starting with "## FINAL CONCEPT".`, true);
      onInstructionDone?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruction?.id]);

  async function runQc(artSrc?: string) {
    const src = artSrc ?? art;
    if (!src) return;
    setQcBusy(true);
    setQc("");
    try {
      await streamQc(src, info, concept, (d) => setQc((q) => q + d));
      void logActivity(project.id, "AI quality check run on artwork", "qc");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setQcBusy(false);
    }
  }
  const [reading, setReading] = useState(false);

  async function readFile(png: string) {
    setReading(true);
    try {
      const { styleNotes: notes, ...found } = await extractInfo(png);
      setInfo((cur) => {
        const next = { ...cur };
        (Object.keys(found) as (keyof PackInfo)[]).forEach((k) => {
          const v = found[k]?.trim();
          if (v && !(k === "language" && !LANGUAGES.includes(v))) next[k] = v;
        });
        return next;
      });
      setStyleNotes(notes ?? "");
      toast.success("Info and style read from your file — check the Product information form");
    } catch (e) {
      toast.error(`Couldn't read the file: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  }

  function choose(o: ConceptOption) {
    send(
      `I approve Concept ${o.n}: ${o.name}. Develop it into the FINAL CONCEPT tailored to this exact product, with front, sides and back panel layout.`,
      true,
    );
  }

  function designFromReady() {
    if (!readyConcept.trim() && !refFile) {
      toast.error("Paste your approved concept or upload a reference");
      return;
    }
    setBoardOpen(true);
    send(
      `This is my READY, ALREADY APPROVED concept — do not propose alternatives. Develop it into the FINAL CONCEPT tailored to this exact product, with front, sides and back panel layout.${refFile ? " A reference design image will also be used for the render." : ""}\n\nAPPROVED CONCEPT:\n${readyConcept.trim() || "(see reference image)"}`,
      true,
    );
  }

  // Style-guide task: load the guide library once, and once the picked guide's
  // context arrives from the project page, open the chat on it automatically.
  useEffect(() => {
    supabase
      .from("style_guides")
      .select("id,name,brand")
      .order("name")
      .then(({ data }) => setGuidesList(data ?? []));
    supabase
      .from("projects")
      .select("id,name,approved_concept")
      .neq("approved_concept", "")
      .order("created_at", { ascending: false })
      .then(({ data }) => setConceptProjects((data ?? []).filter((p) => p.id !== project.id)));
  }, [project.id]);
  useEffect(() => {
    if (pendingGuide && styleGuide && project.style_guide_id === pendingGuide) {
      setPendingGuide(null);
      void send(
        "I want to design using the attached style guide. First summarize its key rules in 2-3 lines; if it defines sub-styles or directions, ask me which one to use. Then propose 3 packaging concepts that strictly follow the guide.",
      );
    }
  }, [pendingGuide, styleGuide, project.style_guide_id]);

  async function onProduct(f?: File) {
    if (!f) return;
    setProductFile(f);
    const dataUrl = await fileToDataUrl(f);
    setProduct(dataUrl);
    const path = await saveFile("product", f, f.name);
    if (path) await supabase.from("projects").update({ product_path: path }).eq("id", project.id);
    // Semi-automatic flow: right after the photo lands, the AI asks the key questions
    if (messages.length === 0) {
      setTask("concept");
      void send(
        "I've just uploaded my product photo. Before designing, ask me the key questions in ONE short message: brand/product name, target audience, packaging type (blister / color box / display box / bottle label / other), and style direction. Do not propose concepts yet.",
        false,
        dataUrl,
      );
    }
  }

  async function send(override?: string, approve = false, productImage?: string, attach?: string[]) {
    const att = attach ?? (override ? undefined : attachImages.length ? attachImages : undefined);
    const text =
      override ||
      draft.trim() ||
      (att?.length ? "Design using the attached reference images." : "") ||
      (messages.length === 0 ? "Propose 3 packaging design concepts for this product." : "");
    if (!text || thinking) return;
    const next: ChatMsg[] = [...messages, { role: "user", text, images: att?.length ? att : undefined }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setDraft("");
    if (att === attachImages) clearAttach();
    setThinking(true);
    let full = "";
    try {
      await streamConcept(next, productImage ?? product, { styleGuide, learnings }, (d) => {
        full += d;
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", text: (c[c.length - 1]?.text ?? "") + d };
          return c;
        });
        chatEnd.current?.scrollIntoView({ block: "end" });
      });
      if (approve) {
        setApproved(full);
        void logActivity(project.id, "Final concept developed/updated", "concept");
        setBoardOpen(true);
        void renderMockup("front", full);
      } else if (parseConcepts(full).length > 0) {
        setBoardOpen(true);
      }
    } catch (e) {
      setMessages(next.slice(0, -1));
      setDraft(text);
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function renderMockup(view = "front", conceptText?: string, inBatch = false) {
    if (mockLock.current && !inBatch) return false;
    const concept = conceptText || approved || lastAssistant;
    if (!productFile || !concept) {
      toast.error(he ? "יש להעלות מוצר וליצור קונספט תחילה" : "Upload a product and create a concept first");
      return false;
    }
    const slot = slots.find((item) => item.id === view);
    if (!slot) return false;
    mockLock.current = true;
    setMockBusy(view);
    setMockups((m) => ({ ...m, [view]: undefined }));
    setMockFinal((f) => ({ ...f, [view]: false }));
    const form = new FormData();
    form.append(
      "prompt",
      `Photorealistic 3D studio render of THIS exact product (keep its real shape, proportions, material and structure) with the approved packaging graphics applied according to this design concept. ${slot.prompt} Soft studio lighting, seamless neutral backdrop, subtle shadow. If several concepts are listed, use the FINAL CONCEPT or the first one.${styleNotes ? `\n\nEXISTING BRAND STYLE (logo, fonts, imagery to reuse):\n${styleNotes.slice(0, 1200)}` : ""}\n\nCONCEPT:\n${concept.slice(0, 3500)}`,
    );
    form.append("image[]", productFile);
    if (refFile) form.append("image[]", refFile);
    try {
      await streamImage("/api/edit-image", form, (src, fin) => {
        setMockups((m) => ({ ...m, [view]: src }));
        setMockFinal((f) => ({ ...f, [view]: fin }));
        if (fin) void saveFile(mockupKind(view), src, `3D — ${he ? slot.he : slot.en}`);
      }, undefined, await authHeaders());
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setMockBusy(null);
      if (!inBatch) mockLock.current = false;
    }
  }

  async function renderRequestedMockups() {
    if (mockLock.current) return;
    mockLock.current = true;
    setMockBatch(true);
    try {
      for (const slot of slots) {
        if (mockFinal[slot.id] && mockups[slot.id]) continue;
        if (!await renderMockup(slot.id, undefined, true)) break;
      }
    } finally {
      mockLock.current = false;
      setMockBatch(false);
    }
  }

  async function onDieline(f?: File) {
    if (!f) return;
    try {
      const png = await dielineToPng(f);
      dielineOriginal.current = /\.(pdf|ai)$/i.test(f.name) ? await f.arrayBuffer() : undefined;
      setDieline(png);
      void readFile(png);
      void saveFile("dieline", png, f.name);
      setDielineName(f.name.replace(/\.[^.]+$/, ""));
      setArt(undefined);
      // Auto chain: a concept already exists → place artwork right away, no click needed
      if (concept) {
        toast.message("Concept found — placing artwork on the dieline automatically");
        void renderArtwork(undefined, png);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onDirectDesigns(files: File[]) {
    if (!files.length) return;
    setTask("direct");
    for (const f of files) {
      const dataUrl = await fileToDataUrl(f);
      setDirectDesigns((d) => {
        void saveFile(`design-direct-${d.length}`, dataUrl, f.name);
        return [...d, dataUrl];
      });
    }
    if (dieline) toast.message(he ? "יש פריסה — אפשר להעביר את העיצוב ישירות בשלב 05" : "Dieline found — transfer directly in step 05");
  }

  async function renderArtwork(extra?: string, dielineOverride?: string) {
    const dl = dielineOverride ?? dieline;
    if (!dl || (!concept && task !== "direct")) {
      toast.error("Upload a dieline and create a concept first");
      return;
    }
    setArtBusy(true);
    setArt(undefined);
    setArtFinal(false);
    const form = new FormData();
    const refs = Object.entries(mockups).filter(([v, src]) => src && mockFinal[v]).slice(0, 3) as [string, string][];
    if (product) refs.unshift(["original uploaded design", product]);
    if (task === "direct") refs.unshift(...directDesigns.filter(Boolean).slice(0, 4).map((src, i) => [`uploaded designed product ${i + 1}`, src] as [string, string]));
    const transferOnly = refs.length > 0;
    const transferPrompt = `TASK: TRANSFER AN EXISTING DESIGN ONTO A DIELINE — NOT A REDESIGN.
The first image is a flat packaging DIELINE. The other images are the EXISTING, FINAL design (${refs.map(([v]) => v).join(", ")}, in that order). Place this existing design onto the matching dieline panels exactly as it is.
STRICT RULES:
- Copy every letter of every text EXACTLY as it appears (Hebrew and English). Do not rewrite, add, remove, translate, shorten or "improve" any text. Do not add new text blocks.
- NEVER translate or change the language of the design. If the original design is in Hebrew, the output MUST stay in Hebrew. If it mixes Hebrew and English, keep the exact same mix.
- Keep the same logo, illustrations, colors, fonts, sizes and positions. Do not restyle or invent graphics.
- Do not rearrange content between panels; front stays on the front panel, back stays on the back panel.
- Only flatten the views (remove perspective, lighting, shadows) and scale them to fit each panel, with slight bleed.
- Keep the dieline geometry and canvas framing exactly the same. Panels with no visible source stay as a plain extension of the background color.${extra ? `\n\nONLY THESE CHANGES ARE ALLOWED:\n${extra}` : ""}`;
    form.append(
      "prompt",
      transferOnly
        ? transferPrompt
        : `The first image is a flat packaging DIELINE (cut and fold template). Fill every panel of this exact dieline with flat, print-ready packaging artwork. Keep the dieline geometry, panel positions, proportions and canvas framing EXACTLY the same — do not move, rotate, crop or redraw the outline. Artwork must be flat (no perspective, no shadows, no 3D), extend slightly past cut lines as bleed, and keep text upright on each panel's correct orientation. Leave the area outside the dieline plain white.\n\nLAYOUT RULE: The FRONT panel carries only the brand, product name and hero graphics. The BACK panel must hold the majority of the text and information (marketing text, usage instructions, warnings, ingredients, scent, expiry, lot no., manufacturer, importer, made in, grade, item number — each info type in its own separate block, Hebrew and English where provided) plus a white barcode box at its bottom. Side panels get secondary info.\n\n${infoPrompt(info)}${styleNotes ? `\n\nREUSE THE EXISTING BRAND STYLE from the uploaded file (logo, fonts, imagery):\n${styleNotes.slice(0, 1200)}` : ""}${extra ? `\n\nCUSTOMER CHANGES TO APPLY (highest priority):\n${extra}` : ""}\n\nCONCEPT:\n${concept.slice(0, 2500)}`,
    );
    form.append("input_fidelity", "high");
    form.append("image[]", await dataUrlToFile(dl, "dieline.png"));
    const srcImages = refs.slice(0, 4).map(([, src]) => src);
    for (const [v, src] of refs.slice(0, 4)) form.append("image[]", await dataUrlToFile(src, `${v.replace(/\W+/g, "-")}.png`));
    // Transfer mode: find the panels + faces in parallel, then paste the ORIGINAL
    // pixels over the AI layout so text/graphics are never redrawn or translated.
    const layoutP = transferOnly && !extra ? detectLayout(dl, srcImages).catch(() => undefined) : undefined;
    const finish = async (base?: string) => {
      let out = base;
      const layout = layoutP ? await layoutP : undefined;
      if (layout) {
        try {
          out = await composeExact({ dieline: dl, designs: srcImages, layout, base });
          toast.success(he ? "העיצוב המקורי הועתק לפריסה פיקסל-לפיקסל — הטקסטים לא שונו" : "Original design pasted onto the dieline pixel-for-pixel");
        } catch {
          /* keep AI result */
        }
      }
      if (!out) return;
      setArt(out);
      setArtFinal(true);
      void saveFile("artwork", out, extra ? "Artwork (revised)" : "Artwork");
      // Auto chain: run AI quality control as soon as the artwork is ready
      void runQc(out);
    };
    try {
      let finalSrc: string | undefined;
      await streamImage("/api/edit-image", form, (src, fin) => {
        if (fin) finalSrc = src;
        else setArt(src);
      }, undefined, await authHeaders());
      await finish(finalSrc);
    } catch (e) {
      if (layoutP) await finish();
      else toast.error((e as Error).message);
    } finally {
      setArtBusy(false);
    }
  }

  async function onMasterDieline(f?: File) {
    if (!f) return;
    try {
      const png = await dielineToPng(f);
      setMasterDieline(png);
      void saveFile("dieline-master", png, f.name);
      setMasterDielineName(f.name.replace(/\.[^.]+$/, ""));
      setMasterArt(undefined);
      if (concept) {
        toast.message("Concept found — placing master carton artwork automatically");
        void renderMasterArtwork(png);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function renderMasterArtwork(dielineOverride?: string) {
    const dl = dielineOverride ?? masterDieline;
    if (!dl || !concept) {
      toast.error("Upload a master carton dieline and create a concept first");
      return;
    }
    setMasterArtBusy(true);
    setMasterArt(undefined);
    setMasterArtFinal(false);
    const form = new FormData();
    form.append(
      "prompt",
      `The first image is a flat SHIPPING MASTER CARTON dieline (cut and fold template). Fill every panel of this exact dieline with flat, print-ready master carton artwork. Keep the dieline geometry, panel positions, proportions and canvas framing EXACTLY the same — do not move, rotate, crop or redraw the outline. Artwork must be flat (no perspective, no shadows, no 3D), extend slightly past cut lines as bleed, and keep text upright on each panel's correct orientation. Leave the area outside the dieline plain white.

LAYOUT RULE: master carton artwork is industrial and clear — main panels carry the brand and product name large, item number, quantity per carton (e.g. "24 units · יחידות"), gross/net weight, carton dimensions, a white barcode/shipping-label box, and standard handling marks (fragile, keep dry, this way up, stacking limit) drawn as simple line icons. Legal line: manufacturer, importer, made in. Hebrew and English where provided.${styleNotes ? `\n\nREUSE THE EXISTING BRAND STYLE (logo, fonts, imagery):\n${styleNotes.slice(0, 1200)}` : ""}\n\n${infoPrompt(info)}\n\nCONCEPT:\n${concept.slice(0, 2500)}`,
    );
    form.append("image[]", await dataUrlToFile(dl, "master-dieline.png"));
    try {
      await streamImage("/api/edit-image", form, (src, fin) => {
        setMasterArt(src);
        setMasterArtFinal(fin);
        if (fin) void saveFile("artwork-master", src, "Master carton artwork");
      }, undefined, await authHeaders());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMasterArtBusy(false);
    }
  }

  async function exportSvg() {
    if (!art || !dieline) return;
    setSvgBusy(true);
    try {
      const svg = await buildLayeredSvg(art, dieline, dielineName || "artwork", info);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      download(url, `${dielineName || "dieline"}-artwork.svg`);
      void saveFile("final", new Blob([svg], { type: "image/svg+xml" }), "Layered SVG for Illustrator");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setSvgBusy(false);
    }
  }

  async function exportAi() {
    if (!art || !dieline) return;
    setSvgBusy(true);
    try {
      const blob = await buildAiFile(art, dieline, dielineOriginal.current);
      const url = URL.createObjectURL(blob);
      download(url, `${dielineName || "dieline"}-artwork.ai`);
      void saveFile("final", blob, "Illustrator file (.ai)");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSvgBusy(false);
    }
  }

  const manualSources = [...directDesigns, ...Object.entries(mockups).filter(([v, src]) => src && mockFinal[v]).map(([, src]) => src as string), ...(product ? [product] : [])];

  return (
    <div>

      <DesignBoard
        open={boardOpen}
        onOpenChange={setBoardOpen}
        productFile={productFile}
        options={options}
        approved={approved}
        thinking={thinking}
        mockup={mockups["front"]}
        mockupFinal={mockFinal["front"] ?? false}
        mockBusy={mockBusy === "front"}
        onChoose={choose}
        onPreview={(o, src) => void saveFile("concept", src, `Concept ${o.n}: ${o.name}`)}
        onRender={() => renderMockup("front")}
        onRefine={(t) =>
          send(`${t}\n\nRestate the full updated design starting with "## FINAL CONCEPT".`, true)
        }
      />
      <main className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <SortableSteps group="left" className="flex flex-col gap-6">
          <Step key="product" n="01" titleKey="step.01">
            <label className="flex cursor-pointer items-center gap-4">
              <div className="bg-grid flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {product ? (
                  <img src={product} alt="Product" className="h-full w-full object-contain" />
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">+ photo</span>
                )}
              </div>
              <div className="text-sm">
                <p className="font-medium">{product ? t("st.replace") : t("st.upload")}</p>
                <p className="text-muted-foreground">{t("st.uploadhint")}</p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onProduct(e.target.files?.[0])}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
              <ItemsImport
                onPick={(patch) => {
                  setInfo((cur) => ({ ...cur, ...patch }));
                  if (!product && patch.productName) {
                    setDraft(`Design packaging for: ${patch.productName}`);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {project.project_type && project.project_type !== "single"
                  ? "Multi-item project — import the items list from Excel and pick an item to start; the info form fills automatically."
                  : "No photo? Upload an items list from Excel instead — picking an item fills the info form."}
              </p>
            </div>
            {product && (
              <div className="mt-5">
                <EditableTitle k="st.task" as="p" className="mb-2 font-mono text-xs uppercase tracking-wider text-accent" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["concept", t("st.task.concept"), t("st.task.concept.d")],
                      ["ready", t("st.task.ready"), t("st.task.ready.d")],
                      ["guide", t("st.task.guide"), t("st.task.guide.d")],
                      ["direct", t("st.task.direct"), t("st.task.direct.d")],
                    ] as const
                  ).map(([k, t, d]) => (
                    <button
                      key={k}
                      onClick={() => {
                        setTask(k);
                        if (k === "concept" && messages.length === 0) send();
                      }}
                      className={`rounded-md border p-4 text-left transition-colors ${task === k ? "border-accent bg-background ring-1 ring-accent" : "bg-background hover:border-foreground"}`}
                    >
                      <p className="font-semibold">{t}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                    </button>
                  ))}
                </div>
                {task === "ready" && !approved && (
                  <div className="mt-4 space-y-3">
                    {conceptProjects.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const p = conceptProjects.find((x) => x.id === e.target.value);
                          if (p) {
                            setReadyConcept(p.approved_concept);
                            toast.success(`Loaded the approved concept from "${p.name}"`);
                          }
                        }}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">…or pick an approved concept from another project</option>
                        {conceptProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <Textarea
                      value={readyConcept}
                      onChange={(e) => setReadyConcept(e.target.value)}
                      placeholder="Paste the approved concept: style, colors, fonts, graphics, messaging…"
                      className="min-h-32 bg-background"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="cursor-pointer rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-foreground">
                        {refFile ? `Reference: ${refFile.name}` : "+ Reference design image (optional)"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setRefFile(e.target.files?.[0])} />
                      </label>
                      <StepButton n="01" onClick={designFromReady} disabled={thinking}>
                        Design the product
                      </StepButton>
                    </div>
                  </div>
                )}
                {task === "guide" && (
                  <div className="mt-4 space-y-3">
                    {guidesList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No style guides yet — save one in the style guide library (side menu) first.
                      </p>
                    ) : (
                      <select
                        value={pendingGuide ?? project.style_guide_id ?? ""}
                        onChange={(e) => {
                          const gid = e.target.value || null;
                          if (!gid) return;
                          setPendingGuide(gid);
                          onStyleGuideChange?.(gid);
                        }}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Choose a style guide…</option>
                        {guidesList.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                            {g.brand ? ` — ${g.brand}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {pendingGuide && <p className="font-mono text-xs text-accent">Loading the guide — the chat will open on it in a moment…</p>}
                    {!pendingGuide && project.style_guide_id && (
                      <p className="text-xs text-muted-foreground">Guide attached — the chat will follow it and ask which sub-style to use.</p>
                    )}
                  </div>
                )}
                {task === "direct" && (
                  <div className="mt-4 space-y-3">
                    <label className="block cursor-pointer rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground hover:border-foreground">
                      {he ? "+ העלאת תמונות של המוצר המעוצב (אפשר כמה זוויות)" : "+ Upload photos of the designed product (several angles allowed)"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void onDirectDesigns(Array.from(e.target.files ?? []));
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {directDesigns.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {directDesigns.map((src, i) => (
                          <div key={i} className="relative">
                            <img src={src} alt="" className="size-20 rounded-md border object-cover" />
                            <button
                              type="button"
                              aria-label={he ? "הסרת תמונה" : "Remove image"}
                              onClick={() => setDirectDesigns((d) => d.filter((_, j) => j !== i))}
                              className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-card text-xs"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {directDesigns.length > 0 && (
                      <StepButton n="01" onClick={() => renderArtwork()} disabled={artBusy || !dieline}>
                        {artBusy ? (he ? "מעביר לפריסה…" : "Transferring…") : he ? "העברה ישירה לפריסה" : "Transfer directly to dieline"}
                      </StepButton>
                    )}
                    {directDesigns.length > 0 && !dieline && (
                      <p className="text-xs text-muted-foreground">
                        {he ? "כדי להעביר, העלה קודם פריסה בשלב 05 — ההעברה תתחיל אוטומטית." : "To transfer, upload a dieline in step 05 first — the transfer starts automatically."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Step>

          <Step key="concept" n="02" titleKey="step.02">
            <div
              ref={chatBox}
              className={`relative flex h-[460px] flex-col rounded-lg transition-shadow ${dropOver ? "ring-2 ring-accent" : ""}`}
            >
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {dropOver && (
                  <p className="pointer-events-none sticky top-0 z-10 rounded-md bg-accent px-3 py-1 text-center font-mono text-[11px] uppercase tracking-widest text-accent-foreground">
                    Drop images here · שחררו תמונות כאן
                  </p>
                )}
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Describe the brand, audience and mood — or just press send to get three concepts.
                    Works with or without a product photo. Then refine in chat, e.g. "Go with concept 2, make it more premium".
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
                        : "max-w-full whitespace-pre-wrap rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed"
                    }
                  >
                    {m.images?.length ? (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {m.images.map((src, j) => (
                          <img key={j} src={src} alt="" className="size-16 rounded-md border object-cover" />
                        ))}
                      </div>
                    ) : null}
                    {m.text || <span className="font-mono text-xs text-muted-foreground">thinking…</span>}
                  </div>
                ))}
                {(options.length > 0 || approved) && !thinking && (
                  <StepButton n="02" className="w-full" onClick={() => setBoardOpen(true)}>
                    {approved ? "View design on the board" : `Open design board · ${options.length} directions`}
                  </StepButton>
                )}
                {approved && !thinking && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-accent bg-background px-3 py-2">
                    <span className="font-mono text-xs text-accent">✓ FINAL CONCEPT APPROVED</span>
                    <Button size="sm" variant="ghost" onClick={() => setApproved("")}>
                      Change
                    </Button>
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              {attachImages.length > 0 && (
                <div className="mt-3">
                  <AttachmentStrip images={attachImages} onRemove={removeAttach} />
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <label
                  title="Attach images · צירוף תמונות"
                  className="grid size-11 cursor-pointer place-items-center self-end rounded-md border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
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
                      send();
                    }
                  }}
                  placeholder="Brand name, audience, mood, must-have info…"
                  className="min-h-[52px] resize-none bg-background"
                />
                <VoiceButton className="self-end" disabled={thinking} onText={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />
                <Button onClick={() => send()} disabled={thinking} className="h-auto self-stretch">
                  {thinking ? "…" : t("st.send")}
                </Button>
              </div>
            </div>
          </Step>

          <Step key="info" n="03" titleKey="step.03">
            <div className="mb-3">
              <ItemsImport onPick={(patch) => setInfo((cur) => ({ ...cur, ...patch }))} />
            </div>
            <InfoForm value={info} onChange={setInfo} />
          </Step>
        </SortableSteps>

        <SortableSteps group="right" className="flex flex-col gap-6">
          <Step key="mockup" n="04" titleKey="step.04">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <EditableTitle k="st.packconfigs" as="p" className="font-mono text-xs text-accent" />
              <span className="text-xs text-muted-foreground">{slots.length} {he ? "הדמיות" : "mockups"}</span>
            </div>
            <div className="mb-4 space-y-2">
              {PACKAGING_OPTIONS.map(({ id, en, he: hebrew }) => {
                const count = packCounts[id] ?? 0;
                const label = he ? hebrew : en;
                return <div key={id} className="flex min-w-0 items-center gap-2">
                  <Button size="sm" variant={count ? "secondary" : "outline"} aria-pressed={count > 0} disabled={mockBusy !== null || mockBatch} onClick={() => setPackagingCount(id, count ? 0 : 1)} className="min-w-0 flex-1 justify-start whitespace-normal text-start">
                    {count > 0 ? <Check /> : <Plus />}{label}
                  </Button>
                  {count > 0 && <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" title={he ? `פחות הדמיות: ${label}` : `Fewer mockups: ${label}`} aria-label={he ? `פחות הדמיות: ${label}` : `Fewer mockups: ${label}`} disabled={mockBusy !== null || mockBatch} onClick={() => setPackagingCount(id, count - 1)}><Minus /></Button>
                    <span className="w-6 text-center text-xs tabular-nums">{count}</span>
                    <Button size="icon" variant="ghost" title={he ? `עוד הדמיה: ${label}` : `More mockups: ${label}`} aria-label={he ? `עוד הדמיה: ${label}` : `More mockups: ${label}`} disabled={mockBusy !== null || mockBatch} onClick={() => setPackagingCount(id, count + 1)}><Plus /></Button>
                  </div>}
                </div>;
              })}
            </div>
            <Button variant="cut" className="mb-4 w-full whitespace-normal" onClick={renderRequestedMockups} disabled={mockBusy !== null || mockBatch || !concept || !productFile || slots.every((slot) => mockFinal[slot.id] && mockups[slot.id])}>
              {mockBatch ? <Loader2 className="animate-spin" /> : <Sparkles />}{he ? "יצירת ההדמיות החסרות" : "Generate missing mockups"}
            </Button>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {slots.map((slot) => {
                const view = slot.id;
                const label = he ? slot.he : slot.en;
                return <div key={view} data-mockup-slot={view} className="min-w-0">
                  <ImageSlot src={mockups[view]} final={mockFinal[view]} loading={mockBusy === view} empty={label} />
                  <p className="mt-1.5 break-words text-center text-xs font-medium">{label}</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <StepButton n="04" size="sm" onClick={() => renderMockup(view)} disabled={mockBusy !== null || mockBatch || !concept || !productFile}>
                      {mockBusy === view ? <Loader2 className="animate-spin" /> : null}{mockBusy === view ? (he ? "יוצר…" : "Rendering…") : mockups[view] ? t("st.rerender") : t("st.render")}
                    </StepButton>
                    {mockups[view] && mockFinal[view] && <Button size="icon" variant="outline" title={he ? `הורדת ${label}` : `Download ${label}`} aria-label={he ? `הורדת ${label}` : `Download ${label}`} onClick={() => { const image = mockups[view]; if (image) download(image, `mockup-${view}.png`); }}><Download /></Button>}
                  </div>
                </div>;
              })}
            </div>
          </Step>

          <Step key="dieline" n="05" titleKey="step.05">
            <label className="block cursor-pointer">
              <div className="bg-grid dash-cut flex aspect-[2/1] w-full items-center justify-center overflow-hidden rounded-md bg-muted">
                {dieline ? (
                  <img src={dieline} alt="Dieline" className="h-full w-full object-contain" />
                ) : (
                  <p className="px-4 text-center font-mono text-xs text-muted-foreground">
                    {t("st.adddieline")}
                    <br />
                    PDF · AI · PNG · JPG
                  </p>
                )}
              </div>
              <input
                type="file"
                accept=".pdf,.ai,.eps,image/png,image/jpeg"
                className="hidden"
                onChange={(e) => onDieline(e.target.files?.[0])}
              />
            </label>
            {dieline && manualSources.length > 0 && (
              <div className="mt-3">
                <ManualPlacement
                  dieline={dieline}
                  designs={manualSources}
                  onApply={(png) => {
                    setArt(png);
                    setArtFinal(true);
                    void saveFile("artwork", png, "Artwork (exact placement)");
                    toast.success(he ? "העיצוב הונח על הפריסה בדיוק כפי שהוא" : "Design placed on the dieline exactly as-is");
                  }}
                />
              </div>
            )}
            {(art || artBusy) && (
              <div className="mt-3">
                <ImageSlot src={art} final={artFinal} loading={artBusy} empty="Flat artwork appears here." />
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <StepButton n="05" onClick={() => renderArtwork()} disabled={artBusy || !dieline || (!concept && task !== "direct")}>
                {artBusy ? "Placing artwork…" : art ? t("st.regen") : t("st.place")}
              </StepButton>
              {art && artFinal && (
                <>
                  <Button onClick={exportSvg} disabled={svgBusy}>
                    {t("st.export")}
                  </Button>
                  <Button variant="outline" onClick={exportAi} disabled={svgBusy}>
                    Illustrator (.ai)
                  </Button>
                  <Button variant="outline" onClick={() => download(art, "artwork.png")}>
                    PNG
                  </Button>
                </>
              )}
            </div>
            {art && artFinal && (
              <div className="mt-4 rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-accent">AI quality control</p>
                  <Button size="sm" variant="outline" onClick={() => runQc()} disabled={qcBusy}>
                    {qcBusy ? "Checking…" : qc ? "Check again" : "Run quality check"}
                  </Button>
                </div>
                {qc && <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">{qc}</div>}
              </div>
            )}
            {(reading || styleNotes) && (
              <div className="mt-4 rounded-md border bg-background p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-accent">
                    {reading ? "Reading text, barcode and style from your file…" : "Style found in your file"}
                  </p>
                  {!reading && dieline && (
                    <Button size="sm" variant="ghost" onClick={() => readFile(dieline)}>
                      Read again
                    </Button>
                  )}
                </div>
                {styleNotes && (
                  <Textarea
                    value={styleNotes}
                    onChange={(e) => setStyleNotes(e.target.value)}
                    className="min-h-24 bg-card text-xs"
                  />
                )}
              </div>
            )}
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              The SVG has layers for Artwork, Dieline (multiply), a real vector EAN-13 barcode and a hidden Editable Text layer with your info. Open it in
              Illustrator with File › Open.
            </p>
            <div className="mt-5 border-t pt-4">
              <EditableTitle k="st.master" as="p" className="mb-2 font-mono text-xs uppercase tracking-wider text-accent" />
              <label className="block cursor-pointer">
                <div className="bg-grid dash-cut flex aspect-[2/1] w-full items-center justify-center overflow-hidden rounded-md bg-muted">
                  {masterDieline ? (
                    <img src={masterDieline} alt="Master carton dieline" className="h-full w-full object-contain" />
                  ) : (
                    <p className="px-4 text-center font-mono text-xs text-muted-foreground">
                      {t("st.addmaster")}
                      <br />
                      PDF · AI · PNG · JPG
                    </p>
                  )}
                </div>
                <input
                  type="file"
                  accept=".pdf,.ai,.eps,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => onMasterDieline(e.target.files?.[0])}
                />
              </label>
              {(masterArt || masterArtBusy) && (
                <div className="mt-3">
                  <ImageSlot src={masterArt} final={masterArtFinal} loading={masterArtBusy} empty="Master carton artwork appears here." />
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <StepButton n="05" onClick={() => renderMasterArtwork()} disabled={masterArtBusy || !masterDieline || !concept}>
                  {masterArtBusy ? "Placing artwork…" : masterArt ? "Regenerate carton artwork" : "Place artwork on carton dieline"}
                </StepButton>
                {masterArt && masterArtFinal && (
                  <Button variant="outline" onClick={() => download(masterArt, `${masterDielineName || "master-carton"}-artwork.png`)}>
                    PNG
                  </Button>
                )}
              </div>
            </div>
          </Step>
        </SortableSteps>
      </main>
    </div>
  );
}
