import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  BarChart3,
  BookOpenText,
  Boxes,
  ChevronDown,
  FolderOpen,
  Images,
  LayoutDashboard,
  Megaphone,
  PackageSearch,
  Send,
  Settings,
  Mail,
  Target,
  FlaskConical,
  Lightbulb,
  Coins,
  Bot,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
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
  group?: "Create" | "Activate" | "Measure" | "Optimize" | "Settings";
  aliases?: string[];
  roadmap?: boolean;
};
export const workspaceNavigation: WorkspaceNavItem[] = [
  { icon: LayoutDashboard, label: "Home", path: "/app" },
  {
    icon: Images,
    label: "Content Studio",
    path: "/app/creatives",
    group: "Create",
    children: [
      { label: "Overview", path: "/app/creatives/overview", exact: true },
      { label: "Image assets", path: "/app/creatives/images" },
      { label: "Ad creative", path: "/app/creatives/ads" },
      { label: "Social content", path: "/app/creatives/social" },
      { label: "Saved work", path: "/app/creatives/saved" },
      { label: "UGC uploads", path: "/app/creatives/ugc" },
      { label: "Video creation", path: "/app/creatives/video", planned: true },
      { label: "Email builder", path: "/app/creatives/email", planned: true },
      { label: "Landing pages", path: "/app/creatives/pages", planned: true },
      { label: "Blog & insights", path: "/app/creatives/blog", planned: true },
    ],
  },
  {
    icon: FolderOpen,
    label: "Asset Library",
    path: "/app/library",
    group: "Create",
  },
  {
    icon: PackageSearch,
    label: "Catalog",
    path: "/app/catalog",
    group: "Create",
    aliases: ["/app/import"],
  },
  { icon: BookOpenText, label: "Briefs", path: "/app/briefs", group: "Create" },
  {
    icon: Megaphone,
    label: "Advertising",
    path: "/app/advertising",
    group: "Activate",
    children: [
      { label: "Overview", path: "/app/advertising", exact: true },
      { label: "Meta Ads", path: "/app/advertising/meta" },
      { label: "Google Ads", path: "/app/advertising/google", planned: true },
      {
        label: "Microsoft Ads",
        path: "/app/advertising/microsoft",
        planned: true,
      },
    ],
  },
  {
    icon: Users,
    label: "Social Media",
    path: "/app/social",
    group: "Activate",
    children: [
      { label: "Overview", path: "/app/social", exact: true },
      { label: "Facebook", path: "/app/social/facebook" },
      { label: "Instagram", path: "/app/social/instagram", planned: true },
      { label: "TikTok", path: "/app/social/tiktok", planned: true },
    ],
  },
  {
    icon: Mail,
    label: "Email",
    path: "/app/email",
    group: "Activate",
    roadmap: true,
  },
  {
    icon: Send,
    label: "Publishing",
    path: "/app/publishing",
    group: "Activate",
  },
  {
    icon: BarChart3,
    label: "Analytics",
    path: "/app/analytics",
    group: "Measure",
    children: [
      { label: "Overview", path: "/app/analytics", analyticsView: "overview" },
      {
        label: "Advertising",
        path: "/app/analytics/advertising",
        analyticsView: "advertising",
      },
      {
        label: "Social Media",
        path: "/app/analytics/social",
        analyticsView: "social",
      },
    ],
  },
  {
    icon: Target,
    label: "Attribution",
    path: "/app/attribution",
    group: "Measure",
    roadmap: true,
  },
  {
    icon: FlaskConical,
    label: "Incrementality",
    path: "/app/incrementality",
    group: "Measure",
    roadmap: true,
  },
  {
    icon: Lightbulb,
    label: "Recommendations",
    path: "/app/optimize/recommendations",
    group: "Optimize",
    roadmap: true,
  },
  {
    icon: Coins,
    label: "Budget Optimizer",
    path: "/app/optimize/budgets",
    group: "Optimize",
    roadmap: true,
  },
  {
    icon: FlaskConical,
    label: "Experiments",
    path: "/app/optimize/experiments",
    group: "Optimize",
    roadmap: true,
  },
  {
    icon: Bot,
    label: "AI Agent",
    path: "/app/optimize/agent",
    group: "Optimize",
    roadmap: true,
  },
  {
    icon: Settings,
    label: "Settings",
    path: "/app/settings",
    group: "Settings",
    aliases: ["/app/brand"],
    children: [
      { label: "Workspace", path: "/app/settings/company" },
      { label: "Brand kit", path: "/app/brand" },
      { label: "Team & access", path: "/app/settings/team" },
      { label: "Billing & Usage", path: "/app/settings/billing" },
      { label: "Integrations", path: "/app/settings/integrations" },
      { label: "Activity & audit", path: "/app/settings/activity" },
    ],
  },
];
const storageKey = "frame-navigation-groups-v1";
const matchesPath = (path: string, location: string) =>
  path === location || (path !== "/app" && location.startsWith(path + "/"));
function childActive(child: Child, location: string, search: string) {
  if (location === "/app/creatives") {
    const params = new URLSearchParams(search);
    const saved =
      params.get("tab") === "saved" ||
      params.has("asset") ||
      params.has("revise");
    return (
      child.path === (saved ? "/app/creatives/saved" : "/app/creatives/images")
    );
  }
  if (child.exact) return !child.planned && child.path === location;
  return (
    !child.planned &&
    (child.analyticsView
      ? matchesPath("/app/analytics", location) &&
        analyticsViewForRoute(location, search) === child.analyticsView
      : matchesPath(child.path, location))
  );
}
const matchesItem = (item: WorkspaceNavItem, location: string) =>
  matchesPath(item.path, location) ||
  !!item.aliases?.some(path => matchesPath(path, location));
export function workspacePageLabel(location: string, search = "") {
  const parent = workspaceNavigation.find(item => matchesItem(item, location));
  const child = parent?.children?.find(item =>
    childActive(item, location, search)
  );
  return child
    ? `${parent!.label} / ${child.label}`
    : (parent?.label ?? "EvokeLoop");
}
function readGroups(): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const groups: Record<string, boolean> = {};
    for (const [key, open] of Object.entries(value))
      if (
        typeof open === "boolean" &&
        workspaceNavigation.some(item => item.path === key && item.children)
      )
        groups[key] = open;
    return groups;
  } catch {
    return {};
  }
}
export function WorkspaceNavigation({
  items = workspaceNavigation,
}: {
  items?: WorkspaceNavItem[];
}) {
  const [location] = useLocation();
  const search = useSearch();
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const activeGroup = items.find(
    item => item.children && matchesItem(item, location)
  )?.path;
  const [groups, setGroups] = useState<Record<string, boolean>>(() => ({
    ...readGroups(),
    ...(activeGroup ? { [activeGroup]: true } : {}),
  }));
  const prefix = useId();
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (activeGroup)
      setGroups(current => ({ ...current, [activeGroup]: true }));
  }, [activeGroup, location, search]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(groups));
    } catch {
      /* Navigation still works when storage is blocked. */
    }
  }, [groups]);
  const navigate = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <nav aria-label="Workspace navigation">
      <SidebarMenu className="gap-1 px-2 py-1">
        {items.map((item, index) => {
          const active = matchesItem(item, location);
          const expanded = !collapsed && !!groups[item.path];
          const id = `${prefix}-group-${index}`;
          return (
            <Fragment key={item.path}>
              {item.group && items[index - 1]?.group !== item.group && (
                <li
                  role="presentation"
                  className="px-3 pb-2 pt-5 group-data-[collapsible=icon]:hidden"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
                    {item.group}
                  </span>
                </li>
              )}
              <SidebarMenuItem>
                {item.children ? (
                  <>
                    <SidebarMenuButton
                      type="button"
                      ref={node => {
                        triggers.current[item.path] = node;
                      }}
                      tooltip={item.label}
                      aria-label={item.label}
                      aria-expanded={expanded}
                      aria-controls={id}
                      isActive={active}
                      className="h-10 rounded-xl font-medium data-[active=true]:bg-primary/5 data-[active=true]:text-primary"
                      onClick={() => {
                        if (collapsed) setOpen(true);
                        setGroups(current => ({
                          ...current,
                          [item.path]: collapsed || !current[item.path],
                        }));
                      }}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="min-w-0 flex-1 text-left">
                        {item.label}
                      </span>
                      {!collapsed && (
                        <ChevronDown
                          aria-hidden="true"
                          className={`ml-auto h-4 w-4 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
                        />
                      )}
                    </SidebarMenuButton>
                    <div
                      id={id}
                      hidden={!expanded}
                      onKeyDown={event => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          setGroups(current => ({
                            ...current,
                            [item.path]: false,
                          }));
                          triggers.current[item.path]?.focus();
                        }
                      }}
                    >
                      <SidebarMenuSub className="mr-1 mt-1">
                        {item.children.map(child => (
                          <SidebarMenuSubItem key={child.path}>
                            {child.planned ? (
                              <div
                                aria-disabled="true"
                                title={`${child.label} - planned, not available yet`}
                                className="flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted-foreground"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {child.label}
                                </span>
                                <span className="shrink-0 text-[10px]">
                                  Planned
                                </span>
                              </div>
                            ) : (
                              <SidebarMenuSubButton
                                asChild
                                isActive={childActive(child, location, search)}
                                className="min-h-9 h-auto rounded-lg py-2 data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
                              >
                                <Link
                                  href={
                                    child.analyticsView
                                      ? analyticsHref(
                                          child.analyticsView,
                                          matchesPath(
                                            "/app/analytics",
                                            location
                                          )
                                            ? search
                                            : ""
                                        )
                                      : child.path
                                  }
                                  aria-current={
                                    childActive(child, location, search)
                                      ? "page"
                                      : undefined
                                  }
                                  onClick={navigate}
                                >
                                  <span>{child.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            )}
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </div>
                  </>
                ) : (
                  <SidebarMenuButton
                    asChild
                    tooltip={item.label}
                    isActive={active}
                    className="h-10 rounded-xl font-medium data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                  >
                    <Link
                      href={item.path}
                      aria-current={active ? "page" : undefined}
                      onClick={navigate}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="min-w-0 flex-1">{item.label}</span>
                      {item.roadmap && !collapsed && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          Planned
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            </Fragment>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
