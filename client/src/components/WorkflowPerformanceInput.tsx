import { trpc } from "@/lib/trpc";
import { DateRangeFilter } from "./DateRangeFilter";
import { parsePerformanceInput } from "@shared/workflowInputs";
import { presetRange } from "@shared/reportDates";

export function WorkflowPerformanceInput({
  value,
  onChange,
  organizationId,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  organizationId: number;
  disabled?: boolean;
}) {
  const connections = trpc.channels.connections.useQuery({ organizationId });
  const selected = parsePerformanceInput(value);
  const accounts =
    connections.data?.items.filter(
      c => c.channel === "meta_ads" && c.status === "connected"
    ) ?? [];
  const account = accounts.find(c => c.id === selected?.connectionId);
  const timezone = account?.details.timezone ?? "UTC";
  const range = selected?.range ?? presetRange("30", Date.now(), timezone);
  return (
    <fieldset disabled={disabled} className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">
        Required analysis inputs
      </legend>
      <label className="block text-sm">
        Meta ad account *
        <select
          aria-label="Meta ad account"
          className="mt-1 w-full"
          value={selected?.connectionId ?? ""}
          onChange={e => {
            const next = accounts.find(c => c.id === e.target.value);
            onChange(
              next
                ? JSON.stringify({
                    connectionId: next.id,
                    range:
                      selected?.range ??
                      presetRange(
                        "30",
                        Date.now(),
                        next.details.timezone ?? "UTC"
                      ),
                  })
                : ""
            );
          }}
        >
          <option value="">
            {connections.isLoading
              ? "Loading connected accounts…"
              : "Choose a connected account"}
          </option>
          {selected && !account && (
            <option value={selected.connectionId}>
              Selected account unavailable — choose another
            </option>
          )}
          {accounts.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {connections.error && <p role="alert">{connections.error.message}</p>}
      {!connections.isLoading && !connections.error && !accounts.length && (
        <p>
          No connected Meta ad accounts. Connect one in Settings → Integrations.
        </p>
      )}
      <fieldset disabled={!account}>
        <DateRangeFilter
          value={range}
          timezone={timezone}
          onChange={next => {
            if (next && selected)
              onChange(JSON.stringify({ ...selected, range: next }));
          }}
        />
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Fetches fresh performance directly from Meta when you run. No ad changes
        or spending. If daily or hourly data is missing, the result will explain
        the gap instead of recommending a schedule.
      </p>
    </fieldset>
  );
}
