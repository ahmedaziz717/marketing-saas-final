import { expect, it } from "vitest";
import { catalogReviewNotices } from "../shared/catalogReadiness";
import { metaScheduleIssue } from "../shared/metaSchedule";

it("derives current review notices rather than persisting stale missing-field errors", () => {
  const p = {
    productUrl: "",
    price: "1200",
    currency: "",
    provenance: { source: "api", "api.imageStatus": "unavailable" },
    images: [],
  };
  expect(catalogReviewNotices(p)).toHaveLength(3);
  expect(
    catalogReviewNotices({
      ...p,
      productUrl: "https://shop.example/one",
      currency: "USD",
      images: [{}],
      provenance: { source: "api", "api.imageStatus": "available" },
    })
  ).toEqual([]);
  expect(catalogReviewNotices({ ...p, images: [{}] })[2]).toContain("retained");
  expect(
    catalogReviewNotices({ ...p, provenance: { source: "manual" } })
  ).toEqual([]);
});

it("keeps date warnings until valid, permits a blank start, and requires an end for lifetime budgets", () => {
  const now = Date.parse("2026-10-21T00:00:00Z");
  expect(metaScheduleIssue("2026-10-20T23:00:00Z", "", false, now)?.field).toBe(
    "startTime"
  );
  expect(metaScheduleIssue("2026-10-20T22:00:00Z", "", false, now)?.field).toBe(
    "startTime"
  );
  expect(metaScheduleIssue("", "", false, now)).toBeNull();
  expect(metaScheduleIssue("2026-10-22T00:00:00Z", "", false, now)).toBeNull();
  expect(metaScheduleIssue("", "", true, now)?.field).toBe("endTime");
  expect(
    metaScheduleIssue(
      "2026-10-23T00:00:00Z",
      "2026-10-22T00:00:00Z",
      false,
      now
    )?.field
  ).toBe("endTime");
  expect(metaScheduleIssue("invalid", "", false, now)?.field).toBe("startTime");
});
