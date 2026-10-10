import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { channelInput } from "./ChannelConnections";
export function OptimizationTemplates({
  organizationId,
}: {
  organizationId: number;
}) {
  const [connectionId, setConnection] = useState("");
  const enabled = trpc.optimization.availability.useQuery({ organizationId });
  const connections = trpc.channels.connections.useQuery(
    { organizationId },
    { enabled: !!enabled.data?.enabled }
  );
  const utils = trpc.useUtils();
  const install = trpc.optimization.installTemplates.useMutation({
    onSuccess: () => {
      utils.workflows.listApps.invalidate();
      utils.workflows.list.invalidate();
      toast.success("Workspace-owned optimizer Apps and workflows installed");
    },
    onError: e => toast.error(e.message),
  });
  if (!enabled.data?.enabled) return null;
  const selected = connections.data?.items.find(c => c.id === connectionId);
  return (
    <section className="rounded-xl border bg-card p-5 space-y-3">
      <h2 className="text-xl font-semibold">Optimization starter Apps</h2>
      <p className="text-sm text-muted-foreground">
        Headline Lab · Creative Intelligence · Ad Refresh · Scheduling
        Intelligence · Campaign Optimizer. Includes reusable typed optimizer
        workflows. Your copies can be edited without changing the originals.
      </p>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Template Meta account"
          className={channelInput}
          value={connectionId}
          onChange={e => setConnection(e.target.value)}
        >
          <option value="">Choose a connected Meta ad account</option>
          {connections.data?.items
            .filter(c => c.channel === "meta_ads" && c.status === "connected")
            .map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <Button
          disabled={!connectionId || install.isPending}
          onClick={() =>
            install.mutate({
              organizationId,
              connectionId,
              includeClx: !!selected && /clx/i.test(selected.name),
            })
          }
        >
          Install Apps and workflows
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Installation does not run workflows, generate assets, publish ads or
        change budgets.
        {selected && /clx/i.test(selected.name)
          ? " Includes the CLX Gaming Ad Refresh workflow with separate production and publication approvals."
          : ""}
      </p>
    </section>
  );
}
