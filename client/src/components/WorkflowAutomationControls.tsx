import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
export function WorkflowAutomationControls({
  organizationId,
  appVersionId,
  role,
}: {
  organizationId: number;
  appVersionId: string;
  role: string;
}) {
  const available = trpc.optimization.availability.useQuery({ organizationId });
  const current = trpc.workflowAutomation.get.useQuery(
    { organizationId, appVersionId },
    { enabled: !!available.data?.enabled }
  );
  const configure = trpc.workflowAutomation.configure.useMutation({
    onSuccess: () => {
      current.refetch();
      toast.success("Trigger updated");
    },
    onError: e => toast.error(e.message),
  });
  if (!available.data?.enabled || !["owner", "admin"].includes(role))
    return null;
  return (
    <section className="rounded-xl border p-4 space-y-2">
      <h3 className="font-semibold">Workflow trigger</h3>
      <p className="text-sm text-muted-foreground">
        {current.data?.enabled
          ? `Enabled · ${current.data.config.kind} · next check ${new Date(current.data.nextAtMs).toLocaleString()}`
          : "Automation is off. Publish a scheduled or event Start trigger before enabling."}
      </p>
      {current.data?.error && <p role="alert">{current.data.error}</p>}
      <Button
        variant="outline"
        disabled={configure.isPending}
        onClick={() =>
          configure.mutate({
            organizationId,
            appVersionId,
            enabled: !current.data?.enabled,
          })
        }
      >
        {current.data?.enabled ? "Disable trigger" : "Enable trigger"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Paid generation pauses for a credit approval. Publishing and spending
        changes require their own review.
      </p>
    </section>
  );
}
export function WorkflowSpendApproval({
  organizationId,
  runId,
  nodeId,
  onRefresh,
}: {
  organizationId: number;
  runId: string;
  nodeId: string;
  onRefresh: () => unknown;
}) {
  const [credits, setCredits] = useState<number | null>(null);
  const args = { organizationId, runId, nodeId };
  const quote = trpc.workflowAutomation.quoteStep.useMutation({
    onSuccess: r => setCredits(r.credits),
    onError: e => toast.error(e.message),
  });
  const approve = trpc.workflowAutomation.approveStep.useMutation({
    onSuccess: () => {
      setCredits(null);
      onRefresh();
      toast.success("Generation approved");
    },
    onError: e => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {credits === null ? (
        <Button
          variant="outline"
          disabled={quote.isPending}
          onClick={() => quote.mutate(args)}
        >
          Review generation credits
        </Button>
      ) : (
        <>
          <span>{credits} credits for this action</span>
          <Button
            disabled={approve.isPending}
            onClick={() => approve.mutate({ ...args, quotedCredits: credits })}
          >
            Approve generation
          </Button>
          <Button variant="ghost" onClick={() => setCredits(null)}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
