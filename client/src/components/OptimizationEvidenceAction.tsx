import {
  optimizerInputSchema,
  optimizerLibrary,
} from "@shared/optimizerLibrary";
import { optimizeEvidence } from "@shared/optimizationRecommendations";
import type { Dimension, OptimizerKind } from "@shared/optimization";
import { OptimizationResult } from "./OptimizationResult";
export function OptimizationEvidenceAction({
  evidence,
  dimensions,
}: {
  evidence: unknown;
  dimensions: Dimension[];
}) {
  if (!dimensions.length)
    return (
      <p className="text-sm">Choose dimensions to identify a creative test.</p>
    );
  const kind = (Object.keys(optimizerLibrary) as OptimizerKind[]).sort(
    (a, b) =>
      optimizerLibrary[b].dimensions.filter(d => dimensions.includes(d))
        .length -
      optimizerLibrary[a].dimensions.filter(d => dimensions.includes(d)).length
  )[0];
  const parsed = optimizerInputSchema.safeParse({
    schemaVersion: 1,
    kind,
    channel: "meta_ads",
    brief: `Compare ${dimensions.join(", ")}. Preserve verified product facts and brand requirements.`,
    evidence,
  });
  if (!parsed.success) return null;
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-4 text-xl font-semibold">Your next creative test</h2>
      <OptimizationResult data={optimizeEvidence(parsed.data)} />
    </section>
  );
}
