import { createFileRoute } from "@tanstack/react-router";
import { requireStudio } from "@/lib/require-studio.server";
import { editImage, imageSettings } from "@/lib/image-gateway.server";

export const Route = createFileRoute("/api/edit-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireStudio(request);
        if (denied) return denied;
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const form = await request.formData();
        if (form.get("purpose") === "remove-background") {
          form.delete("purpose");
          if (!(form.get("image") instanceof File)) return Response.json({ message: "Choose a product image" }, { status: 400 });
          form.set("prompt", "Remove only the background from the uploaded image. Retain the complete original product, its silhouette, edges, proportions, label, exact text, colors and all visible product details. Do not redesign, repaint, relight, add objects or crop the product. Remove the surrounding backdrop and background shadows. Return the isolated product on a genuinely transparent background.");
          form.set("background", "transparent");
          form.set("output_format", "png");
          form.set("quality", "high");
          form.set("size", "auto");
        }
        const upstream = await editImage({ ...imageSettings, apiKey }, form);
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
