import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { usePrefs } from "@/lib/prefs";
import { EditableTitle } from "@/components/EditableTitle";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — Dieline Studio" }, { name: "description", content: "Customer list and quick onboarding." }, { property: "og:title", content: "Customers — Dieline Studio" }, { property: "og:description", content: "Customer list and quick onboarding." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Customers,
});

function Customers() {
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact_name: "", email: "", phone: "", notes: "" });

  const { data } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data: customers, error } = await supabase
        .from("customers")
        .select("id,name,contact_name,email,phone,notes,created_at")
        .order("name");
      if (error) throw error;
      const { data: projects } = await supabase.from("projects").select("customer_name");
      const counts = new Map<string, number>();
      for (const p of projects ?? []) {
        if (p.customer_name) counts.set(p.customer_name, (counts.get(p.customer_name) ?? 0) + 1);
      }
      return { customers: customers ?? [], counts };
    },
  });

  async function create() {
    if (!form.name.trim()) return toast.error("Give the customer a name");
    const { error } = await supabase.from("customers").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Customer added");
    setOpen(false);
    setForm({ name: "", contact_name: "", email: "", phone: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  const list = (data?.customers ?? []).filter((c) =>
    [c.name, c.contact_name, c.email, c.phone].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <main className="mx-auto max-w-[1500px] px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EditableTitle k="cust.kicker" as="p" className="font-mono text-xs uppercase tracking-widest text-accent" />
          <EditableTitle k="cust.title" as="h1" className="text-4xl font-extrabold tracking-tight" />
        </div>
        <div className="flex gap-2">
          <Input placeholder={t("cust.search")} value={q} onChange={(e) => setQ(e.target.value)} className="w-64 bg-card" />
          <Button variant="cut" onClick={() => setOpen(true)}>{t("cust.new")}</Button>
        </div>
      </div>

      <div className="mt-6 max-h-[calc(100vh-220px)] overflow-y-auto rounded-lg border bg-card">
        {list.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 last:border-0 hover:bg-secondary/50">
            <div className="min-w-48">
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm text-muted-foreground">{c.contact_name || "—"}</p>
            </div>
            <div className="min-w-48 text-sm text-muted-foreground">
              <p>{c.email || "—"}</p>
              <p dir="ltr" className="text-right md:text-left">{c.phone || "—"}</p>
            </div>
            <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px]">
              {data?.counts.get(c.name) ?? 0} {t("cust.projects")}
            </span>
          </div>
        ))}
        {data && list.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("cust.empty")}</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>{t("cust.form.title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {(
              [
                ["name", "cust.form.name"],
                ["contact_name", "cust.form.contact"],
                ["email", "cust.form.email"],
                ["phone", "cust.form.phone"],
              ] as const
            ).map(([k, l]) => (
              <div key={k} className="space-y-1">
                <Label>{t(l)}</Label>
                <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="bg-card" />
              </div>
            ))}
            <div className="space-y-1">
              <Label>{t("cust.form.notes")}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-card" rows={2} />
            </div>
            <Button variant="cut" onClick={create}>{t("cust.form.add")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
