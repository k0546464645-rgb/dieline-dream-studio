import { createClient } from "@supabase/supabase-js";

/** Returns null when the caller is a signed-in studio member, otherwise a 401/403 Response. */
export async function requireStudio(request: Request): Promise<Response | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return new Response("Please sign in", { status: 401 });
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return new Response("Please sign in", { status: 401 });
  const { data: ok } = await sb.rpc("has_role", { _user_id: data.user.id, _role: "studio" });
  if (!ok) return new Response("No studio access", { status: 403 });
  return null;
}
