import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Dieline Studio" },
      { name: "description", content: "Sign in to your packaging design studio." },
      { property: "og:title", content: "Sign in — Dieline Studio" },
      { property: "og:description", content: "Sign in to your packaging design studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function safePath(p?: string) {
  if (!p) return "/dashboard";
  try {
    const u = new URL(p, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function AuthPage() {
  const { t } = usePrefs();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: safePath(redirect) });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: safePath(redirect) });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — print-shop inspired */}
      <div className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-grid absolute inset-0 opacity-[0.35]" />
        <div className="pointer-events-none absolute -right-24 top-1/2 aspect-square w-[34rem] -translate-y-1/2 rotate-12 rounded-[3rem] border-2 border-dashed border-cut opacity-60" />
        <div className="pointer-events-none absolute -right-10 top-1/2 aspect-square w-[26rem] -translate-y-1/2 rotate-12 rounded-[2rem] border border-paper/20" />
        <div className="relative flex items-center gap-3">
          <span className="gradient-accent flex size-10 items-center justify-center rounded-xl font-mono text-sm font-bold text-accent-foreground">DS</span>
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-paper/70">Dieline Studio</span>
        </div>
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-cut">concept → artwork → dieline → approval</p>
          <h1 className="mt-4 text-6xl font-extrabold leading-[0.95] tracking-tight">
            Design.<br />Approve.<br /><span className="text-cut">Print.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-paper/60">{t("auth.brand")}</p>
        </div>
        <p className="relative font-mono text-[10px] uppercase tracking-widest text-paper/40">packaging workflow · v2 · est. 2026</p>
      </div>

      {/* Form panel */}
      <div className="bg-grid flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="gradient-accent flex size-9 items-center justify-center rounded-xl font-mono text-xs font-bold text-accent-foreground">DS</span>
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Dieline Studio</span>
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{mode === "in" ? t("auth.access") : t("auth.join")}</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{mode === "in" ? t("auth.welcome") : t("auth.create")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "in" ? t("auth.subin") : t("auth.subup")}</p>

          <Button variant="outline" className="mt-8 w-full" onClick={google}>
            {t("auth.google")}
          </Button>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("auth.or")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("auth.email")}</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-card" placeholder="you@studio.com" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.password")}</Label>
              <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-card" placeholder="••••••••" />
            </div>
            <Button type="submit" variant="cut" className="w-full" disabled={busy}>
              {mode === "in" ? t("auth.signin") : t("auth.signup")}
            </Button>
          </form>
          <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-5 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
            {mode === "in" ? t("auth.toUp") : t("auth.toIn")}
          </button>
        </div>
      </div>
    </div>
  );
}
