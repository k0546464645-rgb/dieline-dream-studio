import { createFileRoute } from "@tanstack/react-router";

const str = { type: "string" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["language", "barcode", "itemNumber", "productName", "description", "ingredients", "warnings", "extra", "styleNotes"],
  properties: {
    language: { type: "string", description: "Main language of the text: Hebrew, English, Arabic, Russian, French, Spanish or German" },
    barcode: { type: "string", description: "Digits under the barcode, or empty" },
    itemNumber: str,
    productName: str,
    description: str,
    ingredients: str,
    warnings: { type: "string", description: "Safety, warning, allergy and caution texts" },
    extra: { type: "string", description: "Other info: manufacturer, importer, storage, net weight, dates, nutrition" },
    styleNotes: { type: "string", description: "Visual style guide: logo description and placement, fonts/typefaces, colors with hex, imagery, layout per panel" },
  },
};

export const Route = createFileRoute("/api/extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { image } = (await request.json()) as { image?: string };
        if (!image?.startsWith("data:image/")) return new Response("Image required", { status: 400 });
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
            instructions:
              "You read packaging artwork / dieline files. Transcribe text EXACTLY as printed, in its original language and script (do not translate). Use empty strings for anything not present. Also describe the visual style so a designer can match it.",
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: "Extract the packaging information and style guide from this file." },
                  { type: "input_image", image_url: image },
                ],
              },
            ],
            text: { format: { type: "json_schema", name: "pack_info", strict: true, schema: SCHEMA } },
            stream: true,
            store: false,
            reasoning: { effort: "low" },
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
