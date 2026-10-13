import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
      <header className="border-b">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="text-2xl font-extrabold tracking-tight">
              Dieline Studio
            </Link>
            <nav className="flex gap-5 text-sm">
              <Link to="/dashboard" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }}>
                Projects
              </Link>
              <Link to="/styles" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }}>
                Style guides
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden font-mono text-xs text-muted-foreground md:inline">{user.email}</span>
            <Button size="sm" variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
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
  );
}
