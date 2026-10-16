export type ParsedIdea = { title: string; summary: string; content: string };

/** Parses "## Concept N: <Name>" / "## FINAL CONCEPT: <Name>" blocks out of a chat reply. */
export function parseConcepts(text: string): ParsedIdea[] {
  const parts = text.split(/^##\s+(?:FINAL\s+)?Concept\s*\d*\s*:\s*/gim);
  const heads = [...text.matchAll(/^##\s+(?:FINAL\s+)?Concept\s*\d*\s*:\s*(.+)$/gim)].map((m) => m[1]!.trim());
  if (heads.length === 0) {
    const t = text.trim();
    return t ? [{ title: t.split("\n")[0]!.slice(0, 80), summary: t.slice(0, 200), content: t }] : [];
  }
  return heads.map((title, i) => {
    const content = (parts[i + 1] ?? "").trim();
    const strip = (l: string) => l.replace(/\*\*/g, "").replace(/^[-–—:\s]+|[-–—:\s]+$/g, "").trim();
    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
    // Skip an opening line that just restates the concept name (bolded or followed by a dash).
    const firstLine = lines.find((l) => strip(l) !== title && !strip(l).startsWith(title)) ?? lines[0] ?? "";
    return { title, summary: strip(firstLine).slice(0, 200), content: `${title}\n\n${content}` };
  });
}
