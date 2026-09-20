import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { BookOpenText, Boxes, FolderOpen, Images, LayoutDashboard, LogOut, PackageSearch, PanelLeft, Send, Settings } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
const menuItems = [
  { icon: LayoutDashboard, label: "Home", path: "/app" },
  { icon: BookOpenText, label: "Briefs", path: "/app/briefs" },
  { icon: Images, label: "Content Studio", path: "/app/creatives" },
  { icon: FolderOpen, label: "Asset Library", path: "/app/library" },
  { icon: Send, label: "Publishing", path: "/app/publishing" },
  { icon: Boxes, label: "Brand", path: "/app/brand" },
  { icon: PackageSearch, label: "Catalog", path: "/app/catalog" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];
const SIDEBAR_WIDTH_KEY = "frame-sidebar-width";
const DEFAULT_WIDTH = 248;
const MIN_WIDTH = 210;
const MAX_WIDTH = 360;
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)), [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <div className="grid min-h-screen place-items-center p-6"><div className="surface max-w-md p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary font-editorial text-2xl text-primary-foreground">F</div><h1 className="mt-6 font-editorial text-5xl">Sign in to Frame</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Keep creative work, approvals, and publishing actions inside one controlled workspace.</p><Button onClick={() => startLogin()} size="lg" className="mt-7 w-full rounded-full">Continue securely</Button></div></div>;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}
function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  useEffect(() => { if (isCollapsed) setIsResizing(false); }, [isCollapsed]);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const up = () => setIsResizing(false);
    if (isResizing) { document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; }
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
  }, [isResizing, setSidebarWidth]);
  return <>
    <div className="relative" ref={sidebarRef}><Sidebar collapsible="icon" className="border-r border-sidebar-border/70 bg-sidebar" disableTransition={isResizing}>
      <SidebarHeader className="h-20 justify-center border-b border-sidebar-border/70"><div className="flex w-full items-center gap-3 px-2"><button onClick={toggleSidebar} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4 text-muted-foreground" /></button>{!isCollapsed && <div className="flex min-w-0 items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-primary font-editorial text-lg text-primary-foreground">F</div><span className="truncate font-semibold tracking-tight">Frame</span></div>}</div></SidebarHeader>
      <SidebarContent className="gap-0 pt-4"><div className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground group-data-[collapsible=icon]:hidden">Workspace</div><SidebarMenu className="gap-1 px-2 py-1">{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path || (item.path === "/app/settings" && location.startsWith("/app/settings/"))} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-10 rounded-xl font-medium data-[active=true]:bg-primary/10 data-[active=true]:text-primary"><item.icon className="h-4 w-4" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent>
      <SidebarFooter className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-1 text-left hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"><Avatar className="h-9 w-9 shrink-0 border"><AvatarFallback className="text-xs font-medium">{user?.name?.charAt(0).toUpperCase() ?? "U"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium leading-none">{user?.name || "Member"}</p><p className="mt-1.5 truncate text-xs text-muted-foreground">{user?.email || ""}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter>
    </Sidebar><div className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/20 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} /></div>
    <SidebarInset>{isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/90 px-2 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg" /><span className="font-medium">{activeMenuItem?.label ?? "Frame"}</span></div>}<main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main></SidebarInset>
  </>;
}
