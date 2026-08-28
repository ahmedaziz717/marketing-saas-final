import DashboardLayout from "./DashboardLayout";
import { useWorkspace } from "@/hooks/useWorkspace";
import OnboardingPage from "@/pages/OnboardingPage";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { isLoading, error, refetch, current } = useWorkspace();
  if (isLoading) return <DashboardLayout><div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-[520px] w-full rounded-3xl" /></div></DashboardLayout>;
  if (error) return <DashboardLayout><div className="surface mx-auto mt-16 max-w-xl p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-100 text-rose-700"><AlertTriangle className="h-5 w-5" /></div><h1 className="mt-5 font-editorial text-4xl">Workspace access could not be verified.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Your session may have expired, or your role may no longer permit access. No workspace data was changed.</p><Button className="mt-6 rounded-full" onClick={() => refetch()}>Retry access check</Button></div></DashboardLayout>;
  if (!current) return <DashboardLayout><OnboardingPage /></DashboardLayout>;
  return <DashboardLayout>{children}</DashboardLayout>;
}
