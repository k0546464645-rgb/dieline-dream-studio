import * as XLSX from "xlsx";
import type { PackInfo } from "@/lib/studio-client";

export type ImportedItem = { label: string; info: Partial<PackInfo> };

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Matches a header cell (English or Hebrew) to a PackInfo-ish key. */
function colKind(cell: string): string | null {
  const c = norm(cell);
  if (!c) return null;
  if (["item no", "מקט", "item number", "sku"].includes(c)) return "itemNumber";
  if (["barcode", "ברקוד"].includes(c)) return "barcode";
  if (["product name", "שם מוצר"].includes(c)) return "productName";
  if (["brand", "מותג"].includes(c)) return "brand";
  if (["marketing text", "טקסט שיווקי"].includes(c)) return "marketingHe";
  if (["user guide", "הוראות שימוש", "instructions"].includes(c)) return "instructionsHe";
  if (["ingredients", "רכיבים"].includes(c)) return "ingredients";
  if (["warning", "warnings", "אזהרות"].includes(c)) return "warnings";
  if (["פרטי יבואן ומשווק", "importer", "יבואן"].includes(c)) return "importer";
  if (["manufacturer", "יצרן"].includes(c)) return "manufacturer";
  if (["origin", "ארץ ייצור", "made in"].includes(c)) return "madeIn";
  if (["expiry time", "תוקף מפתיחה", "expiry", "תוקף"].includes(c)) return "expiry";
  if (["scent", "בושם", "fragrance"].includes(c)) return "scent";
  if (["grade", "סוג"].includes(c)) return "grade";
  if (["volume", "נפח מ\"ל", "נפח"].includes(c)) return "volume";
  if (["weight", "משקל"].includes(c)) return "weight";
  if (["qty", "כמות"].includes(c)) return "qty";
  return null;
}

function splitManufacturer(block: string): { manufacturer: string; importer: string } {
  const lines = block.split(/\n|<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
  const mfr = lines.filter((l) => /יצרן|manufacturer/i.test(l));
  const rest = lines.filter((l) => !/יצרן|manufacturer/i.test(l));
  return { manufacturer: mfr.join("\n"), importer: rest.join("\n") };
}

/** Parses an .xlsx/.csv items sheet (two-row EN/HE headers like the toiletries template). */
export async function parseItemsFile(file: File): Promise<ImportedItem[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (!rows.length) return [];

  // Header may span two rows (English row + Hebrew row); map each column by either.
  const h1 = rows[0].map(norm);
  const h2 = (rows[1] ?? []).map(norm);
  const kinds = h1.map((c, i) => colKind(c) ?? colKind(h2[i] ?? ""));
  if (!kinds.some(Boolean)) return [];

  const dataStart = kinds.some((k, i) => k && colKind(h2[i] ?? "") && !colKind(h1[i] ?? "")) ? 2 : 1;
  const items: ImportedItem[] = [];
  for (const row of rows.slice(dataStart)) {
    const get = (kind: string) => {
      const i = kinds.indexOf(kind);
      return i >= 0 ? String(row[i] ?? "").trim() : "";
    };
    const nameHe = get("productName");
    const brand = get("brand");
    if (!nameHe && !get("barcode") && !get("itemNumber")) continue;
    const { manufacturer, importer } = splitManufacturer(get("importer"));
    const extra = [
      get("volume") && `Volume: ${get("volume")} ml`,
      get("weight") && `Weight: ${get("weight")}`,
      get("qty") && `Qty: ${get("qty")}`,
    ]
      .filter(Boolean)
      .join(" · ");
    items.push({
      label: [brand, nameHe, get("itemNumber")].filter(Boolean).join(" · "),
      info: {
        barcode: get("barcode").replace(/\D/g, ""),
        itemNumber: get("itemNumber"),
        productName: nameHe,
        marketingHe: get("marketingHe"),
        instructionsHe: get("instructionsHe"),
        ingredients: get("ingredients"),
        warnings: get("warnings"),
        importer,
        manufacturer: manufacturer || get("manufacturer"),
        madeIn: get("madeIn"),
        expiry: get("expiry"),
        scent: get("scent"),
        grade: get("grade"),
        extra,
      },
    });
  }
  return items;
}
