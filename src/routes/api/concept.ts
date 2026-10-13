import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant"; text: string };

const SYSTEM = `You are a senior packaging designer and creative director.
The user shows you a real product photo and a brief. Propose packaging design concepts.
For each concept give: a short name, the big idea (1-2 lines), color palette (with hex codes),
typography direction, graphic elements/illustration style, and how it wraps around the pack.
When asked to refine, update one concept and restate it in full as "FINAL CONCEPT".
Be concise, visual and specific. Use markdown headings and bullet points.`;

export const Route = createFileRoute("/api/concept")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { messages, productImage } = (await request.json()) as {
          messages: Msg[];
          productImage?: string;
        };
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("No messages", { status: 400 });
        }
        const input = messages.map((m, i) => {
          if (m.role === "assistant") {
            return { role: "assistant", content: [{ type: "output_text", text: m.text }] };
          }
          const content: Record<string, unknown>[] = [{ type: "input_text", text: m.text }];
          if (i === 0 && productImage) content.push({ type: "input_image", image_url: productImage });
          return { role: "user", content };
        });
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
            instructions: SYSTEM,
            input,
            stream: true,
            store: false,
            reasoning: { effort: "low" },
          }),
          signal: request.signal,
        });
        const headers = new Headers({
          "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
          "Cache-Control": "no-cache",
        });
        upstream.headers.forEach((v, k) => {
          if (k.toLowerCase().startsWith("x-lovable-aig-")) headers.set(k, v);
        });
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
