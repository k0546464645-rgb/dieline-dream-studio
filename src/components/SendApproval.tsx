import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, STAGES } from "@/lib/storage";
import { parseConcepts } from "@/components/DesignBoard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FileRow = { id: string; kind: string; label: string; path: string; url?: string | undefined };
type Project = { id: string; name: string; stage: string; customer_name: string; customer_email: string; customer_phone: string; messages: unknown; approved_concept: string };

export function approvalLink(token: string) {
  return `${window.location.origin}/approve/${token}`;
}

export function ShareLinks({ token, phone, email, projectName }: { token: string; phone?: string; email?: string; projectName: string }) {
  const link = approvalLink(token);
  const text = `Hello, please review and approve the design for "${projectName}": ${link}`;
  const [qr, setQr] = useState("");
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220 }).then(setQr).catch(() => {});
  }, [link]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input readOnly value={link} className="bg-card font-mono text-xs" />
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}>Copy</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="cut" size="sm">
          <a href={`https://wa.me/${(phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`mailto:${email ?? ""}?subject=${encodeURIComponent(`Design approval: ${projectName}`)}&body=${encodeURIComponent(text)}`}>Email</a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Message copied — paste it in WeChat"))}>
          Copy for WeChat
        </Button>
      </div>
      {qr && (
        <div className="flex items-center gap-3">
          <img src={qr} alt="QR code" className="h-28 w-28 rounded border" />
          <p className="text-xs text-muted-foreground">Scan with WeChat (or any phone camera) to open the approval page.</p>
        </div>
      )}
    </div>
  );
}

export function SendApproval({ project, files, open, onOpenChange, onCreated }: {
  project: Project;
  files: FileRow[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [stage, setStage] = useState(project.stage === "done" ? "production" : project.stage);
  const [role, setRole] = useState("customer");
  const [name, setName] = useState(project.customer_name);
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [useConcepts, setUseConcepts] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToken(null);
    setStage(project.stage === "done" ? "production" : project.stage);
    setRole(project.stage === "production" ? "purchasing" : "customer");
  }, [open, project.stage]);

  const msgs = Array.isArray(project.messages) ? (project.messages as { role: string; text: string }[]) : [];
  const conceptOpts = [...msgs].reverse().map((m) => (m.role === "assistant" ? parseConcepts(m.text) : [])).find((x) => x.length) ?? [];
  const images = files.filter((f) => f.kind !== "final" && f.kind !== "product");

  async function create() {
    const items: { label: string; path?: string; text?: string }[] = [];
    if (stage === "concept" && useConcepts && !project.approved_concept) {
      conceptOpts.forEach((o) => {
        const img = files.find((f) => f.kind === "concept" && f.label.startsWith(`Concept ${o.n}:`));
        items.push({ label: `Concept ${o.n}: ${o.name}`, text: o.body.slice(0, 1500), ...(img ? { path: img.path } : {}) });
      });
    }
    files.filter((f) => picked.includes(f.id)).forEach((f) => items.push({ label: f.label || f.kind, path: f.path }));
    if (!items.length) return toast.error("Choose at least one design or concept to send");
    const { data, error } = await supabase
      .from("approvals")
      .insert({ project_id: project.id, stage, recipient_name: name, recipient_role: role, message, items })
      .select("token")
      .single();
    if (error) return toast.error(error.message);
    await supabase.from("projects").update({ status: "awaiting_approval", stage }).eq("id", project.id);
    await logActivity(project.id, `Sent ${stage} for approval to ${name || role} (${role}), ${items.length} item(s)`, "approval");
    setToken(data.token);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-background sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{token ? "Approval link ready" : "Send for approval"}</DialogTitle>
        </DialogHeader>
        {token ? (
          <ShareLinks token={token} phone={role === "customer" ? project.customer_phone : ""} email={role === "customer" ? project.customer_email : ""} projectName={project.name} />
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Stage</Label>
                <select value={stage} onChange={(e) => setStage(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                  {STAGES.filter((s) => s.id !== "done").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Send to</Label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                  <option value="customer">Customer</option>
                  <option value="purchasing">Purchasing manager</option>
                  <option value="factory">Factory studio</option>
                  <option value="designer">External designer</option>
                </select>
              </div>
            </div>
            <div className="space-y-1"><Label>Recipient name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-card" /></div>
            <div className="space-y-1"><Label>Message</Label><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please choose your preferred concept and mark any changes." className="bg-card" /></div>
            {stage === "concept" && conceptOpts.length > 0 && !project.approved_concept && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useConcepts} onChange={(e) => setUseConcepts(e.target.checked)} />
                Include the {conceptOpts.length} concepts for the customer to choose from
              </label>
            )}
            <div className="space-y-1">
              <Label>Designs to include</Label>
              <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
                {images.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))}
                    className={`rounded-md border p-1 text-left ${picked.includes(f.id) ? "border-accent ring-2 ring-accent" : ""}`}
                  >
                    {f.url && <img src={f.url} alt="" className="aspect-square w-full rounded object-cover" />}
                    <p className="truncate px-1 pt-1 text-[11px]">{f.label || f.kind}</p>
                  </button>
                ))}
                {images.length === 0 && <p className="col-span-3 text-xs text-muted-foreground">No saved designs yet.</p>}
              </div>
            </div>
            <Button variant="cut" onClick={create}>Create approval link</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
