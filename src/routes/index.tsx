import { createFileRoute, Link } from "@tanstack/react-router";
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

function Landing() {
  return (
    <div className="bg-grid flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">
        concept → design → dieline → approval → production
      </p>
      <h1 className="mt-3 text-6xl font-extrabold tracking-tight md:text-7xl">Dieline Studio</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        One screen to design packaging with AI, keep every project and style guide, and get customer and factory
        sign-off.
      </p>
      <Button asChild variant="cut" size="lg" className="mt-8">
        <Link to="/dashboard">Open the studio</Link>
      </Button>
    </div>
  );
}
