import { Skeleton } from "./ui/skeleton";
export function DashboardLayoutSkeleton() {
  return (
    <div
      className="flex min-h-screen bg-background"
      aria-label="Loading workspace"
      role="status"
    >
      <div className="hidden w-20 shrink-0 flex-col items-center gap-5 border-r bg-card py-4 md:flex">
        <Skeleton className="mb-4 h-8 w-8 rounded-xl" />
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-10 rounded-xl" />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex h-16 items-center gap-5 border-b bg-card px-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-6 p-6 md:p-8">
          <Skeleton className="h-10 w-60 max-w-full" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map(index => (
              <Skeleton key={index} className="h-48 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
