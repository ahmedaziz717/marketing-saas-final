import { useAuth } from "@/_core/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTheme } from "@/contexts/ThemeContext";
import { rememberWorkspace } from "@/lib/workspaceSelection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EvokeLoopLogo } from "@shared/brand";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  CircleHelp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { startLogin } from "@/const";
import { CSSProperties, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  WorkspaceNavigation,
  workspacePageLabel,
  workspaceSection,
} from "./WorkspaceNavigation";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { AppearanceMenu } from "./AppearanceMenu";
import { Button } from "./ui/button";

export const SIDEBAR_PREFERENCE_KEY = "evokeloop-sidebar-expanded";
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [location] = useLocation();
  const { loading, user } = useAuth();
  const { resolvedTheme } = useTheme();
  const changeOpen = (value: boolean) => {
    setOpen(value);
    try {
      localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(value));
    } catch {
      /* Storage is optional. */
    }
  };
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user)
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="surface max-w-md p-8 text-center">
          <EvokeLoopLogo
            reversed={resolvedTheme === "dark"}
            className="mx-auto"
          />
          <h1 className="mt-6 text-3xl font-semibold">Sign in to EvokeLoop</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Your ideas, content, and campaigns in one workspace.
          </p>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="mt-7 w-full"
          >
            Continue
          </Button>
        </div>
      </div>
    );
  return (
    <SidebarProvider
      open={open}
      onOpenChange={changeOpen}
      className="evoke-shell"
      data-workflow={workspaceSection(location)}
      style={
        {
          "--sidebar-width": "240px",
          "--sidebar-width-icon": "80px",
        } as CSSProperties
      }
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}
function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { workspaces = [], organizationId, organization } = useWorkspace();
  const { resolvedTheme } = useTheme();
  const [location] = useLocation();
  const search = useSearch();
  const { state, toggleSidebar, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const toggleLabel = collapsed
    ? "Expand sidebar"
    : isMobile
      ? "Close navigation"
      : "Collapse sidebar";
  return (
    <>
      <Sidebar
        collapsible="icon"
        className="workspace-sidebar border-r border-sidebar-border bg-sidebar"
      >
        <SidebarHeader className="workspace-sidebar-header">
          {!collapsed && (
            <Link
              href="/app"
              aria-label="EvokeLoop workspace"
              className="workspace-wordmark"
            >
              <EvokeLoopLogo reversed={resolvedTheme === "dark"} />
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleSidebar}
                className={`workspace-brand-button ${collapsed ? "compact" : ""}`}
                aria-label={toggleLabel}
              >
                {collapsed ? (
                  <>
                    <EvokeLoopLogo symbol className="workspace-brand-symbol" />
                    <PanelLeftOpen
                      className="workspace-expand-icon"
                      size={20}
                    />
                  </>
                ) : (
                  <PanelLeftClose size={18} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{toggleLabel}</TooltipContent>
          </Tooltip>
        </SidebarHeader>
        <SidebarContent className="workspace-sidebar-content">
          <WorkspaceNavigation />
        </SidebarContent>
        <SidebarFooter className="workspace-sidebar-footer">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="workspace-profile"
                aria-label="Your account"
                data-compact={collapsed}
              >
                <Avatar className="h-8 w-8 shrink-0 border">
                  <AvatarFallback className="text-xs font-semibold">
                    {user?.name?.charAt(0).toUpperCase() ??
                      user?.email?.charAt(0).toUpperCase() ??
                      "U"}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {user?.name || "Your account"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user?.email}
                      </span>
                    </span>
                    <ChevronDown size={14} />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={collapsed ? "right" : "top"}
              align="end"
              className="w-60 rounded-xl"
            >
              <DropdownMenuLabel className="truncate">
                {user?.email || "Your account"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/app/settings">Workspace settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/product">
                  Explore EvokeLoop <ArrowUpRight size={14} />
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut size={16} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="evoke-toolbar">
          <div className="workspace-toolbar-leading">
            {isMobile && (
              <SidebarTrigger
                aria-label="Open navigation"
                className="h-9 w-9 shrink-0 rounded-xl"
              />
            )}
            <div className="workspace-account-switcher">
              <Building2 size={16} aria-hidden="true" />
              {workspaces.length > 1 ? (
                <select
                  aria-label="Switch account"
                  value={organizationId ?? ""}
                  onChange={event => {
                    if (user) {
                      rememberWorkspace(user.id, Number(event.target.value));
                      window.location.assign("/app");
                    }
                  }}
                >
                  {workspaces.map(workspace => (
                    <option
                      key={workspace.organization.id}
                      value={workspace.organization.id}
                    >
                      {workspace.organization.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{organization?.name || "Workspace"}</span>
              )}
            </div>
            <span className="workspace-toolbar-divider" aria-hidden="true" />
            <div className="evoke-toolbar-path">
              <span className="workflow-current-dot" aria-hidden="true" />
              <span>{workspacePageLabel(location, search)}</span>
            </div>
          </div>
          <div className="evoke-toolbar-actions">
            <a
              href="/contact"
              aria-label="Help"
              title="Help"
              className="workspace-help"
            >
              <CircleHelp size={18} />
            </a>
            <AppearanceMenu />
          </div>
        </header>
        <div
          id="workspace-content"
          className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-7 lg:p-8"
        >
          {children}
        </div>
      </SidebarInset>
    </>
  );
}
