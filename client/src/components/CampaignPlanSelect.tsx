import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Link } from "wouter";
import { channelInput } from "./ChannelConnections";

export function CampaignPlanSelect({
  value,
  onChange,
}: {
  value?: number;
  onChange: (
    id: number | undefined,
    plan?: {
      name: string;
      audience: string;
      offer: string;
      creativeDirection: string;
      destinationUrl: string | null;
    }
  ) => void;
}) {
  const { organizationId } = useWorkspace();
  const query = trpc.briefs.list.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  return (
    <label className="block text-sm">
      Campaign plan <span className="text-muted-foreground">(optional)</span>
      <select
        className={channelInput + " mt-1"}
        value={value ?? ""}
        onChange={e => {
          const id = e.target.value ? Number(e.target.value) : undefined;
          onChange(
            id,
            query.data?.find(p => p.id === id)
          );
        }}
      >
        <option value="">Standalone content</option>
        {value && !query.data?.some(p => p.id === value) && (
          <option value={value}>Linked plan #{value}</option>
        )}
        {query.data?.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        Keep related content together.{" "}
        <Link
          href="/app/plans"
          target="_blank"
          className="text-primary underline"
        >
          Manage plans
        </Link>
      </span>
      {query.error && (
        <span role="alert" className="block text-xs">
          Plans could not be loaded. Your current selection is retained.
        </span>
      )}
    </label>
  );
}
