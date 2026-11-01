import { expect, it } from "vitest";
import { googleBusinessDefaults } from "./googleBusinessDefaults";
it("prefers the workspace brand name without truncating it and normalizes its website", () => {
  const name = "A business name longer than twenty five characters";
  expect(
    googleBusinessDefaults(
      1,
      { organizationId: 1, name, businessProfile: { website: "example.com" } },
      { id: 1, name: "Workspace" }
    )
  ).toEqual({ businessName: name, finalUrl: "https://example.com" });
});
it("falls back only to the matching workspace and ignores invalid websites", () => {
  expect(googleBusinessDefaults(1, null, { id: 1, name: "Workspace" })).toEqual(
    { businessName: "Workspace", finalUrl: "" }
  );
  expect(googleBusinessDefaults(1, null, { id: 2, name: "Other" })).toEqual({
    businessName: "",
    finalUrl: "",
  });
  expect(
    googleBusinessDefaults(1, { organizationId: 2, name: "Other" })
  ).toBeNull();
  expect(
    googleBusinessDefaults(1, {
      organizationId: 1,
      name: "Brand",
      businessProfile: { website: "javascript:alert(1)" },
    })?.finalUrl
  ).toBe("");
});
