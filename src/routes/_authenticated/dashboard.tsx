import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Boxes,
  DraftingCompass,
  Factory,
  Layers,
  Lightbulb,
  Package,
  Pencil,
  Plus,
  Rocket,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_TYPES, signedUrls, STAGES } from "@/lib/storage";
import { usePrefs, type DictKey } from "@/lib/prefs";
import { IdeasStrip } from "@/components/IdeasStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Projects — Dieline Studio" }, { name: "description", content: "All packaging projects." }] }),
  component: Dashboard,
});

const STAGE_ICONS: Record<string, LucideIcon> = {
  concept: Lightbulb,
  artwork: DraftingCompass,
  final: BadgeCheck,
  production: Factory,
  done: Rocket,
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  single: Package,
  multiple: Layers,
  series: Boxes,
  collection: Sparkles,
};

function Dashboard() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", customer_name: "", customer_email: "", customer_phone: "", supplier: "", supplier_item: "", project_type: "single" });

  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,customer_name,supplier,stage,status,product_path,project_type,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const urls = await signedUrls((data ?? []).map((p) => p.product_path).filter(Boolean) as string[]);
      const { data: pending } = await supabase.from("approvals").select("project_id").eq("status", "pending");
      return { projects: data ?? [], urls, pending: new Set((pending ?? []).map((p) => p.project_id)) };
    },
  });

  async function create() {
    if (!form.name.trim()) return toast.error("Give the project a name");
    const { data: p, error } = await supabase.from("projects").insert(form).select("id").single();
    if (error) return toast.error(error.message);
    await supabase.from("activity").insert({ project_id: p.id, message: "Project created", kind: "note" });
    navigate({ to: "/projects/$id", params: { id: p.id } });
  }

  const list = (data?.projects ?? []).filter((p) =>
    [p.name, p.customer_name, p.supplier].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-accent">{t("dash.control")}</p>
            <h1 className="text-4xl font-extrabold tracking-tight">{t("dash.title")}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("dash.search")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-72 bg-card pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => navigate({ to: "/ideas" })}>
              <Lightbulb className="size-4" />
              {t("dash.freeideas")}
            </Button>
            <Button variant="cut" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {t("dash.new")}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {STAGES.map((s, i) => {
            const Icon = STAGE_ICONS[s.id] ?? Package;
            const count = (data?.projects ?? []).filter((p) => p.stage === s.id).length;
            return (
              <div key={s.id} className="neon-card rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-md bg-secondary text-accent">
                    <Icon className="size-4" />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">0{i + 1}</span>
                </div>
                <p className="mt-3 font-mono text-[11px] uppercase text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{count}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((p) => {
            const TypeIcon = TYPE_ICONS[p.project_type] ?? Package;
            return (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="neon-card group rounded-xl p-4">
                <div className="bg-grid flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {p.product_path && data?.urls[p.product_path] ? (
                    <img src={data.urls[p.product_path]} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <TypeIcon className="size-10 text-accent/50" />
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  <button
                    aria-label="Rename project"
                    title="Rename · שינוי שם"
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenaming({ id: p.id, name: p.name });
                    }}
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">{[p.customer_name, p.supplier].filter(Boolean).join(" · ") || "—"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px]">
                  <span className="rounded bg-secondary px-2 py-0.5">{stageLabel(p.stage)}</span>
                  <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5">
                    <TypeIcon className="size-3 text-accent" />
                    {projectTypeLabel(p.project_type)}
                  </span>
                  {data?.pending.has(p.id) && <span className="rounded bg-accent px-2 py-0.5 text-accent-foreground">awaiting reply</span>}
                  {p.status === "changes_requested" && <span className="rounded border border-accent px-2 py-0.5 text-accent">changes requested</span>}
                </div>
              </Link>
            );
          })}
          {data && list.length === 0 && <p className="text-sm text-muted-foreground">No projects yet — create the first one.</p>}
        </div>

        <IdeasStrip />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Project type · סוג הפרויקט</Label>
              <div className="grid grid-cols-2 gap-2">
                {PROJECT_TYPES.map((t) => {
                  const Icon = TYPE_ICONS[t.id] ?? Package;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm({ ...form, project_type: t.id })}
                      className={`rounded-md border p-3 text-left transition-colors ${form.project_type === t.id ? "border-accent bg-card ring-1 ring-accent" : "bg-card hover:border-foreground"}`}
                    >
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <Icon className="size-4 text-accent" />
                        {t.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            {(
              [
                ["name", "Project / product name"],
                ["customer_name", "Customer"],
                ["customer_email", "Customer email"],
                ["customer_phone", "Customer WhatsApp / phone (with country code)"],
                ["supplier", "Supplier / factory"],
                ["supplier_item", "Supplier item / model no."],
              ] as const
            ).map(([k, l]) => (
              <div key={k} className="space-y-1">
                <Label>{l}</Label>
                <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="bg-card" />
              </div>
            ))}
            <Button variant="cut" onClick={create}>Create project</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Rename project · שינוי שם פרויקט</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              autoFocus
              value={renaming?.name ?? ""}
              onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
              onKeyDown={(e) => e.key === "Enter" && renameProject()}
              className="bg-card"
            />
            <Button variant="cut" onClick={renameProject}>Save name</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );

  async function renameProject() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) return toast.error("Give the project a name");
    const { error } = await supabase.from("projects").update({ name }).eq("id", renaming.id);
    if (error) return toast.error(error.message);
    setRenaming(null);
    qc.invalidateQueries({ queryKey: ["projects"] });
  }
}
