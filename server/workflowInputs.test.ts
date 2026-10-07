import { describe, it, expect } from "vitest";
import {
  appFieldSchema,
  fieldValueProblem,
  fieldPrompt,
  systemInputChoices,
} from "../shared/workflowInputs";
import { workflowImageSize } from "../shared/imageActionEstimate";
describe("App form contracts", () => {
  it("checks multi-select bounds and curated options", () => {
    const f = appFieldSchema.parse({
      kind: "theme",
      source: "curated",
      multiple: true,
      required: true,
      maxSelections: 2,
      options: systemInputChoices("theme").slice(0, 3),
    });
    expect(fieldValueProblem(f, "[]")).toMatch(/least/);
    expect(
      fieldValueProblem(f, JSON.stringify(f.options.map(x => x.id)))
    ).toMatch(/number/);
    expect(fieldValueProblem(f, '["invented"]')).toMatch(/available/);
    expect(fieldValueProblem(f, JSON.stringify([f.options[0].id]))).toBeNull();
    expect(fieldPrompt(f, JSON.stringify([f.options[0].id]))).toContain(
      f.options[0].direction
    );
  });
  it("validates URL protocols and image keys", () => {
    expect(
      fieldValueProblem(
        appFieldSchema.parse({ kind: "url" }),
        "javascript:alert(1)"
      )
    ).not.toBeNull();
    expect(
      fieldValueProblem(
        appFieldSchema.parse({ kind: "asset" }),
        "https://elsewhere/image"
      )
    ).not.toBeNull();
    expect(
      fieldValueProblem(
        appFieldSchema.parse({ kind: "asset" }),
        "product_image:22"
      )
    ).toBeNull();
  });
  it("maps landscape selection to the advertised pixel dimensions", () => {
    expect(workflowImageSize("1.91:1")).toEqual({ width: 1200, height: 628 });
  });
});
