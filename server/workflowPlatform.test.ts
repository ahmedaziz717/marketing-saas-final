import { expect, it } from "vitest";
import {
  businessWorkflowTemplate,
  businessWorkflowTemplates,
  compareEvidence,
  evaluateEvidence,
} from "../shared/workflowPlatform";
import { workflowGraphProblem } from "../shared/creativeWorkflow";
const report = {
  channel: "meta_ads",
  accountId: "123",
  campaignId: null,
  currency: "USD",
  timezone: "America/New_York",
  attribution: "account",
  range: { since: "2026-09-01", until: "2026-09-30" },
  metrics: { roas: 1.5, impressions: 2000, spend: 200, clicks: 20 },
  incomplete: false,
};
it("validates every starter graph without inferring connected accounts", () => {
  for (const template of businessWorkflowTemplates)
    expect(
      workflowGraphProblem(businessWorkflowTemplate(template.id)!)
    ).toBeNull();
});
it("preserves unavailable results and zero baselines and rejects incomparable reports", () => {
  const comparison = compareEvidence(
    { ...report, metrics: { spend: 30, roas: null } },
    { ...report, metrics: { spend: 0, roas: 2 } }
  );
  expect(comparison.comparison.spend.percentChange).toBeNull();
  expect(comparison.comparison.roas.current).toBeNull();
  expect(comparison.comparison.roas.change).toBeNull();
  expect(() =>
    compareEvidence(report, { ...report, accountId: "456" })
  ).toThrow(/same/);
  expect(() =>
    compareEvidence(report, { ...report, attribution: "another window" })
  ).toThrow(/same/);
});
it("abstains until account-local periods mature and evidence thresholds are met", () => {
  const config = {
    metric: "roas",
    goal: 2,
    minimumImpressions: 1000,
    minimumAgeHours: 24,
  };
  expect(
    evaluateEvidence(report, config, Date.parse("2026-10-02T02:00:00Z"))
      .decision
  ).toBe("insufficient_evidence");
  expect(
    evaluateEvidence(report, config, Date.parse("2026-10-02T05:00:00Z"))
      .decision
  ).toBe("propose_test");
  expect(
    evaluateEvidence(
      { ...report, metrics: { roas: 3, impressions: 2000 } },
      config,
      Date.parse("2026-10-02T05:00:00Z")
    ).decision
  ).toBe("retain");
  expect(
    evaluateEvidence(
      { ...report, incomplete: true },
      config,
      Date.parse("2026-10-03T05:00:00Z")
    ).decision
  ).toBe("insufficient_evidence");
  expect(
    evaluateEvidence(
      { ...report, timezone: undefined },
      config,
      Date.parse("2026-10-03T05:00:00Z")
    ).decision
  ).toBe("insufficient_evidence");
});
