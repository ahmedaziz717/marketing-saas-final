import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import type { DateRange } from "@shared/channels";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(value);
export function OpenAIBilling({ range }: { range: DateRange }) {
  const utils = trpc.useUtils();
  const [project, setProject] = useState("");
  const costs = trpc.platformAdmin.openaiCosts.useQuery(
    { range },
    { retry: false, staleTime: 600000, refetchInterval: 600000 }
  );
  const sync = trpc.platformAdmin.syncOpenaiCosts.useMutation({
    onSuccess: (data, input) =>
      utils.platformAdmin.openaiCosts.setData(input, data),
  });
  const data = costs.data;
  const projects = Array.from(
    new Set(
      data?.rows.map(r => r.projectId).filter((id): id is string => !!id) ?? []
    )
  );
  const selected = projects.includes(project) ? project : "";
  const rows = (data?.rows ?? []).filter(
    r => !selected || r.projectId === selected
  );
  const groups = new Map<
    string,
    { projectId: string | null; lineItem: string | null; amountUsd: number }
  >();
  for (const row of rows) {
    const id = JSON.stringify([row.projectId, row.lineItem]);
    const group = groups.get(id) ?? { ...row, amountUsd: 0 };
    group.amountUsd += row.amountUsd;
    groups.set(id, group);
  }
  return (
    <section
      className="surface mb-6 min-w-0 p-5"
      aria-label="OpenAI actual costs"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Actual OpenAI costs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {range.since} – {range.until} · UTC billing days
          </p>
        </div>
        <Button
          variant="outline"
          disabled={costs.isFetching || sync.isPending}
          onClick={() => sync.mutate({ range })}
        >
          {sync.isPending || costs.isFetching
            ? "Syncing…"
            : "Sync OpenAI costs"}
        </Button>
      </div>
      <p className="my-3 text-sm text-muted-foreground">
        Read directly from your OpenAI organization. These totals include all
        usage in the selected OpenAI project, including activity outside
        EvokeLoop. The customer-account filter does not apply here.
      </p>
      {(costs.error || sync.error) && (
        <p role="alert" className="my-3 text-destructive">
          {sync.error?.message ?? costs.error?.message}
        </p>
      )}
      {costs.isLoading && <p role="status">Retrieving billing costs…</p>}
      {data && (
        <>
          <label className="block max-w-xl text-sm">
            OpenAI project
            <select
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
              value={selected}
              onChange={e => setProject(e.target.value)}
            >
              <option value="">All projects in the OpenAI organization</option>
              {projects.map(id => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <p className="my-3 text-3xl font-semibold">
            {money(rows.reduce((s, r) => s + r.amountUsd, 0))}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Last successful sync: {new Date(data.syncedAtMs).toLocaleString()}.
            Recent charges may appear later as OpenAI updates billing. Actual
            costs are shown separately from request estimates to avoid double
            counting.
          </p>
          {!rows.length ? (
            <p>No cost entries have been reported for these dates.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">OpenAI project</th>
                    <th className="p-2">Billing category</th>
                    <th className="p-2">Actual cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(groups.entries())
                    .sort((a, b) => b[1].amountUsd - a[1].amountUsd)
                    .map(([id, row]) => (
                      <tr key={id} className="border-t">
                        <td className="p-2 break-all">
                          {row.projectId ?? "Organization / unassigned"}
                        </td>
                        <td className="p-2">{row.lineItem ?? "Unspecified"}</td>
                        <td className="p-2 whitespace-nowrap">
                          {money(row.amountUsd)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {!data && !costs.isLoading && (
        <p className="text-sm">
          Cost unavailable until a successful billing sync.
        </p>
      )}
    </section>
  );
}
