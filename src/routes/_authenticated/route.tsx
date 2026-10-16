import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Lightbulb, LogOut, SwatchBook, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StudioSettings } from "@/components/StudioSettings";
import { usePrefs, type DictKey } from "@/lib/prefs";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    return { user: data.user, isStudio: !!roles?.some((r) => r.role === "studio") };
  },
  component: Layout,
});

const NAV: { to: string; key: DictKey; icon: typeof FolderKanban }[] = [
  { to: "/dashboard", key: "nav.projects", icon: FolderKanban },
  { to: "/ideas", key: "nav.ideas", icon: Lightbulb },
  { to: "/styles", key: "nav.styles", icon: SwatchBook },
  { to: "/customers", key: "nav.customers", icon: Users },
];

function Layout() {
  const { user, isStudio } = Route.useRouteContext();
  const { t } = usePrefs();
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r border-white/10 bg-shell text-paper md:w-60">
        <Link to="/dashboard" className="flex items-center gap-3 px-4 py-5">
          <span className="gradient-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold text-accent-foreground">
            DS
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight md:block">Dieline Studio</span>
        </Link>
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2">
          {NAV.map(({ to, key, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-paper/60 transition-all hover:bg-paper/10 hover:text-paper"
              activeProps={{ className: "bg-paper/10 text-paper font-semibold shadow-[inset_2px_0_0_var(--cut)]" }}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden md:block">{t(key)}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-paper/10 px-2 py-3">
          <StudioSettings />
          <p className="hidden truncate px-3 pb-2 font-mono text-[11px] text-paper/40 md:block">{user.email}</p>
          <Button size="sm" variant="ghost" onClick={signOut} className="w-full justify-center text-paper/60 hover:bg-paper/10 hover:text-paper md:justify-start">
            <LogOut className="size-4" />
            <span className="hidden md:block">{t("nav.signout")}</span>
          </Button>
        </div>
      </aside>
      <div className="ml-16 md:ml-60">
        {isStudio ? (
          <Outlet />
        ) : (
          <div className="mx-auto max-w-md px-6 py-20 text-center">
            <h1 className="text-2xl font-bold">{t("noaccess.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("noaccess.body")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
