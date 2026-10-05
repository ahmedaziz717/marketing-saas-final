import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  BarChart3,
  ChevronDown,
  FolderOpen,
  House,
  Palette,
  Send,
  Settings,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { settingsSectionForPath } from "@/lib/settingsNavigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  analyticsHref,
  analyticsViewForRoute,
  type AnalyticsView,
} from "@/lib/analyticsNavigation";

type Child = {
  label: string;
  path: string;
  planned?: boolean;
  analyticsView?: AnalyticsView;
  exact?: boolean;
};
export type WorkspaceNavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  children?: Child[];
  group?: "Create" | "Activate" | "Measure" | "Optimize" | "Brand" | "Settings";
  aliases?: string[];
  roadmap?: boolean;
};
export const workspaceNavigation: WorkspaceNavItem[] = [
  { icon: House, label: "Home", path: "/app" },
  {
    icon: Sparkles,
    label: "Create",
    path: "/app/creatives",
    group: "Create",
    aliases: ["/app/plans", "/app/briefs"],
    children: [
      { label: "Apps", path: "/app/creatives", exact: true },
      { label: "Drafts", path: "/app/creatives/drafts" },
      { label: "Campaign plans", path: "/app/plans" },
      {
        label: "Creative workflows",
        path: "/app/creatives/workflows",
        planned: true,
      },
    ],
  },
  {
    icon: Send,
    label: "Activate",
    path: "/app/advertising",
    group: "Activate",
    aliases: ["/app/social", "/app/publishing", "/app/activate", "/app/email"],
    children: [
      { label: "Advertising", path: "/app/advertising", exact: true },
      { label: "Meta Ads", path: "/app/advertising/meta" },
      { label: "Social publishing", path: "/app/social", exact: true },
      { label: "Facebook", path: "/app/social/facebook" },
      { label: "Calendar", path: "/app/publishing" },
      {
        label: "Automations",
        path: "/app/activate/automations",
        planned: true,
      },
    ],
  },
  {
    icon: BarChart3,
    label: "Measure",
    path: "/app/analytics",
    group: "Measure",
    aliases: ["/app/attribution", "/app/incrementality"],
    children: [
      { label: "Overview", path: "/app/analytics", analyticsView: "overview" },
      {
        label: "Advertising",
        path: "/app/analytics/advertising",
        analyticsView: "advertising",
      },
      {
        label: "Social",
        path: "/app/analytics/social",
        analyticsView: "social",
      },
    ],
  },
  {
    icon: WandSparkles,
    label: "Optimize",
    path: "/app/optimize",
    group: "Optimize",
    roadmap: true,
  },
  {
    icon: FolderOpen,
    label: "Library",
    path: "/app/library",
    children: [
      { label: "Approved assets", path: "/app/library", exact: true },
      { label: "Needs review", path: "/app/library?view=needs_review" },
      { label: "Review history", path: "/app/library?view=history" },
    ],
  },
  {
    icon: Palette,
    label: "Brand",
    path: "/app/brand",
    group: "Brand",
    aliases: ["/app/settings/company"],
  },
  {
    icon: Settings,
    label: "Settings",
    path: "/app/settings",
    group: "Settings",
    aliases: ["/app/roadmap", "/app/catalog", "/app/import"],
  },
];
const matchesPath = (path: string, location: string) =>
  path === location || (path !== "/app" && location.startsWith(path + "/"));
const matchesItem = (item: WorkspaceNavItem, location: string) =>
  matchesPath(item.path, location) ||
  !!item.aliases?.some(path => matchesPath(path, location));
function childActive(child: Child, location: string, search: string) {
  if (child.analyticsView)
    return (
      matchesPath("/app/analytics", location) &&
      analyticsViewForRoute(location, search) === child.analyticsView
    );
  const [path, query] = child.path.split("?");
  if (query)
    return (
      path === location &&
      Array.from(new URLSearchParams(query)).every(
        ([key, value]) => new URLSearchParams(search).get(key) === value
      )
    );
  if (path === "/app/library") {
    const view = new URLSearchParams(search).get("view");
    return location === path && (!view || view === "approved");
  }
  return child.exact ? path === location : matchesPath(path, location);
}
export function workspaceSection(location: string) {
  return (
    workspaceNavigation.find(item => matchesItem(item, location))?.group ??
    "Home"
  );
}
export function workspacePageLabel(location: string, search = "") {
  if (location === "/app/brand" || location === "/app/settings/company")
    return "Brand";
  if (location === "/app/settings" || location.startsWith("/app/settings/"))
    return `Settings / ${settingsSectionForPath(location).label}`;
  if (["/app/catalog", "/app/import"].includes(location))
    return "Settings / Catalog & offerings";
  if (location === "/app/roadmap") return "Settings / Product roadmap";
  const editor = (
    {
      images: "Image creator",
      video:
        new URLSearchParams(search).get("type") === "ugc"
          ? "Creator video"
          : "Product video",
      ads: "Ad builder",
      social: "Social composer",
    } as Record<string, string>
  )[location.replace("/app/creatives/", "")];
  if (editor) return `Create / ${editor}`;
  const parent = workspaceNavigation.find(item => matchesItem(item, location));
  const child = parent?.children?.find(item =>
    childActive(item, location, search)
  );
  if (location === "/app/briefs") return "Create / Campaign plans";
  return child
    ? `${parent!.label} / ${child.label}`
    : (parent?.label ?? "EvokeLoop");
}
export function WorkspaceNavigation({
  items = workspaceNavigation,
}: {
  items?: WorkspaceNavItem[];
}) {
  const [location] = useLocation();
  const search = useSearch();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const prefix = useId();
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  // Opening a page never changes the rail or reopens a submenu.
  useEffect(() => {
    setOpenGroup(null);
  }, [location, search, collapsed, isMobile]);
  const navigate = () => {
    setOpenGroup(null);
    if (isMobile) setOpenMobile(false);
  };
  const activeItem = items.find(item => matchesItem(item, location));
  const children = (item: WorkspaceNavItem) => (
    <ul className="workspace-subnav">
      {item.children!.map(child => (
        <li key={child.path}>
          <Link
            href={
              child.analyticsView
                ? analyticsHref(
                    child.analyticsView,
                    matchesPath("/app/analytics", location) ? search : ""
                  )
                : child.path
            }
            aria-current={
              childActive(child, location, search) ? "page" : undefined
            }
            onClick={navigate}
            className="workspace-subnav-link"
          >
            <span>{child.label}</span>
            {child.planned && (
              <span className="workspace-planned">Planned</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <nav
      aria-label="Workspace navigation"
      className="workspace-navigation"
      data-compact={collapsed}
    >
      <ul className="workspace-nav-list">
        {items.map((item, index) => {
          const active = activeItem === item;
          const expanded = openGroup === item.path;
          const id = `${prefix}-group-${index}`;
          const contents = (
            <>
              <item.icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
              {item.children && !collapsed && (
                <ChevronDown
                  size={14}
                  className={
                    expanded
                      ? "workspace-nav-chevron open"
                      : "workspace-nav-chevron"
                  }
                  aria-hidden="true"
                />
              )}
            </>
          );
          const trigger = (
            <button
              type="button"
              ref={node => {
                triggers.current[item.path] = node;
              }}
              className="workspace-nav-link"
              data-active={active}
              aria-label={item.label}
              aria-expanded={expanded}
              aria-controls={expanded ? id : undefined}
              onClick={
                collapsed
                  ? undefined
                  : () => setOpenGroup(expanded ? null : item.path)
              }
            >
              {contents}
            </button>
          );
          return (
            <li
              key={item.path}
              data-workflow={item.group ?? "Home"}
              className={`${item.label === "Library" ? "workspace-nav-divider" : ""} ${item.label === "Settings" ? "workspace-nav-utility" : ""}`}
            >
              {!item.children ? (
                <Link
                  href={item.path}
                  className="workspace-nav-link"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  onClick={navigate}
                  title={item.roadmap ? "Optimize · Planned" : undefined}
                >
                  {contents}
                </Link>
              ) : collapsed ? (
                <Popover
                  open={expanded}
                  onOpenChange={open =>
                    setOpenGroup(current =>
                      open ? item.path : current === item.path ? null : current
                    )
                  }
                >
                  <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                  <PopoverContent
                    id={id}
                    side="right"
                    align="start"
                    sideOffset={12}
                    collisionPadding={12}
                    className="workspace-nav-flyout"
                    data-workflow={item.group ?? "Home"}
                    aria-label={`${item.label} navigation`}
                  >
                    <p className="workspace-flyout-heading">
                      <item.icon size={17} aria-hidden="true" />
                      {item.label}
                    </p>
                    {children(item)}
                  </PopoverContent>
                </Popover>
              ) : (
                <>
                  {trigger}
                  <div
                    id={id}
                    hidden={!expanded}
                    onKeyDown={event => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenGroup(null);
                        triggers.current[item.path]?.focus();
                      }
                    }}
                  >
                    {children(item)}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
