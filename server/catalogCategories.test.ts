import { expect, it } from "vitest";
import { categorySettingsSchema, resolveMarketingCategory, categorySelectionState } from "../shared/catalogCategories";
const gaming = "10000000-0000-4000-8000-000000000001";
const workstation = "10000000-0000-4000-8000-000000000002";
const settings = categorySettingsSchema.parse({ categories: [{ id: gaming, name: "Gaming", audience: "Players" }, { id: workstation, name: "Workstations", audience: "Creators" }], mappings: [{ sourceId: 1, sourceCategory: "A", categoryId: gaming }, { sourceId: 1, sourceCategory: "B", categoryId: gaming }] });
it("uses explicit source-scoped many-code mapping and preserves product override", () => {
  expect(resolveMarketingCategory({ id: 1, sourceId: 1, category: "B" }, settings).category?.id).toBe(gaming);
  expect(resolveMarketingCategory({ id: 1, sourceId: 2, category: "B" }, settings).status).toBe("unmapped");
  const result = resolveMarketingCategory({ id: 1, sourceId: 1, category: "A", categoryOverride: { categoryId: workstation, userId: 8, confirmedAtMs: 10 } }, settings, 3);
  expect(result.category?.id).toBe(workstation);
  expect(result.origin).toBe("product_override");
  expect(result.revision).toBe(3);
});
it("never falls back to mappings when an override is no longer known", () => {
  expect(resolveMarketingCategory({ id: 1, sourceId: 1, category: "A", categoryOverride: { categoryId: "missing", userId: 8, confirmedAtMs: 10 } }, settings).status).toBe("unmapped");
  expect(categorySettingsSchema.safeParse({ ...settings, mappings: [{ sourceId: 1, sourceCategory: "A", categoryId: "10000000-0000-4000-8000-000000000003" }] }).success).toBe(false);
});
it("requires visible choices for mixed and unmapped selections", () => {
  const mapped = resolveMarketingCategory({ id: 1, sourceId: 1, category: "A" }, settings);
  expect(categorySelectionState([{ marketingCategory: mapped }]).requiresChoice).toBe(false);
  expect(categorySelectionState([{ marketingCategory: mapped }, {}])).toMatchObject({ unmapped: 1, requiresChoice: true });
});
