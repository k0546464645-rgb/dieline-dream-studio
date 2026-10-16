import { createFileRoute } from "@tanstack/react-router";
import { requireStudio } from "@/lib/require-studio.server";

const MAX_BYTES = 24 * 1024 * 1024; // gateway caps the request at 25 MiB

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireStudio(request);
        if (denied) return denied;
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > MAX_BYTES) return new Response("Recording too large", { status: 413 });

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Expected multipart audio upload", { status: 400 });
        }
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) {
          return new Response("Invalid or empty audio file", { status: 400 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-transcribe");
        upstream.append("file", file, file.name);
        upstream.append("response_format", "json");
        upstream.append("stream", "true");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
          signal: request.signal,
        });
        return new Response(res.body, {
          status: res.status,
          headers: { "Content-Type": res.headers.get("Content-Type") ?? "text/event-stream" },
        });
      },
    },
  },
});
