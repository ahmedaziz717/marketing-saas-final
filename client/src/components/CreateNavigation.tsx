import { BookOpenText, FolderOpen, LayoutGrid, Workflow } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { studioDraftsHref } from "@shared/contentWorkflow";

export function CreateNavigation({ planId }: { planId?: number }) {
  const [path] = useLocation();
  const search = useSearch();
  const drafts =
    path.endsWith("/drafts") || new URLSearchParams(search).has("edit");
  const plans = path === "/app/plans" || path === "/app/briefs";
  const workflows = path === "/app/creatives/workflows";
  return (
    <nav aria-label="Create navigation" className="create-tabs">
      {[
        {
          label: "Apps",
          href: `/app/creatives${planId ? "?plan=" + planId : ""}`,
          icon: LayoutGrid,
          active: !drafts && !plans && !workflows,
        },
        {
          label: "Drafts",
          href: studioDraftsHref({ plan: planId }),
          icon: FolderOpen,
          active: drafts,
        },
        {
          label: "Campaign plans",
          href: "/app/plans",
          icon: BookOpenText,
          active: plans,
        },
        {
          label: "Workflows",
          href: "/app/creatives/workflows",
          icon: Workflow,
          active: workflows,
          planned: true,
        },
      ].map(({ label, href, icon: Icon, active, planned }) => (
        <Link
          key={label}
          href={href}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
          {planned && <span className="workspace-planned">Planned</span>}
        </Link>
      ))}
    </nav>
  );
}
