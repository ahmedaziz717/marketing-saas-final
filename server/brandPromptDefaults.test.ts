import { expect, it } from "vitest";
import { PROMPT_REGISTRY } from "../shared/promptRegistry";
import { promptGroup } from "../shared/promptPresentation";
import {
  mayPersonalizeBrandDefault,
  personalizedBrandDefault,
} from "../shared/brandPromptDefaults";

const profile = {
  general:
    "For Example Co, address practical business owners in a clear, calm voice. Emphasize reliable support without unsupported guarantees.",
  copy: "Write concise, helpful copy for Example Co's business audience. Prefer concrete benefits and avoid fear, jargon and invented claims.",
  visual:
    "For Example Co, use restrained teal and clean typography with approachable business imagery. Keep the selected theme recognizable.",
};
it("keeps every eligible system baseline intact while adding brand-specific instructions within form limits", () => {
  for (const definition of PROMPT_REGISTRY.filter(
    p => promptGroup(p.id) !== "technical"
  )) {
    const baseline = definition.baseline;
    const result = personalizedBrandDefault(definition, "Example Co", profile);
    expect(result.startsWith(baseline + "\n\nBrand Kit: Example Co")).toBe(
      true
    );
    expect(result.length).toBeLessThanOrEqual(definition.maxLength);
    expect(definition.baseline).toBe(baseline);
    expect(result).toContain("up-to-date facts");
  }
});
it("does not personalize protected/internal prompts or overwrite manual save/restore decisions", () => {
  for (const definition of PROMPT_REGISTRY.filter(
    p => promptGroup(p.id) === "technical"
  ))
    expect(() =>
      personalizedBrandDefault(definition, "Example Co", profile)
    ).toThrow(/user-facing/);
  expect(mayPersonalizeBrandDefault()).toBe(true);
  expect(mayPersonalizeBrandDefault({ action: "personalize_brand" })).toBe(
    true
  );
  for (const action of ["save", "restore_system", "restore_revision"])
    expect(mayPersonalizeBrandDefault({ action })).toBe(false);
});
