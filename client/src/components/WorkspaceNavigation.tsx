import { useEffect, useId, useRef, useState } from "react";
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
};
export type WorkspaceNavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  children?: Child[];
};
export const workspaceNavigation: WorkspaceNavItem[] = [
  { icon: LayoutDashboard, label: "Home", path: "/app" },
  { icon: BookOpenText, label: "Briefs", path: "/app/briefs" },
  { icon: Images, label: "Content Studio", path: "/app/creatives" },
  { icon: FolderOpen, label: "Asset Library", path: "/app/library" },
  {
    icon: Users,
    label: "Social Media",
    path: "/app/social",
    children: [
      { label: "Facebook", path: "/app/social/facebook" },
      { label: "Instagram", path: "/app/social/instagram", planned: true },
      { label: "TikTok", path: "/app/social/tiktok", planned: true },
    ],
  },
  {
    icon: Megaphone,
    label: "Advertising",
    path: "/app/advertising",
    children: [
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
    icon: BarChart3,
    label: "Analytics",
    path: "/app/analytics",
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
  { icon: Send, label: "Publishing", path: "/app/publishing" },
  { icon: Boxes, label: "Brand", path: "/app/brand" },
  { icon: PackageSearch, label: "Catalog", path: "/app/catalog" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];
const storageKey = "frame-navigation-groups-v1";
const matchesPath = (path: string, location: string) =>
  path === location || (path !== "/app" && location.startsWith(path + "/"));
function childActive(child: Child, location: string, search: string) {
  return (
    !child.planned &&
    (child.analyticsView
      ? matchesPath("/app/analytics", location) &&
        analyticsViewForRoute(location, search) === child.analyticsView
      : matchesPath(child.path, location))
  );
}
export function workspacePageLabel(location: string, search = "") {
  const parent = workspaceNavigation.find(item =>
    matchesPath(item.path, location)
  );
  const child = parent?.children?.find(item =>
    childActive(item, location, search)
  );
  return child
    ? `${parent!.label} / ${child.label}`
    : (parent?.label ?? "Frame");
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
    item => item.children && matchesPath(item.path, location)
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
          const active = matchesPath(item.path, location);
          const expanded = !collapsed && !!groups[item.path];
          const id = `${prefix}-group-${index}`;
          return (
            <SidebarMenuItem key={item.path}>
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
                                        matchesPath("/app/analytics", location)
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
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
