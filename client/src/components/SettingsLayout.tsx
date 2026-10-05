import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import {
  settingsSectionForPath,
  settingsSections,
} from "@/lib/settingsNavigation";

export function SettingsLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const active = settingsSectionForPath(location).id;
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage your team, connections, billing, and workspace preferences."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[208px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto rounded-2xl border bg-card p-2 xl:sticky xl:top-6 xl:flex-col"
        >
          {settingsSections.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`~/app/settings/${id}`}
              aria-current={active === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${active === id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Icon size={17} className="shrink-0" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <Link
            href="~/app/roadmap"
            className="shrink-0 px-3 py-3 text-sm text-muted-foreground hover:text-foreground xl:mt-2 xl:border-t"
          >
            Product roadmap ↗
          </Link>
        </nav>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </>
  );
}
