import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  Users,
  Activity,
  CreditCard,
  Layers,
  Settings2,
  BookOpen,
  Globe,
  Receipt,
} from "lucide-react";
import { EvokeLoopLogo } from "@shared/brand";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";

export const adminSections = [
  { slug: "", title: "Overview", icon: LayoutDashboard },
  { slug: "accounts", title: "Accounts", icon: Users },
  { slug: "usage", title: "Usage & costs", icon: Activity },
  { slug: "billing", title: "OpenAI billing", icon: CreditCard },
  { slug: "tiers", title: "Tiers", icon: Layers },
  { slug: "pricing", title: "Provider rates", icon: Settings2 },
  { slug: "finance", title: "Financial entries", icon: Receipt },
  { slug: "audit", title: "Audit", icon: BookOpen },
  { slug: "website", title: "Website & requests", icon: Globe },
];
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
      </header>
      <div className="mx-auto flex max-w-[1800px] flex-col lg:flex-row">
        {user?.role === "admin" && (
          <aside className="border-b bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
            <p className="hidden px-6 pb-3 pt-7 text-xs font-semibold uppercase tracking-widest text-slate-400 lg:block">
              Manage EvokeLoop
            </p>
            <nav
              aria-label="Platform administration"
              className="flex gap-1 overflow-x-auto p-3 lg:flex-col"
            >
              {adminSections.map(({ slug, title, icon: Icon }) => {
                const href = slug ? `/admin/${slug}` : "/admin";
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={path === href ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${path === href ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    <Icon size={17} />
                    {title}
                  </Link>
                );
              })}
            </nav>
            <div className="m-5 hidden rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 lg:block">
              Platform staff only
              <br />
              Customer billing is not yet connected to Stripe.
            </div>
          </aside>
        )}
        <main className="min-w-0 flex-1 p-4 md:p-8">
          {loading ? (
            <p role="status">Checking administrator access…</p>
          ) : !user ? (
            <section className="surface mx-auto mt-12 max-w-lg p-8">
              <h1 className="text-2xl font-semibold">
                EvokeLoop admin sign in
              </h1>
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
                Customer account ownership and workspace admin roles do not
                grant access to EvokeLoop administration.
              </p>
            </section>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
