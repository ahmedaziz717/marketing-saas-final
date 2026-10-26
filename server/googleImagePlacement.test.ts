import { expect, it } from "vitest";
import {
  googleImageMatches,
  googleMarketingImagePlacement,
} from "../shared/googleImagePlacement";
it("classifies supported marketing dimensions without inferring from filenames or removed assets", () => {
  expect(googleMarketingImagePlacement(1080, 1080)).toBe(
    "SQUARE_MARKETING_IMAGE"
  );
  expect(googleMarketingImagePlacement(1200, 628)).toBe("MARKETING_IMAGE");
  expect(googleMarketingImagePlacement(480, 600)).toBe(
    "PORTRAIT_MARKETING_IMAGE"
  );
  for (const [w, h] of [
    [299, 299],
    [480, 599],
    [1920, 1080],
    [0, 0],
    [NaN, 300],
    [Infinity, 300],
  ]) {
    expect(googleMarketingImagePlacement(w, h)).toBeUndefined();
  }
  expect(googleMarketingImagePlacement()).toBeUndefined();
  expect(googleImageMatches("LOGO", 128, 128)).toBe(true);
  expect(googleMarketingImagePlacement(128, 128)).toBeUndefined();
});
