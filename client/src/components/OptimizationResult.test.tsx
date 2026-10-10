// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OptimizationResult } from "./OptimizationResult";
afterEach(cleanup);
const base = {
  schemaVersion: 1,
  kind: "weekday_time",
  channel: "meta_ads",
  source: "live_meta_scheduling",
  statisticsVersion: 2,
  decision: "insufficient_evidence",
  confidence: null,
  observations: [],
  sourceAdIds: [],
  dimensions: ["weekday", "hour"],
  suggestedTests: [],
  generationBrief: "",
  caveats: [],
  requiresHumanApproval: true,
  currency: "USD",
};
it("shows separate calculated confidence and honest unavailable hourly state", () => {
  render(
    <OptimizationResult
      data={{
        ...base,
        dimensionReports: [
          {
            dimension: "weekday",
            explanation: "Only one observation per weekday.",
            statistics: {
              confidence: 0.7123,
              candidate: "Friday",
              comparisons: [
                {
                  label: "Friday",
                  probabilityBest: 0.7123,
                  cpaInterval95: [50, 200],
                },
              ],
            },
            evidence: { groups: [] },
          },
          {
            dimension: "hour",
            explanation: "Meta omitted conversions.",
            statistics: { confidence: null, comparisons: [] },
            evidence: { groups: [] },
          },
        ],
      }}
    />
  );
  expect(screen.getByText(/71.2% confidence in lowest CPA/)).toBeTruthy();
  expect(screen.getByText(/Purchase confidence not estimable/)).toBeTruthy();
  expect(screen.queryByText(/0% confidence/)).toBeNull();
  expect(screen.getByText(/95% CPA credible intervals/)).toBeTruthy();
});
it("flags old saved heuristic results instead of displaying false precision", () => {
  render(
    <OptimizationResult
      data={{ ...base, statisticsVersion: undefined, confidence: 0.5 }}
    />
  );
  expect(screen.getByText(/previous heuristic/)).toBeTruthy();
  expect(screen.queryByText(/50% confidence/)).toBeNull();
});
