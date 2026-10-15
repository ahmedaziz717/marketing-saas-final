import { expect, it } from "vitest";
import { activationHref, studioContentHref } from "../shared/contentWorkflow";
it("routes new content and edits into Activation Studio without losing context", () => {
  const href = studioContentHref("meta_ads", {
    asset: "asset:1",
    connection: "account",
    adset: "set",
    plan: 7,
    time: "2099-01-01T12:00",
    timezone: "America/New_York",
  });
  const url = new URL(href, "https://app.test");
  expect(url.pathname).toBe("/app/activate/studio");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    channel: "meta_ads",
    asset: "asset:1",
    connection: "account",
    adset: "set",
    plan: "7",
    time: "2099-01-01T12:00",
    timezone: "America/New_York",
  });
  const edit = new URL(
    studioContentHref("facebook", { id: "post" }),
    "https://app.test"
  );
  expect(edit.searchParams.get("publication")).toBe("post");
  expect(edit.searchParams.get("category")).toBe("compose");
  const review = new URL(
    activationHref("facebook", "post"),
    "https://app.test"
  );
  expect(review.searchParams.get("section")).toBe("preview");
  expect(review.searchParams.has("category")).toBe(false);
});
