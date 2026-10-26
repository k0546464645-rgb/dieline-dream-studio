import { createFileRoute } from "@tanstack/react-router";
import { requireStudio } from "@/lib/require-studio.server";

const num = { type: "number", description: "Fraction 0..1 of the image size" };
const box = { x: num, y: num, w: num, h: num };
const PANEL = { type: "string", enum: ["front", "back", "left", "right", "top", "bottom", "other"] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["panels", "sources"],
  properties: {
    panels: {
      type: "array",
      description: "Every printable panel of the dieline (image 1)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "x", "y", "w", "h", "rotation"],
        properties: {
          name: PANEL,
          ...box,
          rotation: { type: "number", enum: [0, 90, 180, 270], description: "Clockwise rotation needed so artwork reads correctly when the box is folded" },
        },
      },
    },
    sources: {
      type: "array",
      description: "For each dieline panel that is visible in a design image, the flat face region of that design image",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["image", "panel", "x", "y", "w", "h"],
        properties: {
          image: { type: "integer", description: "1-based index among the DESIGN images (not counting the dieline)" },
          panel: PANEL,
          ...box,
        },
      },
    },
  },
};

export const Route = createFileRoute("/api/layout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireStudio(request);
        if (denied) return denied;
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { dieline, designs } = (await request.json()) as { dieline?: string; designs?: string[] };
        if (!dieline?.startsWith("data:image/") || !designs?.length) return new Response("Dieline and design required", { status: 400 });
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
            instructions: `You are a packaging prepress specialist. Image 1 is a flat packaging DIELINE. The following images are the existing, final packaging design (photos/renders or flat art).
1. Locate every printable panel of the dieline as a tight bounding box (fractions of image 1). Identify which panel is the FRONT (largest main face, usually), BACK, sides, top and bottom flaps. Give the clockwise rotation the artwork needs on that panel (flaps above the front are often 180).
2. For each design image, find the flat faces that are visible (front face, back face, sides) and give a tight bounding box of that face in that design image (fractions), excluding background, shadows and perspective edges as much as possible. A single flat front image = the whole printed face.
Only map faces you can actually see. Be precise.`,
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: "Image 1 = dieline. Then the design images in order." },
                  { type: "input_image", image_url: dieline },
                  ...designs.slice(0, 4).map((d) => ({ type: "input_image", image_url: d })),
                ],
              },
            ],
            text: { format: { type: "json_schema", name: "dieline_layout", strict: true, schema: SCHEMA } },
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
