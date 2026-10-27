import { expect, it } from "vitest";
import {
  resolveProductAlignment,
  manuallyAppliedProductOverlay,
} from "../shared/productOverlay";
const source = { width: 400, height: 600 };
const canvas = { width: 1000, height: 1000 };
const body = { left: 100, top: 100, width: 800, height: 800, confidence: 0.99 };
const target = { left: 300, top: 200, width: 320, height: 480 };
it("fits physical body in its own source coordinates while retaining reflection and all source pixels", () => {
  const r = resolveProductAlignment(target, source, canvas, undefined, body);
  expect(r.placement).toEqual({ left: 260, top: 140, width: 400 });
  expect(r.measurement.renderedBounds).toEqual({
    left: 260,
    top: 140,
    width: 400,
    height: 600,
  });
  expect(r.measurement.renderedBodyBounds).toEqual(target);
  expect(r.measurement.anchorMode).toBe("physical_body");
});
it("uniformly scales source and body, not canvas padding", () => {
  const r = resolveProductAlignment(
    { ...target, width: 160, height: 240 },
    source,
    canvas,
    undefined,
    body
  );
  expect(r.placement).toEqual({ left: 280, top: 170, width: 200 });
  expect(r.measurement.renderedBounds?.height).toBe(300);
});
it("position-only retains accepted whole-cutout dimensions", () => {
  const r = resolveProductAlignment(
    target,
    source,
    canvas,
    { width: 400, height: 600 },
    body
  );
  expect(r.placement).toEqual({ left: 260, top: 140, width: 400, height: 600 });
  expect(
    resolveProductAlignment(
      target,
      source,
      canvas,
      { width: 300, height: 450 },
      body
    ).reason
  ).toBe("size_mismatch");
});
it.each([
  [{ ...body, confidence: 0.8 }, "invalid_geometry"],
  [{ ...body, left: 300 }, "invalid_geometry"],
  [{ ...body, width: 0 }, "invalid_geometry"],
  [{ ...body, width: 400 }, "aspect_mismatch"],
  [{ ...body, top: NaN }, "invalid_geometry"],
])("fails closed on unsafe source body %j", (b, reason) => {
  expect(
    resolveProductAlignment(target, source, canvas, undefined, b as typeof body)
      .reason
  ).toBe(reason);
});
it("does not clip retained reflections to force fit", () => {
  expect(
    resolveProductAlignment(
      { ...target, top: 500 },
      source,
      canvas,
      undefined,
      body
    ).reason
  ).toBe("invalid_geometry");
});
it("rejects normalized detections rounding to zero pixels", () => {
  expect(
    resolveProductAlignment(
      { left: 0, top: 0, width: 1, height: 1 },
      { width: 100, height: 100 },
      { width: 256, height: 256 }
    ).reason
  ).toBe("invalid_geometry");
});
it("manual new versions clear stale automatic measurements without mutating original", () => {
  const metadata: any = {
    method: "editable_original_v3",
    applied: true,
    measurements: [{ anchorMode: "physical_body" }],
    layers: [],
  };
  expect(
    manuallyAppliedProductOverlay(metadata, []).measurements
  ).toBeUndefined();
  expect(metadata.measurements).toHaveLength(1);
});
