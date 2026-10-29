// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CopyEvidenceResult } from "./CopyEvidenceResult";
import { classifyCopy, copyDimensions } from "@shared/copyTaxonomy";
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
it("lets readers explore dimensions and supporting copy while keeping technical IDs in details", () => {
  const copy = {
    headline: ["Save $200 on faster PCs"],
    subheadline: [],
    primary_text: [],
    description: [],
  };
  const data = {
    source: "live_meta_copy_analysis",
    schemaVersion: 2,
    summary: "Observed copy differences",
    settings: {
      dimensions: [...copyDimensions],
      objective: "cpa",
      minimumImpressions: 1000,
      minimumPurchases: 5,
    },
    evidence: {
      accountName: "Example account",
      range: { since: "2026-10-01", until: "2026-10-07" },
      currency: "USD",
      timezone: "UTC",
      fetchedAtMs: 1,
      coverage: {
        inspectedAds: 1,
        insightsReturned: 1,
        missingCreativeAds: 0,
        truncated: false,
      },
      ads: [
        {
          id: "123456789",
          name: "Fast gaming offer",
          campaignId: "21",
          adsetId: "31",
          creativeId: "41",
          copy,
          metrics: { spend: 200, purchases: 10, roas: 4 },
        },
      ],
      warnings: [],
      attribution: "Account attribution",
    },
    comparisons: copyDimensions.map(d => ({
      field: "headline",
      dimension: d,
      groups: [],
      taggedAds: 1,
      comparedAds: 1,
      excludedAds: 0,
      observedLeader: null,
    })),
    taggedAds: [{ adId: "123456789", tags: classifyCopy(copy) }],
    limitations: [],
  };
  render(<CopyEvidenceResult data={data} />);
  expect(screen.getByRole("heading", { name: "Copy analysis" })).toBeTruthy();
  changeField(screen.getByLabelText("Copy dimension"), {
    target: { value: "offer" },
  });
  expect(
    screen.getAllByText(/What incentive is explicitly offered/)[0]
  ).toBeTruthy();
  fireEvent.click(screen.getByText("Ad copy & assigned attributes (1)"));
  fireEvent.click(screen.getByText(/Fast gaming offer · Spend/));
  expect(screen.getByText("Save $200 on faster PCs")).toBeTruthy();
  expect(screen.getAllByText("Saving money")[0]).toBeTruthy();
  const technical = screen.getByText(/Ad: 123456789/).closest("details");
  expect(technical?.open).toBe(false);
  changeField(screen.getByRole("radiogroup", { name: "Copy field" }), {
    target: { value: "subheadline" },
  });
  expect(
    screen.getByText(/External image subheadlines are not extracted/)
  ).toBeTruthy();
  changeField(screen.getByLabelText("Search classified ads"), {
    target: { value: "not present" },
  });
  expect(screen.getByText("No ads match this search.")).toBeTruthy();
});
