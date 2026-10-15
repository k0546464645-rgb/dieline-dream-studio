import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, MessageSquareText, PackageCheck, ScanSearch, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dieline Studio — AI packaging concepts, artwork & approvals" },
      {
        name: "description",
        content:
          "Develop packaging concepts with AI, place artwork on your dielines, manage style guides and run customer and factory approvals in one place.",
      },
      { property: "og:title", content: "Dieline Studio" },
      { property: "og:description", content: "From product photo to approved, production-ready packaging artwork." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FLOW = [
  { icon: ScanSearch, t: "Upload & brief", d: "Drop a product photo or an Excel item list — the AI asks the right questions and reads your files." },
  { icon: MessageSquareText, t: "Concepts in chat", d: "Get creative directions tied to your style guides, pick one, and refine it in conversation." },
  { icon: Boxes, t: "3D & artwork", d: "One click renders the product mockup, places print-ready artwork on your dieline and runs quality control." },
  { icon: Send, t: "Approvals", d: "Send a link by WhatsApp or email — the customer marks, approves or requests changes, and the AI applies them." },
  { icon: PackageCheck, t: "Production", d: "Export a layered SVG for Illustrator with a vector barcode and every info block in place." },
];

function Landing() {
  return (
    <div className="bg-grid min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-mono text-sm font-bold text-accent-foreground">DS</span>
          <span className="text-lg font-extrabold tracking-tight">Dieline Studio</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 text-center md:py-24">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">
            concept → design → dieline → approval → production
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
            The packaging studio that runs itself
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Upload a product, answer a few smart questions, and let AI carry the design all the way to approved,
            production-ready artwork.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="cut" size="lg" className="glow-cut">
              <Link to="/dashboard">
                Open the studio <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map(({ icon: Icon, t, d }, i) => (
            <div key={t} className="crop-marks rounded-lg border bg-card p-5">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-accent" />
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
