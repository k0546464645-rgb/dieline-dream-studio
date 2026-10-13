import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "studio";

export async function uploadToStudio(folder: string, data: Blob | string, name: string) {
  const blob = typeof data === "string" ? await (await fetch(data)).blob() : data;
  const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  const path = `${folder}/${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "image/png",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function signedUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  data?.forEach((d) => {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  });
  return out;
}

export async function pathToFile(path: string, name = "file.png") {
  const url = await signedUrl(path);
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export async function logActivity(projectId: string, message: string, kind = "note") {
  const { data } = await supabase.auth.getUser();
  await supabase.from("activity").insert({
    project_id: projectId,
    message,
    kind,
    actor: data.user?.email ?? "",
  });
}

export const STAGES = [
  { id: "concept", label: "Concept approval" },
  { id: "artwork", label: "Artwork + dieline approval" },
  { id: "final", label: "Final artwork approval" },
  { id: "production", label: "Purchasing / factory sign-off" },
  { id: "done", label: "Ready for production" },
] as const;

export function stageLabel(id: string) {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}
