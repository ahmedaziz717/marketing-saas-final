import {
  optimizerInputSchema,
  optimizerLibrary,
  optimizerOutputSchema,
} from "./optimizerLibrary";
import { evidenceCaveats } from "./optimization";
/** Channel adapters are explicit; adding a provider never makes unsupported data look live. */
export const optimizerAdapters = {
  meta_ads: { supported: true },
  google_ads: { supported: true },
  microsoft_ads: { supported: false },
  facebook: { supported: false },
} as const;
export function optimizeEvidence(input: unknown) {
  const parsed = optimizerInputSchema.parse(input),
    definition = optimizerLibrary[parsed.kind],
    supported = optimizerAdapters[parsed.channel].supported;
  const summary = parsed.evidence.summary;
  const usableGroups = parsed.evidence.groups
    .filter(
      g =>
        g.labels.length &&
        g.labels.every(l => !["unknown", "not_applicable"].includes(l)) &&
        g.evidenceStrength === "directional" &&
        Number(g.confidence ?? 0) >= 0.5 &&
        Number(g.purchases ?? 0) >= 10 &&
        g.comparable !== false &&
        Number((g.learning as any)?.averageWeight ?? 0) >= 0.15 &&
        typeof (g.learning as any)?.weightedRoas === "number"
    )
    .sort(
      (a, b) =>
        Number((b.learning as any).weightedRoas) -
        Number((a.learning as any).weightedRoas)
    );
  const comparableGroups =
    usableGroups.length >= 2 &&
    new Set(usableGroups.map(g => `${g.currency}|${g.attribution}`)).size === 1;
  const enough =
    comparableGroups &&
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
  const candidate = enough ? usableGroups[0] : null;
  const control = enough ? usableGroups[1] : null;
  const nextAction = {
    keep: control ? control.labels : [],
    test: candidate ? candidate.labels : [],
    reason:
      candidate && control
        ? `Keep ${control.labels.join(" / ")} as the observed reference and test ${candidate.labels.join(" / ")} under matching delivery conditions. The candidate ranks higher on weighted historical ROAS; this is a test hypothesis, not a causal winner.`
        : "Collect or review comparable dimension evidence before choosing a treatment. At least two known cohorts, three ads, 1,000 impressions, 50 clicks and 10 purchases per cohort are required, with sufficient learning weight.",
  };
  const observations = [
    nextAction.reason,
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
    suggestedTests: enough ? [nextAction.reason, definition.test] : [],
    nextAction,
    generationBrief: `Prepare five ${definition.name.replace(" optimizer", "")} alternatives as TEST HYPOTHESES. ${definition.test}\nEvidence-based hypothesis: ${nextAction.reason}\nVerified user brief: ${parsed.brief}\nDo not invent offers, product facts, audience traits, performance claims or winning labels. Missing evidence is unknown. Preserve brand requirements.`,
    caveats: evidenceCaveats,
    requiresHumanApproval: true,
  });
}
