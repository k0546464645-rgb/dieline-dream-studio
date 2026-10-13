import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant"; text: string };

const SYSTEM = `You are a senior packaging designer and creative director.
First carefully review the uploaded product photo (shape, material, category, current branding).
When asked for concepts, propose distinct creative directions. Start EACH concept with a line exactly
in the form "## Concept N: <Name>" (N = 1, 2, 3...). For each give: the big idea (1-2 lines),
a style guide (color palette with hex codes, typography, graphic/illustration style, finishes),
the artistic direction, and how it wraps around the pack (front hero vs. back info panel).
When the user approves a concept, develop it into a detailed final design idea tailored to this exact
product, starting with the line "## FINAL CONCEPT: <Name>", and describe front, sides and back panel layout.
The back panel must hold most of the text: description, ingredients, warnings, barcode, item number.
Be concise, visual and specific.`;

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
