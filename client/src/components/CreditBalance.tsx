import { useState } from "react";
import { Coins } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function CreditBalance({ organizationId }: { organizationId: number }) {
  const [open, setOpen] = useState(false);
  const credit = trpc.models.credits.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
    }
  );
  const packages = trpc.models.packages.useQuery(
    { organizationId },
    { enabled: !!organizationId && open }
  );
  const state = credit.data;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-700 dark:text-violet-200"
        aria-label="View AI credit balance"
      >
        <Coins size={15} />
        {state ? Math.max(0, state.remaining).toLocaleString() : "—"}
        <span className="hidden sm:inline">credits</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>AI credits</DialogTitle>
          <DialogDescription>
            Your workspace balance for images, video, and AI actions.
          </DialogDescription>
          {state ? (
            <>
              <div className="rounded-2xl bg-violet-500/10 p-5">
                <p className="text-sm text-muted-foreground">
                  Available this month
                </p>
                <p className="my-2 text-4xl font-semibold">
                  {Math.max(0, state.remaining).toLocaleString()}{" "}
                  <span className="text-base font-normal">credits</span>
                </p>
                <p className="text-sm">
                  {state.packageName} · {state.allowance.toLocaleString()}{" "}
                  monthly credits
                </p>
                {state.remaining < 0 && (
                  <p className="mt-2 text-xs">
                    {Math.abs(state.remaining).toLocaleString()} credits beyond
                    the current allowance.
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Credits appear before generation and the accepted action price
                is fixed. There is no extra deduction after completion.
                Confirmed provider failures are refunded. Monthly credits reset
                at the start of each month (UTC).
              </p>
              {!state.enforced && (
                <p className="text-xs text-muted-foreground">
                  Credit tracking is enabled. Your administrator has not enabled
                  a spending limit for this workspace.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {packages.data?.map(p => (
                  <div key={p.id} className="rounded-xl border p-3">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.monthlyCredits.toLocaleString()} credits / month
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Contact your workspace administrator to change your package or
                add credits.
              </p>
            </>
          ) : (
            <p className="text-sm">
              {credit.error
                ? "Unable to load credits. Please try again."
                : "Loading balance…"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
