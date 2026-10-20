import { expect, it } from "vitest";
import {
  creativeIntelligence,
  learningWeight,
} from "../shared/creativeIntelligence";
import { dimensionNames, historyRangeSchema, effectiveClassifications } from "../shared/optimization";
import {
  aggregateEvidence,
  type EvidenceRow,
} from "./lib/optimizationAnalysis";
import { optimizeEvidence } from "./lib/optimizerService";
it("covers every dimension without promoting requested style or font to observed evidence", () => {
  const s = creativeIntelligence({
    key: "creative:1",
    fingerprint: "version1",
    createdAtMs: 1,
    mediaType: "image",
    width: 1080,
    height: 1350,
    requested: {
      theme: "spotlight",
      fontFamily: "Inter",
      artStyle: "cinematic",
    },
  });
  expect(Object.keys(s.observed)).toEqual([...dimensionNames]);
  expect(s.requested.font_family.values).toEqual(["Inter"]);
  expect(s.observed.font_family.status).toBe("unknown");
  expect(s.observed.art_style.status).toBe("unknown");
  expect(s.observed.video_duration.status).toBe("not_applicable");
  expect(s.observed.aspect_ratio.values).toEqual(["4:5"]);
});
it("includes legacy history and applies explainable weights without altering business totals", () => {
  expect(
    historyRangeSchema.parse({ since: "2023-01-01", until: "2023-12-31" }).since
  ).toBe("2023-01-01");
  const input = {
    date: "2023-01-01",
    referenceDate: "2024-01-01",
    confidence: 0.8,
    completeness: 1,
    versionReliability: 0.5,
    dimensions: {},
  };
  const weight = learningWeight(input, { halfLifeDays: 365, context: [] });
  expect(weight.weight).toBeCloseTo(0.2);
  const metrics = {
    spend: 100,
    impressions: 1000,
    clicks: 20,
    linkClicks: 20,
    purchases: 10,
    purchaseValue: 500,
    roas: 5,
  };
  const row: EvidenceRow = {
    adId: "1",
    date: input.date,
    metrics,
    dimensions: {},
    confidence: 1,
    currency: "USD",
    attribution: "7d",
    learning: weight,
  };
  expect(aggregateEvidence([row])).toMatchObject({
    spend: 100,
    purchases: 10,
    roas: 5,
    learning: { averageWeight: weight.weight },
  });
  expect(
    learningWeight({ ...input, versionReliability: 1 }).weight
  ).toBeGreaterThan(weight.weight);
});
it("turns comparable supported cohorts into a reviewable test and abstains on missing labels or weight", () => {
  const cohort = (label: string, roas: number) => ({
    labels: [label],
    sourceAdIds: ["1", "2", "3"],
    spend: 100,
    impressions: 1000,
    clicks: 100,
    purchases: 12,
    purchaseValue: 100 * roas,
    roas,
    adCount: 3,
    samples: 12,
    confidence: 0.9,
    comparable: true,
    currency: "USD",
    attribution: "7d",
    evidenceStrength: "directional",
    learning: { averageWeight: 0.6, weightedRoas: roas },
  });
  const evidence = {
    summary: cohort("all", 3),
    groups: [cohort("cinematic", 4), cohort("realistic", 2)],
    coverage: { incomplete: false, truncated: false },
  };
  const input = {
    schemaVersion: 1,
    kind: "art_style",
    channel: "meta_ads",
    brief: "Verified product only",
    evidence,
  };
  const r = optimizeEvidence(input);
  expect(r.decision).toBe("propose_test");
  expect(r.nextAction).toMatchObject({
    keep: ["realistic"],
    test: ["cinematic"],
  });
  expect(r.generationBrief).toContain("cinematic");
  expect(
    optimizeEvidence({
      ...input,
      evidence: { ...evidence, groups: [cohort("unknown", 10)] },
    }).decision
  ).toBe("insufficient_evidence");
  expect(optimizeEvidence({ ...input, channel: "google_ads" }).decision).toBe(
    "unsupported_channel"
  );
});

it("retires stale imported versions without resurrecting older revisions or erasing reviewed labels", () => {
  const base = { dimension: "theme" as const, labels: [{ id: "spotlight", label: "Spotlight", confidence: 1, evidence: "Frozen delivery" }], source: "import" as const, version: 3, observedAtMs: 1, revision: 1 };
  const retired = { ...base, labels: [], retired: true, revision: 2 };
  expect(effectiveClassifications([base, retired]).theme).toBeUndefined();
  const human = { ...base, source: "human" as const };
  expect(effectiveClassifications([base, retired, human]).theme).toEqual(human);
});
