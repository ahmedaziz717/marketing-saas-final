import { expect, it } from "vitest";
import {
  websiteAddressSchema,
  businessProfileSchema,
  suggestedBusinessProfileSchema,
} from "../../shared/businessProfile";
it("accepts bare domains without adding www or changing existing schemes", () => {
  expect(websiteAddressSchema.parse(" learnlikethis.com ")).toBe(
    "https://learnlikethis.com"
  );
  expect(websiteAddressSchema.parse("www.learnlikethis.com/plans")).toBe(
    "https://www.learnlikethis.com/plans"
  );
  expect(websiteAddressSchema.parse("http://example.com")).toBe(
    "http://example.com"
  );
  for (const url of [
    "javascript:alert(1)",
    "ftp://example.com",
    "https://user:pass@example.com",
    "not a website",
  ])
    expect(websiteAddressSchema.safeParse(url).success).toBe(false);
  expect(businessProfileSchema.parse({ website: "" }).website).toBe("");
});
it("normalizes AI list answers while rejecting objects and retaining editable string fields", () => {
  expect(
    suggestedBusinessProfileSchema.parse({
      audiences: ["Learners", "Teachers"],
      goals: ["Grow subscriptions"],
    })
  ).toMatchObject({
    audiences: "Learners\nTeachers",
    goals: "Grow subscriptions",
  });
  expect(
    suggestedBusinessProfileSchema.safeParse({
      audiences: [{ name: "Teachers" }],
    }).success
  ).toBe(false);
  expect(
    businessProfileSchema.safeParse({ audiences: ["Teachers"] }).success
  ).toBe(false);
});
