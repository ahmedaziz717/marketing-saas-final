import { trpc } from "@/lib/trpc";
import { textActionForOperation } from "@shared/textActionEstimate";
/** Shared label for token-metered AI actions. Image/video generation uses its full model quote. */
export function ActionCredits({
  organizationId,
  requests = 1,
  operation,
}: {
  organizationId?: number | null;
  requests?: number;
  operation?: string;
}) {
  const balance = trpc.models.credits.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId, staleTime: 15000 }
  );
  return (
    <span
      className="whitespace-nowrap text-[11px] font-normal opacity-75"
      title="Estimated credits for this AI request. Final credits use the provider's reported token usage."
    >
      {balance.data
        ? `≈ ${((balance.data.textEstimates?.[textActionForOperation(operation)] ?? balance.data.textEstimate) * requests).toLocaleString()} credits`
        : balance.error
          ? "Estimate unavailable"
          : "Estimating credits…"}
    </span>
  );
}
