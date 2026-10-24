import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export type PromptBrand = {
  name: string;
  voice: string | null;
  status: "ready" | "pending" | "unavailable" | "empty";
  summarized: boolean;
  requiredClaims?: string | null;
  prohibitedContent?: string | null;
};
const summaryLabels: Record<string, string> = {
  identity: "Identity",
  audience: "Audience",
  tone: "Tone",
  messagingPriorities: "Messaging priorities",
  doRules: "Do",
  dontRules: "Avoid",
  constraints: "Constraints",
};
export function GenerationBrandContext({
  organizationId,
}: {
  organizationId: number;
}) {
  const query = trpc.brand.promptContext.useQuery(
    { organizationId },
    { enabled: !!organizationId, staleTime: 0, refetchOnMount: "always" }
  );
  return (
    <BrandPromptContext
      brand={query.data}
      loading={query.isLoading}
      error={!!query.error}
    />
  );
}
/** Exact generation voice (or an honest pending state), never a second editable copy. */
export function BrandPromptContext({
  brand,
  loading,
  error,
}: {
  brand?: PromptBrand | null;
  loading?: boolean;
  error?: boolean;
}) {
  let fields: Record<string, string> | null = null;
  if (brand?.summarized && brand.voice) {
    try {
      fields = JSON.parse(brand.voice);
    } catch {
      /* malformed server data remains unavailable */
    }
  }
  return (
    <aside
      aria-label="Brand context for generation"
      className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm"
    >
      <h3 className="font-semibold">
        {brand ? `Brand Kit: ${brand.name}` : "Brand Kit"}
      </h3>
      {loading ? (
        <p>Loading your brand voice…</p>
      ) : error || brand?.status === "unavailable" ? (
        <p role="alert">
          The generation summary could not be loaded. Your saved Brand Kit is
          unchanged.
        </p>
      ) : brand?.status === "pending" ? (
        <p>
          Your saved guide is ready. Its generation summary will be prepared
          when you next generate an image. No summary is available to preview
          yet.
        </p>
      ) : brand?.status === "ready" && brand.voice ? (
        <>
          <p className="text-xs text-muted-foreground">
            {brand.summarized
              ? "Saved summary used for image generation"
              : "Brand voice used for image generation"}
          </p>
          {fields ? (
            <dl className="max-h-64 overflow-y-auto space-y-2 break-words">
              {Object.entries(fields).map(([key, value]) => (
                <div key={key}>
                  <dt className="font-medium">{summaryLabels[key] ?? key}</dt>
                  <dd className="whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
          ) : !brand.summarized ? (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
              {brand.voice}
            </p>
          ) : (
            <p role="alert">The generation summary is unavailable.</p>
          )}
        </>
      ) : (
        <p>
          No saved brand voice yet. Add it in your Brand Kit to guide your
          creatives.
        </p>
      )}
      {brand?.requiredClaims && (
        <p className="whitespace-pre-wrap break-words">
          <strong>Required guidance: </strong>
          {brand.requiredClaims}
        </p>
      )}
      {brand?.prohibitedContent && (
        <p className="whitespace-pre-wrap break-words">
          <strong>Avoid: </strong>
          {brand.prohibitedContent}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Applied with your creative direction and selected subject. Brand changes
        do not replace your written instructions; restoring a default does not
        reset your brand.
      </p>
      <Link href="~/app/brand" className="inline-block underline">
        Review Brand Kit
      </Link>
    </aside>
  );
}
