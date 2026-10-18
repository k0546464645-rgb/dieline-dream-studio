export const PACKAGING_OPTIONS = [
  { id: "color", en: "Color box", he: "קרטון צבעוני", prompt: "packed in a closed printed color box" },
  { id: "window", en: "Box with window", he: "קרטון עם חלון", prompt: "packed in a printed color box with a transparent window showing the product inside" },
  { id: "display", en: "Display box", he: "קופסת תצוגה", prompt: "standing in a retail counter display box with a printed header card" },
  { id: "blister", en: "Blister pack", he: "אריזת בליסטר", prompt: "sealed in a clear plastic blister on a printed backing card" },
  { id: "master", en: "Shipping carton", he: "קרטון הובלה", prompt: "packed inside a printed shipping master carton" },
  { id: "shelf", en: "Store shelf", he: "תצוגת מדף", prompt: "standing on a store shelf in a realistic retail scene" },
] as const;

export type MockupCounts = Record<string, number>;
export type MockupSlot = { id: string; en: string; he: string; prompt: string };
export function mockupSlots(counts: MockupCounts): MockupSlot[] {
  return [
    { id: "front", en: "Front", he: "קדימה", prompt: "Apply the approved design directly to the original product. Straight-on FRONT view, showing the front label clearly. Do not add optional outer packaging." },
    { id: "back", en: "Back", he: "אחורה", prompt: "Apply the approved design directly to the original product. Straight-on BACK view, showing the full back information layout and barcode area. Do not add optional outer packaging." },
    ...PACKAGING_OPTIONS.flatMap((option) => Array.from({ length: Number.isSafeInteger(counts[option.id]) && (counts[option.id] ?? 0) > 0 ? (counts[option.id] ?? 0) : 0 }, (_, index) => ({
      id: `${option.id}-${index + 1}`, en: `${option.en} ${index + 1}`, he: `${option.he} ${index + 1}`,
      prompt: `Show this product ${option.prompt}. Show the entire packaging and product clearly in a three-quarter view. This is presentation variation ${index + 1}; keep the approved branding consistent.`,
    }))),
  ];
}

export function mockupKind(id: string) {
  return id === "front" ? "mockup" : id === "back" ? "mockup-back" : `mockup-${id}`;
}

export function savedMockupSlot(kind: string): string | undefined {
  if (kind === "mockup") return "front";
  if (kind === "mockup-back") return "back";
  const id = kind.replace(/^mockup-/, "");
  return PACKAGING_OPTIONS.some((option) => new RegExp(`^${option.id}-[1-9]\\d*$`).test(id)) ? id : undefined;
}