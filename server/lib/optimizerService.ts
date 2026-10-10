import {
  optimizerInputSchema,
  optimizerLibrary,
  optimizerOutputSchema,
} from "../../shared/optimizerLibrary";
import { evidenceCaveats } from "../../shared/optimization";
/** Channel adapters are explicit; adding a provider never makes unsupported data look live. */
export const optimizerAdapters = {
  meta_ads: { supported: true },
  google_ads: { supported: false },
  microsoft_ads: { supported: false },
  facebook: { supported: false },
} as const;
export function optimizeEvidence(input: unknown) {
  const parsed = optimizerInputSchema.parse(input),
    definition = optimizerLibrary[parsed.kind],
    supported = optimizerAdapters[parsed.channel].supported;
  const summary = parsed.evidence.summary;
  const enough =
    supported &&
    !parsed.evidence.coverage.incomplete &&
    !parsed.evidence.coverage.truncated &&
    summary.evidenceStrength === "directional" &&
    Number(summary.confidence ?? 0) >= 0.5;
  const ids = Array.from(
    new Set(parsed.evidence.groups.flatMap(g => g.sourceAdIds))
  );
  const cohortObservations = parsed.evidence.groups
    .slice(0, 20)
    .map(
      g =>
        `${g.labels.join(" / ") || "All selected ads"}: spend ${g.spend ?? "unavailable"}, impressions ${g.impressions ?? "unavailable"}, purchases ${g.purchases ?? "unavailable"}, ROAS ${g.roas ?? "unavailable"}; ${g.sourceAdIds.length} source ads. Association only.`
    );
  const observations = [
    ...cohortObservations,
    `${summary.adCount} source ads and ${summary.samples} observations in the selected cohort.`,
    ...(!enough
      ? [
          "The available evidence is insufficient for a performance recommendation.",
        ]
      : [
          "Cohort differences are observational; use them to design tests, not to claim lift.",
        ]),
  ];
  return optimizerOutputSchema.parse({
    schemaVersion: 1,
    kind: parsed.kind,
    channel: parsed.channel,
    decision: !supported
      ? "unsupported_channel"
      : enough
        ? "propose_test"
        : "insufficient_evidence",
    confidence: enough ? 0.5 : 0,
    observations,
    sourceAdIds: ids,
    dimensions: definition.dimensions,
    suggestedTests: supported ? [definition.test] : [],
    generationBrief: `Prepare five ${definition.name.replace(" optimizer", "")} alternatives as TEST HYPOTHESES. ${definition.test}\nVerified user brief: ${parsed.brief}\nDo not invent offers, product facts, audience traits, performance claims or winning labels. Missing evidence is unknown. Preserve brand requirements.`,
    caveats: evidenceCaveats,
    requiresHumanApproval: true,
  });
}
