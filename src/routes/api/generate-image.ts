import { createFileRoute } from "@tanstack/react-router";
import { requireStudio } from "@/lib/require-studio.server";
import { generateImage, imageSettings } from "@/lib/image-gateway.server";

export const Route = createFileRoute("/api/generate-image")({
  server: { handlers: { POST: async ({ request }) => {
    const denied = await requireStudio(request);
    if (denied) return denied;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return Response.json({ message: "AI image service is not configured" }, { status: 500 });
    const { concept, brief, stream = true } = await request.json() as { concept?: string; brief?: string; stream?: boolean };
    if (!concept?.trim()) return Response.json({ message: "A design concept is required" }, { status: 400 });
    const prompt = `Create a photorealistic 3D packaging design mockup for this concept. No real product photograph exists: construct believable product forms appropriate to the brief. Show the actual designed products, their materials, readable front labels and packaging clearly, fully in frame, on a seamless neutral studio background with soft lighting. If a series or collection is requested, show all requested products together with a consistent design language and distinct variants. Follow the concept's palette, typography, logo direction, illustrations and finishes. This is a product mockup, not a mood board or a written style-guide poster.\nBRIEF:\n${(brief ?? "").slice(0, 4000)}\nCONCEPT AND STYLE GUIDE:\n${concept.slice(0, 8000)}`;
    const upstream = await generateImage({ ...imageSettings, apiKey }, prompt, stream !== false);
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-cache" } });
  } } },
});