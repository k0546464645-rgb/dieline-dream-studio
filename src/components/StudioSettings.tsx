import { useState } from "react";
import { Settings2 } from "lucide-react";
import { ACCENTS, FONTS, usePrefs } from "@/lib/prefs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function StudioSettings() {
  const p = usePrefs();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1 px-2 pb-2">
        <div className="flex flex-1 overflow-hidden rounded-md border border-paper/15 font-mono text-[11px]">
          {(["he", "en"] as const).map((l) => (
            <Button variant="ghost" size="sm"
              key={l}
              onClick={() => p.set({ lang: l })}
              className={`flex-1 px-2 py-1.5 transition-colors ${p.lang === l ? "bg-cut text-accent-foreground" : "text-paper/50 hover:text-paper"}`}
            >
              {l === "he" ? "עברית" : "EN"}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="icon"
          title={p.t("nav.settings")}
          aria-label={p.t("nav.settings")}
          onClick={() => setOpen(true)}
          className="grid size-8 shrink-0 place-items-center rounded-md border border-paper/15 text-paper/60 transition-colors hover:text-paper"
        >
          <Settings2 className="size-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>{p.t("set.title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>{p.t("set.language")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["he", "en"] as const).map((l) => (
                  <Button variant="outline"
                    key={l}
                    onClick={() => p.set({ lang: l })}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${p.lang === l ? "border-accent ring-1 ring-accent" : "hover:border-foreground"}`}
                  >
                    {l === "he" ? "עברית" : "English"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{p.t("set.theme")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["neon", "paper"] as const).map((t) => (
                  <Button variant="outline"
                    key={t}
                    onClick={() => p.set({ theme: t })}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${p.theme === t ? "border-accent ring-1 ring-accent" : "hover:border-foreground"}`}
                  >
                    {t === "paper" ? (p.lang === "he" ? "ניאון ולבן" : "Neon & white") : p.t("set.theme.neon")}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{p.t("set.accent")}</Label>
              <div className="flex gap-2">
                {ACCENTS.map((a) => (
                  <Button variant="ghost" size="icon"
                    key={a.id}
                    title={p.lang === "he" ? ({ violet: "סגול", blue: "כחול", orange: "כתום", green: "ירוק", pink: "ורוד" })[a.id] : a.id}
                    aria-label={p.lang === "he" ? ({ violet: "סגול", blue: "כחול", orange: "כתום", green: "ירוק", pink: "ורוד" })[a.id] : a.id}
                    onClick={() => p.set({ accent: a.id })}
                    className={`size-8 rounded-full border-2 transition-transform ${p.accent === a.id ? "scale-110 border-foreground" : "border-transparent"}`}
                    style={{ background: a.cut }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{p.t("set.font")}</Label>
              <div className="grid gap-2">
                {FONTS.map((f) => (
                  <Button variant="outline"
                    key={f.id}
                    onClick={() => p.set({ font: f.id })}
                    className={`rounded-md border px-3 py-2 text-start transition-colors ${p.font === f.id ? "border-accent ring-1 ring-accent" : "hover:border-foreground"}`}
                    style={{ fontFamily: f.stack }}
                  >
                    {f.label} — Abc אבג 123
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{p.t("set.note")}</p>
            <Button variant="cut" onClick={() => setOpen(false)}>✓</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
