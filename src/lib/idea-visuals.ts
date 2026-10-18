export type IdeaVisual = { title: string; content: string; image?: string; final: boolean; error?: string };

/** Only explicit concept blocks trigger paid mockups; questions and plain replies never do. */
export function hasVisualConcepts(text: string) {
  return /^##\s+(?:FINAL\s+)?Concept\s*\d*\s*:\s*.+/im.test(text);
}

export function projectProductSource(mode: "generated" | "upload", generated?: string, uploaded?: File) {
  if (mode === "upload") {
    if (!uploaded) throw new Error("Choose a product photo");
    return uploaded;
  }
  if (!generated) throw new Error("Generate a mockup first");
  return generated;
}