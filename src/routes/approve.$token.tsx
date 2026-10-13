import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getApproval, respondApproval } from "@/lib/approvals.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/approve/$token")({
  loader: async ({ params }) => getApproval({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Design approval — Dieline Studio" },
      { name: "description", content: "Review the packaging design and send your approval or changes." },
      { property: "og:title", content: "Design approval request" },
      { property: "og:description", content: "Review the packaging design and send your approval or changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovePage,
});

type Mark = { item: number; x: number; y: number; note: string };

function ApprovePage() {
  const a = Route.useLoaderData();
  const { token } = Route.useParams();
  const [chosen, setChosen] = useState<string | null>(a?.items.length === 1 ? a.items[0]!.label : null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(a?.recipient_name ?? "");
  const [done, setDone] = useState<string | null>(a && a.status !== "pending" ? a.status : null);
  const [busy, setBusy] = useState(false);

  if (!a) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">This approval link is not valid.</div>;
  }

  async function submit(status: "approved" | "changes" | "rejected") {
    if (!name.trim()) return toast.error("Please enter your name");
    if (status === "approved" && a!.items.length > 1 && !chosen) return toast.error("Please select the option you approve");
    if (status !== "approved" && !comment.trim() && marks.length === 0) return toast.error("Please describe the changes or add marks");
    setBusy(true);
    try {
      await respondApproval({ data: { token, status, chosen, comment, name, marks } });
      setDone(status);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-grid flex min-h-screen items-center justify-center p-6">
        <div className="crop-marks max-w-md rounded-lg border bg-card p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{a.projectName}</p>
          <h1 className="mt-2 text-3xl font-extrabold">
            {done === "approved" ? "Approved — thank you!" : done === "changes" ? "Changes sent — thank you!" : "Response sent"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">The design studio has been notified.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">approval request · {a.stage}</p>
      <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{a.projectName}</h1>
      {a.message && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-muted-foreground">{a.message}</p>}
      <p className="mt-2 text-sm text-muted-foreground">
        {a.items.length > 1 ? "Select the option you approve. " : ""}Click on an image to place a numbered mark with your note.
      </p>

      <div className={`mt-6 grid gap-6 ${a.items.length > 1 ? "md:grid-cols-2" : ""}`}>
        {a.items.map((it, idx) => (
          <div
            key={idx}
            className={`rounded-lg border bg-card p-4 transition-colors ${chosen === it.label ? "border-accent ring-2 ring-accent" : ""}`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{it.label}</h2>
              {a.items.length > 1 && (
                <Button size="sm" variant={chosen === it.label ? "cut" : "outline"} onClick={() => setChosen(it.label)}>
                  {chosen === it.label ? "✓ Selected" : "Select this"}
                </Button>
              )}
            </div>
            {it.url && (
              <div
                className="relative cursor-crosshair overflow-hidden rounded-md border bg-muted"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const note = window.prompt("Your note for this spot:");
                  if (note === null) return;
                  setMarks((m) => [...m, { item: idx, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, note }]);
                }}
              >
                <img src={it.url} alt={it.label} className="w-full" />
                {marks.map((m, mi) =>
                  m.item === idx ? (
                    <span
                      key={mi}
                      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-accent-foreground shadow"
                      style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
                    >
                      {mi + 1}
                    </span>
                  ) : null,
                )}
              </div>
            )}
            {it.text && <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">{it.text}</div>}
          </div>
        ))}
      </div>

      {marks.length > 0 && (
        <ol className="mt-6 space-y-1 text-sm">
          {marks.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="font-mono text-accent">{i + 1}.</span> {m.note || "(no note)"}
              <button className="text-xs text-muted-foreground underline" onClick={() => setMarks((x) => x.filter((_, j) => j !== i))}>
                remove
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8 grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-[1fr_2fr]">
        <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="bg-background" />
        <Textarea placeholder="Comments or requested changes" value={comment} onChange={(e) => setComment(e.target.value)} className="bg-background" />
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button variant="cut" disabled={busy} onClick={() => submit("approved")}>Approve</Button>
          <Button variant="outline" disabled={busy} onClick={() => submit("changes")}>Request changes</Button>
          <Button variant="ghost" disabled={busy} onClick={() => submit("rejected")}>Reject</Button>
        </div>
      </div>
    </div>
  );
}

