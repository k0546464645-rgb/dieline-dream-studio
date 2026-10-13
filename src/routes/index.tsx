import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/stream-image";
import {
  buildLayeredSvg,
  dataUrlToFile,
  dielineToPng,
  download,
  fileToDataUrl,
  streamConcept,
  type ChatMsg,
} from "@/lib/studio-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dieline Studio — AI packaging concepts, 3D mockups & print-ready artwork" },
      {
        name: "description",
        content:
          "Upload your product, develop a packaging concept in chat, preview it as a 3D mockup and place the artwork on your own dieline for Illustrator.",
      },
      { property: "og:title", content: "Dieline Studio" },
      {
        property: "og:description",
        content: "From product photo to concept, 3D mockup and dieline artwork ready for Illustrator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

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
  src?: string;
  final?: boolean;
  empty: string;
  loading?: boolean;
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

function Studio() {
  const [product, setProduct] = useState<string>();
  const [productFile, setProductFile] = useState<File>();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
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

  const chatEnd = useRef<HTMLDivElement>(null);
  const concept = [...messages].reverse().find((m) => m.role === "assistant")?.text ?? "";

  async function onProduct(f?: File) {
    if (!f) return;
    setProductFile(f);
    setProduct(await fileToDataUrl(f));
  }

  async function send() {
    const text =
      draft.trim() ||
      (messages.length === 0 ? "Propose 3 packaging design concepts for this product." : "");
    if (!text || thinking) return;
    if (messages.length === 0 && !product) {
      toast.error("Upload a product photo first");
      return;
    }
    const next: ChatMsg[] = [...messages, { role: "user", text }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setDraft("");
    setThinking(true);
    try {
      await streamConcept(next, product, (d) => {
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", text: c[c.length - 1].text + d };
          return c;
        });
        chatEnd.current?.scrollIntoView({ block: "end" });
      });
    } catch (e) {
      setMessages(next.slice(0, -1));
      setDraft(text);
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function renderMockup() {
    if (!productFile || !concept) return toast.error("Upload a product and create a concept first");
    setMockBusy(true);
    setMockup(undefined);
    setMockupFinal(false);
    const form = new FormData();
    form.append(
      "prompt",
      `Photorealistic 3D studio product render of THIS exact product (keep its real shape, proportions, material and structure) with new packaging graphics applied according to this design concept. Three-quarter view, soft studio lighting, seamless neutral backdrop, subtle shadow. If several concepts are listed, use the FINAL CONCEPT or the first one.\n\nCONCEPT:\n${concept.slice(0, 3500)}`,
    );
    form.append("image[]", productFile);
    try {
      await streamImage("/api/edit-image", form, (src, fin) => {
        setMockup(src);
        setMockupFinal(fin);
      });
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
      setDielineName(f.name.replace(/\.[^.]+$/, ""));
      setArt(undefined);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function renderArtwork() {
    if (!dieline || !concept) return toast.error("Upload a dieline and create a concept first");
    setArtBusy(true);
    setArt(undefined);
    setArtFinal(false);
    const form = new FormData();
    form.append(
      "prompt",
      `The first image is a flat packaging DIELINE (cut and fold template). Fill every panel of this exact dieline with flat, print-ready packaging artwork. Keep the dieline geometry, panel positions, proportions and canvas framing EXACTLY the same — do not move, rotate, crop or redraw the outline. Artwork must be flat (no perspective, no shadows, no 3D), extend slightly past cut lines as bleed, and keep text upright on each panel's correct orientation. Leave the area outside the dieline plain white.${mockup ? " The second image is the approved 3D mockup — match its graphics, colors and typography exactly." : ""}\n\nCONCEPT:\n${concept.slice(0, 3000)}`,
    );
    form.append("image[]", await dataUrlToFile(dieline, "dieline.png"));
    if (mockup && mockupFinal) form.append("image[]", await dataUrlToFile(mockup, "mockup.png"));
    try {
      await streamImage("/api/edit-image", form, (src, fin) => {
        setArt(src);
        setArtFinal(fin);
      });
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
      const svg = await buildLayeredSvg(art, dieline, dielineName || "artwork");
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      download(url, `${dielineName || "dieline"}-artwork.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setSvgBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-6 px-6 py-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-accent">
              concept → mockup → dieline → illustrator
            </p>
            <h1 className="mt-1 text-4xl font-extrabold tracking-tight md:text-5xl">Dieline Studio</h1>
          </div>
          <div className="dash-cut hidden rounded-md px-3 py-2 font-mono text-xs text-muted-foreground md:block">
            cut line ┄┄┄ fold line ── bleed 3mm
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.05fr_1fr]">
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
          </Step>

          <Step n="02" title="Design concept">
            <div className="flex h-[460px] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Describe the brand, audience and mood — or just press send to get three concepts.
                    Then refine in chat, e.g. "Go with concept 2, make it more premium".
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
                <Button onClick={send} disabled={thinking} className="h-auto self-stretch">
                  {thinking ? "…" : "Send"}
                </Button>
              </div>
            </div>
          </Step>
        </div>

        <div className="flex flex-col gap-6">
          <Step n="03" title="3D mockup">
            <ImageSlot
              src={mockup}
              final={mockupFinal}
              loading={mockBusy}
              empty="Your product rendered with the new concept appears here."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="cut" onClick={renderMockup} disabled={mockBusy || !concept || !productFile}>
                {mockBusy ? "Rendering…" : mockup ? "Re-render mockup" : "Render 3D mockup"}
              </Button>
              {mockup && mockupFinal && (
                <Button variant="outline" onClick={() => download(mockup, "mockup.png")}>
                  Download PNG
                </Button>
              )}
            </div>
          </Step>

          <Step n="04" title="Artwork on your dieline">
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
              <Button variant="cut" onClick={renderArtwork} disabled={artBusy || !dieline || !concept}>
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
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              The SVG has two layers — Artwork and Dieline (multiply) — sized to your dieline. Open it in
              Illustrator with File › Open.
            </p>
          </Step>
        </div>
      </main>
    </div>
  );
}
