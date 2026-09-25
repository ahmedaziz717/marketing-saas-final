import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { EvokeLoopLogo } from "@shared/brand";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LogOut, PanelLeft } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { WorkspaceNavigation, workspacePageLabel } from "./WorkspaceNavigation";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
const SIDEBAR_WIDTH_KEY = "frame-sidebar-width";
const DEFAULT_WIDTH = 276;
const MIN_WIDTH = 260;
const MAX_WIDTH = 360;
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const { loading, user } = useAuth();
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* Storage is optional for navigation. */
    }
  }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user)
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="surface max-w-md p-8 text-center">
          <EvokeLoopLogo className="mx-auto" />
          <h1 className="mt-6 font-editorial text-5xl">Sign in to EvokeLoop</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Keep creative work, approvals, and publishing actions inside one
            controlled workspace.
          </p>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="mt-7 w-full rounded-full"
          >
            Continue securely
          </Button>
        </div>
      </div>
    );
  return (
    <SidebarProvider
      className="evoke-shell"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}
function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const search = useSearch();
  const { state, toggleSidebar, isMobile: sidebarMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !sidebarMobile;
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const up = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      document.body.style.cursor = "col-resize";
    }
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
  }, [isResizing, setSidebarWidth]);
  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border/70 bg-sidebar"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-20 justify-center border-b border-sidebar-border/70">
            <div className="evoke-sidebar-brand">
              {!isCollapsed && (
                <a href="/app" aria-label="EvokeLoop workspace">
                  <EvokeLoopLogo />
                </a>
              )}
              <button
                onClick={toggleSidebar}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Toggle navigation"
              >
                {isCollapsed ? (
                  <EvokeLoopLogo symbol />
                ) : (
                  <PanelLeft className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </SidebarHeader>
          <SidebarContent className="gap-0 pt-4">
            <div className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground group-data-[collapsible=icon]:hidden">
              Workspace
            </div>
            <WorkspaceNavigation />
          </SidebarContent>
          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl p-1 text-left hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 shrink-0 border">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium leading-none">
                      {user?.name || "Member"}
                    </p>
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      {user?.email || ""}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/20 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => setIsResizing(true)}
        />
      </div>
      <SidebarInset className="min-w-0">
        <div className="evoke-toolbar">
          <div className="evoke-toolbar-path">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg" />}
            <span>{workspacePageLabel(location, search)}</span>
          </div>
          <div className="evoke-toolbar-actions">
            <a href="/product">
              Explore the platform <ArrowUpRight size={13} />
            </a>
            <a href="/contact">
              <CircleHelp size={15} /> Help
            </a>
            <span className="evoke-toolbar-label">Marketing workspace</span>
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-7 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
