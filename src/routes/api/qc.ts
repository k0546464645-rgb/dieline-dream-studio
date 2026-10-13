import { createFileRoute } from "@tanstack/react-router";
import { requireStudio } from "@/lib/require-studio.server";

export const Route = createFileRoute("/api/qc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireStudio(request);
        if (denied) return denied;
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { artwork, info, concept } = (await request.json()) as {
          artwork?: string;
          info?: Record<string, string>;
          concept?: string;
        };
        if (!artwork?.startsWith("data:image/")) return new Response("Artwork required", { status: 400 });
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "fetch",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            instructions: `You are a strict packaging prepress and quality-control specialist. Check the flat artwork image against the required information and approved concept.
Report in short sections with ✓ / ✗ / ⚠:
1. Text accuracy — compare every required text exactly (spelling, language, right-to-left direction, missing or invented words).
2. Back panel — does it hold most of the information (description, ingredients, warnings, item no.) and a clear barcode area?
3. Layout — panels, orientation, bleed, readability of small text, contrast.
4. Concept match — colors, typography, imagery.
5. Verdict: READY TO SEND or NEEDS FIXES, then a numbered fix list.`,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `REQUIRED INFORMATION:\n${JSON.stringify(info ?? {}, null, 1)}\n\nAPPROVED CONCEPT:\n${(concept ?? "").slice(0, 3000)}`,
                  },
                  { type: "input_image", image_url: artwork },
                ],
              },
            ],
            stream: true,
            store: false,
            reasoning: { effort: "medium" },
          }),
          signal: request.signal,
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
