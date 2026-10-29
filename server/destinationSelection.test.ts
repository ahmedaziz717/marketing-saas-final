import { describe, expect, it } from "vitest";
import { resolveDestinationSelection } from "../shared/destinationSelection";

const a = { id: "a" },
  b = { id: "b" };
describe("authorized destination cardinality", () => {
  it("only auto-selects one settled eligible option", () => {
    expect(resolveDestinationSelection([a], "")).toMatchObject({
      status: "single",
      autoSelectId: "a",
      showPicker: false,
    });
    expect(resolveDestinationSelection([a], "a").autoSelectId).toBeUndefined();
    expect(resolveDestinationSelection([a, b], "")).toMatchObject({
      status: "multiple",
      showPicker: true,
      autoSelectId: undefined,
    });
    expect(resolveDestinationSelection([], "")).toMatchObject({
      status: "empty",
      showPicker: false,
      autoSelectId: undefined,
    });
  });
  it.each([{ loading: true }, { error: true }, { loading: true, error: true }])(
    "does not auto-select or treat cached cardinality as final with %j",
    state => {
      for (const options of [[], [a], [a, b]]) {
        const result = resolveDestinationSelection(options, "", state);
        expect(result.autoSelectId).toBeUndefined();
        expect(result.showPicker).toBe(false);
        expect(["loading", "error"]).toContain(result.status);
      }
    }
  );
  it("preserves unavailable saved IDs rather than retargeting the only option", () => {
    for (const options of [[], [b], [a, b]]) {
      const result = resolveDestinationSelection(options, "missing");
      expect(result.status).toBe("unavailable");
      expect(result.autoSelectId).toBeUndefined();
      expect(result.selected).toBeUndefined();
    }
  });
  it("reconciles one, many, and zero options without discarding a still-valid choice", () => {
    expect(resolveDestinationSelection([a, b], "a")).toMatchObject({
      selected: a,
      showPicker: true,
    });
    expect(resolveDestinationSelection([a], "a")).toMatchObject({
      status: "single",
      selected: a,
      showPicker: false,
    });
    expect(resolveDestinationSelection([], "a")).toMatchObject({
      status: "unavailable",
      selected: undefined,
    });
    expect(resolveDestinationSelection([b], "a").autoSelectId).toBeUndefined();
  });
  it("counts duplicate option IDs only once", () => {
    expect(resolveDestinationSelection([a, a], "")).toMatchObject({
      status: "single",
      autoSelectId: "a",
    });
  });
});
