import { expect, it } from "vitest";
import { contentSchema } from "../shared/channels";
import {
  appendCaptionLink,
  normalizeSocialPost,
  replaceSocialCaption,
} from "../shared/socialPost";

it("deduplicates the same URL without mistaking longer paths for the same link", () => {
  expect(
    appendCaptionLink(
      "Browse https://example.com/shop.",
      "https://example.com/shop"
    )
  ).toBe("Browse https://example.com/shop.");
  expect(
    appendCaptionLink(
      "Browse https://example.com/shopping",
      "https://example.com/shop"
    )
  ).toBe("Browse https://example.com/shopping\n\nhttps://example.com/shop");
  expect(
    appendCaptionLink("Browse https://example.com", "https://example.com/")
  ).toBe("Browse https://example.com");
});
it("leaves link-only Facebook posts and paid-ad destinations untouched", () => {
  const content = contentSchema.parse({
    title: "Post",
    message: "Our store",
    link: "https://example.com",
  });
  expect(normalizeSocialPost("facebook", null, content)).toBe(content);
  expect(normalizeSocialPost("meta_ads", "asset:1", content)).toBe(content);
  const media = normalizeSocialPost("facebook", "asset:1", content);
  expect(normalizeSocialPost("facebook", "asset:1", media)).toBe(media);
});
it("preserves website links when an AI suggestion replaces the caption", () => {
  expect(
    replaceSocialCaption(
      "See https://example.com/item_(blue)?ref=post#details",
      "New copy."
    )
  ).toBe("New copy.\n\nhttps://example.com/item_(blue)?ref=post#details");
  expect(
    replaceSocialCaption("See https://example.com/item_(blue)", "New copy.")
  ).toBe("New copy.\n\nhttps://example.com/item_(blue)");
  expect(
    replaceSocialCaption("Original copy. https://example.com/shop", "New copy.")
  ).toBe("New copy.\n\nhttps://example.com/shop");
  expect(
    replaceSocialCaption(
      "Original https://example.com/shop",
      "New https://example.com/shop"
    )
  ).toBe("New https://example.com/shop");
});
