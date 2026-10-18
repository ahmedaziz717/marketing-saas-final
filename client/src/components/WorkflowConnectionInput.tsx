import { VisualSelect } from "@/components/choices/VisualSelect";
import { trpc } from "@/lib/trpc";

export function WorkflowConnectionInput({
  organizationId,
  value,
  onChange,
  channel = "facebook",
  disabled,
  title,
  summary = false,
}: {
  organizationId: number;
  value: string;
  onChange: (value: string) => void;
  channel?: "facebook" | "meta_ads";
  disabled?: boolean;
  title: string;
  summary?: boolean;
}) {
  const query = trpc.channels.connections.useQuery({ organizationId });
  const items =
    query.data?.items.filter(
      c => c.channel === channel && c.status === "connected"
    ) ?? [];
  if (summary)
    return (
      <span>
        {query.isLoading
          ? "Loading destination…"
          : (items.find(c => c.id === value)?.name ??
            "Selected destination unavailable")}
      </span>
    );
  return (
    <div className="space-y-2">
      <VisualSelect
        visual={channel === "facebook" ? "facebook" : "meta"}
        aria-label={title}
        value={value}
        disabled={disabled || query.isLoading}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">
          {query.isLoading
            ? "Loading destinations…"
            : `Choose a ${channel === "facebook" ? "Facebook Page" : "Meta ad account"}`}
        </option>
        {value && !items.some(c => c.id === value) && (
          <option value={value}>
            Selected destination unavailable — choose another
          </option>
        )}
        {items.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </VisualSelect>
      {query.error && <p role="alert">{query.error.message}</p>}
      {!query.isLoading && !query.error && !items.length && (
        <p>
          No connected destinations. Connect one in Settings → Integrations.
        </p>
      )}
    </div>
  );
}
