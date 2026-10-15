import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FolderKanban, LogOut, SwatchBook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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

const NAV = [
  { to: "/dashboard", label: "Projects", icon: FolderKanban },
  { to: "/styles", label: "Style guides", icon: SwatchBook },
] as const;

function Layout() {
  const { user, isStudio } = Route.useRouteContext();
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
      <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r bg-card md:w-60">
        <Link to="/dashboard" className="flex items-center gap-3 px-4 py-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent font-mono text-sm font-bold text-accent-foreground">
            DS
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight md:block">Dieline Studio</span>
        </Link>
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground font-semibold" }}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden md:block">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t px-2 py-3">
          <p className="hidden truncate px-3 pb-2 font-mono text-[11px] text-muted-foreground md:block">{user.email}</p>
          <Button size="sm" variant="ghost" onClick={signOut} className="w-full justify-center md:justify-start">
            <LogOut className="size-4" />
            <span className="hidden md:block">Sign out</span>
          </Button>
        </div>
      </aside>
      <div className="ml-16 md:ml-60">
        {isStudio ? (
          <Outlet />
        ) : (
          <div className="mx-auto max-w-md px-6 py-20 text-center">
            <h1 className="text-2xl font-bold">No studio access</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This studio is limited to its two team members. Ask the owner to give your account access.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
