import { describe, expect, it } from "vitest";
import { hasVisualConcepts, projectProductSource } from "@/lib/idea-visuals";

describe("idea product workflow", () => {
  it("generates visuals for explicit concepts without requiring a photo", () => {
    expect(hasVisualConcepts("## Concept 1: Botanical\nPalette: green")).toBe(true);
    expect(hasVisualConcepts("Which product category do you want?")).toBe(false);
  });
  it("uses a generated product when selected", () => {
    expect(projectProductSource("generated", "data:image/png;base64,product")).toBe("data:image/png;base64,product");
  });
  it("uses the uploaded real product instead of the generated product", () => {
    const photo = new File(["photo"], "bottle.png", { type: "image/png" });
    expect(projectProductSource("upload", "generated", photo)).toBe(photo);
    expect(() => projectProductSource("upload", "generated")).toThrow("Choose a product photo");
  });
});