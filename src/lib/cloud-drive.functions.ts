import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DriveProvider = "google" | "onedrive";
export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isFolder: boolean;
  modifiedTime?: string;
};

const input = z.object({
  provider: z.enum(["google", "onedrive"]),
  folderId: z.string().optional(),
});

type AuthContext = { supabase: unknown; userId: string };

async function assertStudio(context: AuthContext) {
  const sb = context.supabase as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  const { data: ok } = await sb.rpc("has_role", { _user_id: context.userId, _role: "studio" });
  if (!ok) throw new Error("No studio access");
}

function gateway(provider: DriveProvider): { base: string; key: string } {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("Cloud connection is not configured");
  if (provider === "google") {
    const key = process.env["GOOGLE_DRIVE_API_KEY"];
    if (!key) throw new Error("Google Drive is not connected");
    return { base: "https://connector-gateway.lovable.dev/google_drive/drive/v3", key };
  }
  const key = process.env["MICROSOFT_ONEDRIVE_API_KEY"];
  if (!key) throw new Error("OneDrive is not connected");
  return { base: "https://connector-gateway.lovable.dev/microsoft_onedrive", key };
}

async function callGateway(base: string, key: string, path: string): Promise<Response> {
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": key,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Drive gateway request failed [${res.status}]: ${body}`);
    throw new Error(`Cloud drive request failed [${res.status}]`);
  }
  return res;
}

export const listDriveItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => input.parse(data))
  .handler(async ({ data, context }): Promise<{ items: DriveItem[] }> => {
    await assertStudio(context);
    const { base, key } = gateway(data.provider);
    if (data.provider === "google") {
      const folder = data.folderId ?? "root";
      const q = encodeURIComponent(`'${folder}' in parents and trashed = false`);
      const res = await callGateway(base, key, `/files?q=${q}&pageSize=200&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=folder,name`);
      const json = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }> };
      return {
        items: (json.files ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: Number(f.size ?? 0),
          isFolder: f.mimeType === "application/vnd.google-apps.folder",
          modifiedTime: f.modifiedTime,
        })),
      };
    }
    const path = data.folderId ? `/me/drive/items/${data.folderId}/children` : `/me/drive/root/children`;
    const res = await callGateway(base, key, path);
    const json = (await res.json()) as {
      value?: Array<{ id: string; name: string; size?: number; folder?: unknown; file?: { mimeType?: string }; lastModifiedDateTime?: string }>;
    };
    return {
      items: (json.value ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.file?.mimeType ?? "",
        size: f.size ?? 0,
        isFolder: !!f.folder,
        modifiedTime: f.lastModifiedDateTime,
      })),
    };
  });

export const downloadDriveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ provider: z.enum(["google", "onedrive"]), fileId: z.string(), name: z.string() }).parse(data))
  .handler(async ({ data, context }): Promise<{ name: string; mimeType: string; base64: string }> => {
    await assertStudio(context);
    const { base, key } = gateway(data.provider);
    const path =
      data.provider === "google"
        ? `/files/${encodeURIComponent(data.fileId)}?alt=media`
        : `/me/drive/items/${encodeURIComponent(data.fileId)}/content`;
    const res = await callGateway(base, key, path);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 45 * 1024 * 1024) throw new Error("File is over 45 MB");
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return { name: data.name, mimeType: res.headers.get("content-type") ?? "", base64: btoa(binary) };
  });
