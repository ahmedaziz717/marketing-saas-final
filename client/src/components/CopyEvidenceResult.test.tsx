// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CopyEvidenceResult } from "./CopyEvidenceResult";
afterEach(cleanup);
it("shows actual copy, rule matches, missing metrics and coverage without a fabricated confidence score", () => {
  const data = {
    source: "live_meta_copy_analysis",
    summary: "Insufficient comparable evidence",
    settings: {
      objective: "cpa",
      minimumImpressions: 1000,
      minimumPurchases: 5,
    },
    evidence: {
      accountName: "Selected account",
      range: { since: "2026-10-01", until: "2026-10-07" },
      currency: "USD",
      timezone: "America/Los_Angeles",
      coverage: {
        inspectedAds: 1,
        insightsReturned: 2,
        truncated: true,
        missingCreativeAds: 0,
      },
      ads: [
        {
          id: "11",
          name: "Source ad",
          campaignId: "21",
          adsetId: "31",
          creativeId: "41",
          copy: {
            headline: ["Shop now for PCs"],
            primary_text: [],
            description: [],
          },
          metrics: {
            spend: 100,
            purchases: null,
            purchaseValue: null,
            roas: null,
          },
        },
      ],
      attribution: "Account attribution",
      purchaseAction: null,
      warnings: ["Current creative snapshot"],
      fetchedAtMs: 1791720000000,
    },
    fields: [
      {
        field: "headline",
        observedLeader: null,
        comparedAds: 1,
        excludedAds: 0,
        groups: [],
        classifications: [
          {
            adId: "11",
            label: "direct",
            evidence: ["Text rule matched Shop now"],
          },
        ],
      },
    ],
    limitations: ["Not an A/B test"],
  };
  render(<CopyEvidenceResult data={data} />);
  expect(screen.getByText(/Partial dataset/)).toBeTruthy();
  expect(screen.getByText("Shop now for PCs")).toBeTruthy();
  expect(screen.getByText(/Text rule matched Shop now/)).toBeTruthy();
  expect(screen.getByText(/Purchases Unavailable/)).toBeTruthy();
  expect(screen.getByText(/Not estimable/)).toBeTruthy();
  expect(screen.queryByText(/0% confidence/)).toBeNull();
});
