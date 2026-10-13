import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NEXT: Record<string, string> = { concept: "artwork", artwork: "final", final: "production", production: "done" };

export type ApprovalItem = { label: string; path?: string; text?: string; url?: string };

/** Public: loads an approval request by its secret token (no login). */
export const getApproval = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a } = await supabaseAdmin
      .from("approvals")
      .select("id,stage,recipient_name,recipient_role,message,items,status,chosen,comment,marks,responder_name,responded_at,project_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!a) return null;
    const { data: p } = await supabaseAdmin.from("projects").select("name,customer_name").eq("id", a.project_id).single();
    const items = (a.items as ApprovalItem[]) ?? [];
    const paths = items.map((i) => i.path).filter(Boolean) as string[];
    const urls: Record<string, string> = {};
    if (paths.length) {
      const { data: s } = await supabaseAdmin.storage.from("studio").createSignedUrls(paths, 60 * 60 * 24);
      s?.forEach((x) => x.path && x.signedUrl && (urls[x.path] = x.signedUrl));
    }
    const { project_id: _omit, ...rest } = a;
    return {
      ...rest,
      projectName: p?.name ?? "",
      items: items.map((i) => ({ label: i.label, text: i.text ?? "", url: i.path ? urls[i.path] ?? "" : "" })),
    };
  });

const markSchema = z.object({ item: z.number().int().min(0).max(50), x: z.number().min(0).max(1), y: z.number().min(0).max(1), note: z.string().max(500) });

/** Public: the recipient approves, rejects or asks for changes. */
export const respondApproval = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().uuid(),
        status: z.enum(["approved", "changes", "rejected"]),
        chosen: z.string().max(200).nullable(),
        comment: z.string().max(4000),
        name: z.string().trim().min(1).max(100),
        marks: z.array(markSchema).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a } = await supabaseAdmin.from("approvals").select("id,status,stage,project_id,recipient_role").eq("token", data.token).maybeSingle();
    if (!a) throw new Error("Approval link not found");
    if (a.status !== "pending") throw new Error("This request was already answered");
    await supabaseAdmin
      .from("approvals")
      .update({
        status: data.status,
        chosen: data.chosen,
        comment: data.comment,
        marks: data.marks,
        responder_name: data.name,
        responded_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    const label = data.status === "approved" ? "APPROVED" : data.status === "changes" ? "asked for changes" : "REJECTED";
    await supabaseAdmin.from("activity").insert({
      project_id: a.project_id,
      kind: "approval",
      actor: `${data.name} (${a.recipient_role})`,
      message: `${a.stage} ${label}${data.chosen ? ` — chose "${data.chosen}"` : ""}${data.comment ? `: ${data.comment}` : ""}${data.marks.length ? ` (${data.marks.length} marks)` : ""}`,
    });
    const update: Record<string, string> = { status: data.status === "approved" ? "approved" : "changes_requested", updated_at: new Date().toISOString() };
    if (data.status === "approved") update["stage"] = NEXT[a.stage] ?? a.stage;
    await supabaseAdmin.from("projects").update(update).eq("id", a.project_id);
    return { ok: true };
  });
