import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, LogOut } from "lucide-react";
import { EvokeLoopLogo } from "@shared/brand";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";

/** Platform staff only. Deliberately independent of customer workspace state. */
export default function PlatformAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const [path] = useLocation();
  return (
    <div
      className="min-h-screen bg-slate-50 text-foreground"
      data-platform-admin-shell
    >
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin" aria-label="EvokeLoop administration">
              <EvokeLoopLogo />
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
              <ShieldCheck size={15} /> Platform admin
            </span>
          </div>
          {user && (
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="max-w-[240px] truncate text-sm text-muted-foreground">
                {user.email}
              </span>
              <Button variant="outline" onClick={() => logout()}>
                <LogOut size={15} /> Sign out
              </Button>
            </div>
          )}
        </div>
        {user?.role === "admin" && (
          <nav
            aria-label="Platform administration"
            className="mx-auto flex max-w-[1600px] flex-wrap gap-2 px-5 pb-4 md:px-8"
          >
            {[
              ["/admin", "SaaS control panel"],
              ["/admin/website", "Website & requests"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${path === href ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-[1600px] p-4 md:p-8">
        {loading ? (
          <p role="status">Checking administrator access…</p>
        ) : !user ? (
          <section className="surface mx-auto mt-12 max-w-lg p-8">
            <h1 className="text-2xl font-semibold">EvokeLoop admin sign in</h1>
            <p className="my-4 text-muted-foreground">
              This area is for EvokeLoop platform administrators.
            </p>
            <Button onClick={startLogin}>Sign in to administration</Button>
          </section>
        ) : user.role !== "admin" ? (
          <section className="surface mx-auto mt-12 max-w-lg p-8">
            <h1 className="text-2xl font-semibold">
              Platform administrator access required
            </h1>
            <p className="mt-4 text-muted-foreground">
              Customer account ownership and workspace admin roles do not grant
              access to EvokeLoop administration.
            </p>
          </section>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
