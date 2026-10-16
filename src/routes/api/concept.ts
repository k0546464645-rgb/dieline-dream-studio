import { createFileRoute } from "@tanstack/react-router";
import { requireStudio } from "@/lib/require-studio.server";

type Msg = { role: "user" | "assistant"; text: string; images?: string[] };

const SYSTEM = `You are a senior packaging designer and creative director.
First carefully review the uploaded product photo (shape, material, category, current branding).
When asked for concepts, propose distinct creative directions. Start EACH concept with a line exactly
in the form "## Concept N: <Name>" (N = 1, 2, 3...). For each give: the big idea (1-2 lines),
a style guide (color palette with hex codes, typography, graphic/illustration style, finishes),
the artistic direction, and how it wraps around the pack (front hero vs. back info panel).
When the user approves a concept, develop it into a detailed final design idea tailored to this exact
product, starting with the line "## FINAL CONCEPT: <Name>", and describe front, sides and back panel layout.
The back panel must hold most of the text: description, ingredients, warnings, barcode, item number.
Any image attached to a message is a reference the designer dragged in (mood board, competitor pack, logo, sketch) —
follow what it shows. Be concise, visual and specific.`;

export const Route = createFileRoute("/api/concept")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireStudio(request);
        if (denied) return denied;
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { messages, productImage, styleGuide, learnings, autopilot } = (await request.json()) as {
          messages: Msg[];
          productImage?: string;
          styleGuide?: { text: string; images: string[] };
          learnings?: string;
          autopilot?: boolean;
        };
        let instructions = SYSTEM;
        if (styleGuide?.text) {
          instructions += `\n\nA BRAND / LICENSED STYLE GUIDE IS SELECTED for this project. Every concept must follow it strictly (characters, colors, fonts, imagery, usage rules).
If the guide offers several sub-styles, character sets, eras or ranges and the user has not chosen one, FIRST ask which one they want (list the options briefly), and still propose 2-3 directions based on the guide.
STYLE GUIDE:\n${styleGuide.text.slice(0, 6000)}`;
        }
        if (learnings) {
          instructions += `\n\nSTUDIO LEARNINGS from past customer feedback — apply them proactively:\n${learnings.slice(0, 3000)}`;
        }
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("No messages", { status: 400 });
        }
        if (autopilot) {
          instructions += `\n\nAUTOPILOT MODE: never ask clarifying questions and never describe uncertainty. Always output exactly 3 concepts, each starting with "## Concept N: <Name>". If the provided project list is vague or meaningless, ignore it and pick trending consumer packaged-goods categories instead.`;
        } else if (!productImage) {
          instructions += `\n\nNO product photo was provided in this session. Do not describe or assume a specific photo — design from the user's written description. If the product type or category is unclear, ask one short clarifying question before proposing concepts.`;
        }
        const input = messages.map((m, i) => {
          if (m.role === "assistant") {
            return { role: "assistant", content: [{ type: "output_text", text: m.text }] };
          }
          const content: Record<string, unknown>[] = [{ type: "input_text", text: m.text || "(image attached)" }];
          if (i === 0 && productImage) content.push({ type: "input_image", image_url: productImage });
          if (i === 0) styleGuide?.images?.slice(0, 4).forEach((img) => content.push({ type: "input_image", image_url: img }));
          (m.images ?? []).slice(0, 4).forEach((img) => content.push({ type: "input_image", image_url: img }));
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
            instructions,
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
