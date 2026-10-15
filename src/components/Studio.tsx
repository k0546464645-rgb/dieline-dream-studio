import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, pathToFile, signedUrl, uploadToStudio } from "@/lib/storage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/stream-image";
import { authHeaders } from "@/lib/studio-client";
import {
  buildLayeredSvg,
  dataUrlToFile,
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


function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="crop-marks rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-xs text-accent">{n}</span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
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
  return (
    <div className="bg-grid flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted">
      {src ? (
        <img
          src={src}
          alt=""
          className={`h-full w-full object-contain transition-[filter] duration-700 ${final ? "blur-0" : "blur-2xl"}`}
        />
      ) : (
        <p className="px-6 text-center font-mono text-xs text-muted-foreground">
          {loading ? "Rendering…" : empty}
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
}: {
  project: StudioProject;
  styleGuide?: { text: string; images: string[] } | undefined;
  learnings?: string | undefined;
  instruction?: StudioInstruction;
  onInstructionDone?: () => void;
  onFilesChanged?: () => void;
}) {
  const [product, setProduct] = useState<string>();
  const [productFile, setProductFile] = useState<File>();
  const [messages, setMessages] = useState<ChatMsg[]>(Array.isArray(project.messages) ? (project.messages as ChatMsg[]) : []);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const [mockup, setMockup] = useState<string>();
  const [mockupFinal, setMockupFinal] = useState(false);
  const [mockBusy, setMockBusy] = useState(false);

  const [dieline, setDieline] = useState<string>();
  const [dielineName, setDielineName] = useState("");
  const [art, setArt] = useState<string>();
  const [artFinal, setArtFinal] = useState(false);
  const [artBusy, setArtBusy] = useState(false);
  const [svgBusy, setSvgBusy] = useState(false);

  const [approved, setApproved] = useState<string>(project.approved_concept ?? "");
  const [info, setInfo] = useState<PackInfo>({ ...emptyInfo, ...((project.info as Partial<PackInfo>) ?? {}) });
  const chatEnd = useRef<HTMLDivElement>(null);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.text ?? "";
  const concept = approved || lastAssistant;
  const options = approved ? [] : parseConcepts(lastAssistant);
  const [task, setTask] = useState<"concept" | "ready" | null>(null);
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
        .in("kind", ["dieline", "mockup", "artwork"])
        .order("created_at", { ascending: false });
      const latest = (k: string) => data?.find((d) => d.kind === k);
      const d = latest("dieline"), m = latest("mockup"), a = latest("artwork");
      if (d) { setDieline(await urlToDataUrl(await signedUrl(d.path))); setDielineName(d.label || "dieline"); }
      if (m) { setMockup(await urlToDataUrl(await signedUrl(m.path))); setMockupFinal(true); }
      if (a) { setArt(await urlToDataUrl(await signedUrl(a.path))); setArtFinal(true); }
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

  async function send(override?: string, approve = false, productImage?: string) {
    const text =
      override ||
      draft.trim() ||
      (messages.length === 0 ? "Propose 3 packaging design concepts for this product." : "");
    if (!text || thinking) return;
    const next: ChatMsg[] = [...messages, { role: "user", text }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setDraft("");
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
        void renderMockup(full);
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

  async function renderMockup(conceptText?: string) {
    const concept = conceptText || approved || lastAssistant;
    if (!productFile || !concept) {
      toast.error("Upload a product and create a concept first");
      return;
    }
    setMockBusy(true);
    setMockup(undefined);
    setMockupFinal(false);
    const form = new FormData();
    form.append(
      "prompt",
      `Photorealistic 3D studio product render of THIS exact product (keep its real shape, proportions, material and structure) with new packaging graphics applied according to this design concept. Three-quarter view, soft studio lighting, seamless neutral backdrop, subtle shadow. If several concepts are listed, use the FINAL CONCEPT or the first one.${styleNotes ? `\n\nEXISTING BRAND STYLE (logo, fonts, imagery to reuse):\n${styleNotes.slice(0, 1200)}` : ""}\n\nCONCEPT:\n${concept.slice(0, 3500)}`,
    );
    form.append("image[]", productFile);
    if (refFile) form.append("image[]", refFile);
    try {
      await streamImage("/api/edit-image", form, (src, fin) => {
        setMockup(src);
        setMockupFinal(fin);
        if (fin) void saveFile("mockup", src, "3D design");
      }, undefined, await authHeaders());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMockBusy(false);
    }
  }

  async function onDieline(f?: File) {
    if (!f) return;
    try {
      const png = await dielineToPng(f);
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

  async function renderArtwork(extra?: string, dielineOverride?: string) {
    const dl = dielineOverride ?? dieline;
    if (!dl || !concept) {
      toast.error("Upload a dieline and create a concept first");
      return;
    }
    setArtBusy(true);
    setArt(undefined);
    setArtFinal(false);
    const form = new FormData();
    form.append(
      "prompt",
      `The first image is a flat packaging DIELINE (cut and fold template). Fill every panel of this exact dieline with flat, print-ready packaging artwork. Keep the dieline geometry, panel positions, proportions and canvas framing EXACTLY the same — do not move, rotate, crop or redraw the outline. Artwork must be flat (no perspective, no shadows, no 3D), extend slightly past cut lines as bleed, and keep text upright on each panel's correct orientation. Leave the area outside the dieline plain white.${mockup ? " The second image is the approved 3D mockup — match its graphics, colors and typography exactly." : ""}\n\nLAYOUT RULE: The FRONT panel carries only the brand, product name and hero graphics. The BACK panel must hold the majority of the text and information (marketing text, usage instructions, warnings, ingredients, scent, expiry, lot no., manufacturer, importer, made in, grade, item number — each info type in its own separate block, Hebrew and English where provided) plus a white barcode box at its bottom. Side panels get secondary info.\n\n${infoPrompt(info)}${styleNotes ? `\n\nREUSE THE EXISTING BRAND STYLE from the uploaded file (logo, fonts, imagery):\n${styleNotes.slice(0, 1200)}` : ""}${extra ? `\n\nCUSTOMER CHANGES TO APPLY (highest priority):\n${extra}` : ""}\n\nCONCEPT:\n${concept.slice(0, 2500)}`,
    );
    form.append("image[]", await dataUrlToFile(dl, "dieline.png"));
    if (mockup && mockupFinal) form.append("image[]", await dataUrlToFile(mockup, "mockup.png"));
    try {
      await streamImage("/api/edit-image", form, (src, fin) => {
        setArt(src);
        setArtFinal(fin);
        if (fin) {
          void saveFile("artwork", src, extra ? "Artwork (revised)" : "Artwork");
          // Auto chain: run AI quality control as soon as the artwork is ready
          void runQc(src);
        }
      }, undefined, await authHeaders());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setArtBusy(false);
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

  return (
    <div>

      <DesignBoard
        open={boardOpen}
        onOpenChange={setBoardOpen}
        productFile={productFile}
        options={options}
        approved={approved}
        thinking={thinking}
        mockup={mockup}
        mockupFinal={mockupFinal}
        mockBusy={mockBusy}
        onChoose={choose}
        onPreview={(o, src) => void saveFile("concept", src, `Concept ${o.n}: ${o.name}`)}
        onRender={() => renderMockup()}
        onRefine={(t) =>
          send(`${t}\n\nRestate the full updated design starting with "## FINAL CONCEPT".`, true)
        }
      />
      <main className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-6">
          <Step n="01" title="Your product">
            <label className="flex cursor-pointer items-center gap-4">
              <div className="bg-grid flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {product ? (
                  <img src={product} alt="Product" className="h-full w-full object-contain" />
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">+ photo</span>
                )}
              </div>
              <div className="text-sm">
                <p className="font-medium">{product ? "Replace product photo" : "Upload a product photo"}</p>
                <p className="text-muted-foreground">JPG or PNG of the real product or its current pack.</p>
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
              <p className="text-xs text-muted-foreground">No photo? Upload an items list from Excel instead — picking an item fills the info form.</p>
            </div>
            {product && (
              <div className="mt-5">
                <p className="mb-2 font-mono text-xs uppercase tracking-wider text-accent">Choose a task</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["concept", "Create a concept", "Get several creative directions, style guides and visuals to choose from."],
                      ["ready", "Design from approved concept", "Already have a concept? Paste it and go straight to the design."],
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
                      <Button variant="cut" onClick={designFromReady} disabled={thinking}>
                        Design the product
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Step>

          <Step n="02" title="Design concept">
            <div className="flex h-[460px] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
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
                    {m.text || <span className="font-mono text-xs text-muted-foreground">thinking…</span>}
                  </div>
                ))}
                {(options.length > 0 || approved) && !thinking && (
                  <Button variant="cut" className="w-full" onClick={() => setBoardOpen(true)}>
                    {approved ? "View design on the board" : `Open design board · ${options.length} directions`}
                  </Button>
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
              <div className="mt-3 flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Brand name, audience, mood, must-have info…"
                  className="min-h-[52px] resize-none bg-background"
                />
                <Button onClick={() => send()} disabled={thinking} className="h-auto self-stretch">
                  {thinking ? "…" : "Send"}
                </Button>
              </div>
            </div>
          </Step>

          <Step n="03" title="Product information">
            <div className="mb-3">
              <ItemsImport onPick={(patch) => setInfo((cur) => ({ ...cur, ...patch }))} />
            </div>
            <InfoForm value={info} onChange={setInfo} />
          </Step>
        </div>

        <div className="flex flex-col gap-6">
          <Step n="04" title="3D mockup">
            <ImageSlot
              src={mockup}
              final={mockupFinal}
              loading={mockBusy}
              empty="Your product rendered with the new concept appears here."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="cut" onClick={() => renderMockup()} disabled={mockBusy || !concept || !productFile}>
                {mockBusy ? "Rendering…" : mockup ? "Re-render mockup" : "Render 3D mockup"}
              </Button>
              {mockup && mockupFinal && (
                <Button variant="outline" onClick={() => download(mockup, "mockup.png")}>
                  Download PNG
                </Button>
              )}
            </div>
          </Step>

          <Step n="05" title="Artwork on your dieline">
            <div className="grid grid-cols-2 gap-3">
              <label className="cursor-pointer">
                <div className="bg-grid dash-cut flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
                  {dieline ? (
                    <img src={dieline} alt="Dieline" className="h-full w-full object-contain" />
                  ) : (
                    <p className="px-4 text-center font-mono text-xs text-muted-foreground">
                      + dieline
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
              <ImageSlot src={art} final={artFinal} loading={artBusy} empty="Flat artwork appears here." />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="cut" onClick={() => renderArtwork()} disabled={artBusy || !dieline || !concept}>
                {artBusy ? "Placing artwork…" : art ? "Regenerate artwork" : "Place artwork on dieline"}
              </Button>
              {art && artFinal && (
                <>
                  <Button onClick={exportSvg} disabled={svgBusy}>
                    Export layered SVG for Illustrator
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
          </Step>
        </div>
      </main>
    </div>
  );
}
