import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ean13Check } from "@/lib/ean13";
import type { PackInfo } from "@/lib/studio-client";

export const LANGUAGES = ["Hebrew", "English", "Arabic", "Russian", "French", "Spanish", "German"];
const RTL = new Set(["Hebrew", "Arabic"]);

export const emptyInfo: PackInfo = {
  language: "Hebrew",
  barcode: "",
  itemNumber: "",
  productName: "",
  description: "",
  ingredients: "",
  warnings: "",
  extra: "",
  marketingHe: "",
  marketingEn: "",
  instructionsHe: "",
  instructionsEn: "",
  scent: "",
  expiry: "",
  lotNo: "",
  manufacturer: "",
  importer: "",
  madeIn: "",
  grade: "",
};

export function infoPrompt(i: PackInfo) {
  const parts = [
    `ALL packaging text must be written in ${i.language}${RTL.has(i.language) ? " (right-to-left script, rendered correctly)" : ""}. Reproduce the provided text exactly, do not invent wording.`,
    i.productName && `FRONT PANEL – product name (large, hero placement): ${i.productName}`,
    i.description && `FRONT PANEL – short tagline / product description (small, under the name): ${i.description}`,
    i.scent && `FRONT PANEL – scent / fragrance callout: ${i.scent}`,
    i.ingredients && `Back panel – ingredients list (small, legible, boxed): ${i.ingredients}`,
    i.warnings && `Back panel – safety & warnings (with a warning heading): ${i.warnings}`,
    i.marketingHe && `Back panel – marketing text (Hebrew): ${i.marketingHe}`,
    i.marketingEn && `Back panel – marketing text (English): ${i.marketingEn}`,
    i.instructionsHe && `Back panel – usage instructions (Hebrew): ${i.instructionsHe}`,
    i.instructionsEn && `Back panel – usage instructions (English): ${i.instructionsEn}`,
    i.expiry && `Back panel – expiry / PAO: ${i.expiry}`,
    i.lotNo && `Back panel – lot number: ${i.lotNo}`,
    i.manufacturer && `Back panel – manufacturer details: ${i.manufacturer}`,
    i.importer && `Back panel – importer details: ${i.importer}`,
    i.madeIn && `Back panel – made in: ${i.madeIn}`,
    i.grade && `Back panel – grade: ${i.grade}`,
    i.itemNumber && `Back panel – item number: ${i.itemNumber}`,
    i.extra && `Other info (side or back): ${i.extra}`,
    "The FRONT panel shows only: product name, short tagline, scent, and brand visuals — keep it clean and uncluttered.",
    "BACK PANEL ORDER (industry standard, each in its own clearly separated block — never merge two info types into one block): 1) marketing/description, 2) usage instructions, 3) warnings, 4) ingredients, 5) legal block (manufacturer, importer, made in, grade), 6) batch line (lot no., expiry) next to the barcode at the bottom. Bilingual texts appear Hebrew first, then English below it.",
    i.barcode && `Leave an empty white rectangle on the back panel bottom for the barcode ${i.barcode}; do not draw bars.`,
  ];
  return parts.filter(Boolean).join("\n");
}

function barcodeStatus(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 12) return `Check digit will be added: ${d}${ean13Check(d)}`;
  if (d.length === 13) return ean13Check(d.slice(0, 12)) === d[12] ? "✓ Valid EAN-13" : "✗ Check digit is wrong";
  return "EAN-13 needs 12 or 13 digits";
}

function Panel({
  title,
  subtitle,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="dash-cut rounded-md">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-start">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-accent">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function InfoForm({ value, onChange }: { value: PackInfo; onChange: (v: PackInfo) => void }) {
  const dir = RTL.has(value.language) ? "rtl" : "ltr";
  const set = (k: keyof PackInfo) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const status = barcodeStatus(value.barcode);
  const [baseOpen, setBaseOpen] = useState(true);
  const [frontOpen, setFrontOpen] = useState(true);
  const [backOpen, setBackOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Panel
        title="Product info · פרטי מוצר"
        subtitle="Packaging language, barcode, item number"
        open={baseOpen}
        onOpenChange={setBaseOpen}
      >
        <div className="space-y-1.5">
          <Label>Packaging language</Label>
          <select
            value={value.language}
            onChange={set("language")}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Barcode (EAN-13)</Label>
            <Input value={value.barcode} onChange={set("barcode")} inputMode="numeric" className="bg-background font-mono" />
            {status && <p className="font-mono text-[11px] text-muted-foreground">{status}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Item number</Label>
            <Input value={value.itemNumber} onChange={set("itemNumber")} className="bg-background font-mono" />
          </div>
        </div>
      </Panel>


      <Panel title="Front panel · צד קידמי" subtitle="Product name, tagline, scent — what the shopper sees first" open={frontOpen} onOpenChange={setFrontOpen}>
        <div className="space-y-1.5">
          <Label>Product name</Label>
          <Input dir={dir} value={value.productName} onChange={set("productName")} className="bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label>Short tagline / description</Label>
          <Textarea dir={dir} value={value.description} onChange={set("description")} className="min-h-16 bg-background" placeholder="One short line under the product name" />
        </div>
        <div className="space-y-1.5">
          <Label>Scent / בושם</Label>
          <Input dir={dir} value={value.scent} onChange={set("scent")} className="bg-background" />
        </div>
      </Panel>

      <Panel title="Back panel · צד אחורי" subtitle="Marketing, instructions, ingredients, warnings, legal details" open={backOpen} onOpenChange={setBackOpen}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Marketing text (עברית)</Label>
            <Textarea dir="rtl" value={value.marketingHe} onChange={set("marketingHe")} className="min-h-20 bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label>Marketing text (English)</Label>
            <Textarea dir="ltr" value={value.marketingEn} onChange={set("marketingEn")} className="min-h-20 bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label>Usage instructions (עברית)</Label>
            <Textarea dir="rtl" value={value.instructionsHe} onChange={set("instructionsHe")} className="min-h-20 bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label>Usage instructions (English)</Label>
            <Textarea dir="ltr" value={value.instructionsEn} onChange={set("instructionsEn")} className="min-h-20 bg-background" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Ingredients</Label>
          <Textarea dir={dir} value={value.ingredients} onChange={set("ingredients")} className="min-h-20 bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label>Safety & warnings</Label>
          <Textarea dir={dir} value={value.warnings} onChange={set("warnings")} className="min-h-20 bg-background" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Expiry / תוקף</Label>
            <Input dir={dir} value={value.expiry} onChange={set("expiry")} className="bg-background" placeholder="e.g. 24 months from opening" />
          </div>
          <div className="space-y-1.5">
            <Label>Lot No / מספר סדרה</Label>
            <Input value={value.lotNo} onChange={set("lotNo")} className="bg-background font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Made in / ארץ ייצור</Label>
            <Input dir={dir} value={value.madeIn} onChange={set("madeIn")} className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label>Grade / סוג</Label>
            <Input dir={dir} value={value.grade} onChange={set("grade")} className="bg-background" placeholder="e.g. סוג א׳ / Grade A" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Manufacturer details / יצרן</Label>
          <Textarea dir={dir} value={value.manufacturer} onChange={set("manufacturer")} className="min-h-16 bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label>Importer & distributor details / יבואן ומשווק</Label>
          <Textarea dir={dir} value={value.importer} onChange={set("importer")} className="min-h-16 bg-background" />
        </div>
        <div className="space-y-1.5">
          <Label>Other (storage, net weight, volume…)</Label>
          <Textarea dir={dir} value={value.extra} onChange={set("extra")} className="min-h-16 bg-background" />
        </div>
      </Panel>
    </div>
  );
}
