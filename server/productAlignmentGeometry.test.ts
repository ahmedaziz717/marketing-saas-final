import { expect, it } from "vitest";
import { resolveProductAlignment } from "../shared/productOverlay";

it("maps normalized bounds against the full non-square canvas, not source padding or preview dimensions", () => {
  const result = resolveProductAlignment(
    { left: 250, top: 200, width: 200, height: 600 },
    { width: 300, height: 600 },
    { width: 1200, height: 800 }
  );
  expect(result.placement).toEqual({ left: 300, top: 160, width: 240 });
  expect(result.measurement.detectedBounds).toEqual({
    left: 300,
    top: 160,
    width: 240,
    height: 480,
  });
  expect(result.measurement.renderedBounds).toEqual({
    left: 300,
    top: 160,
    width: 240,
    height: 480,
  });
});
it("retains both accepted dimensions in position-only mode and exposes detected versus rendered bounds", () => {
  const result = resolveProductAlignment(
    { left: 300, top: 200, width: 200, height: 400 },
    { width: 300, height: 600 },
    { width: 1000, height: 1000 },
    { width: 220, height: 440 }
  );
  expect(result.placement).toEqual({
    left: 290,
    top: 180,
    width: 220,
    height: 440,
  });
  expect(result.measurement).toMatchObject({
    sizeMode: "preserve",
    normalizedBounds: { left: 300, top: 200, width: 200, height: 400 },
    detectedBounds: { left: 300, top: 200, width: 200, height: 400 },
    renderedBounds: { left: 290, top: 180, width: 220, height: 440 },
  });
});
it("refuses to resize or distort an accepted layer to cover a larger detection", () => {
  const result = resolveProductAlignment(
    { left: 300, top: 200, width: 200, height: 400 },
    { width: 300, height: 600 },
    { width: 1000, height: 1000 },
    { width: 180, height: 360 }
  );
  expect(result.reason).toBe("size_mismatch");
  expect(result.placement).toBeUndefined();
  expect(
    resolveProductAlignment(
      { left: 300, top: 200, width: 200, height: 400 },
      { width: 300, height: 600 },
      { width: 1000, height: 1000 },
      { width: 220, height: 500 }
    ).reason
  ).toBe("size_mismatch");
});
it("rejects a synthetic shorter/wider detection before cover expansion can move it into copy", () => {
  // Reproduces the class of upward drift; NOT the unavailable raw creative99 response.
  const result = resolveProductAlignment(
    { left: 459, top: 260, width: 422, height: 530 },
    { width: 377, height: 562 },
    { width: 1080, height: 1080 }
  );
  expect(result.reason).toBe("aspect_mismatch");
  expect(result.measurement.detectedBounds.top).toBeCloseTo(280.8);
  expect(result.measurement.aspectDifference).toBeGreaterThan(0.15);
  expect(result.placement).toBeUndefined();
});
it("never clamps a detected position or clips its proportional cover at a canvas edge", () => {
  const result = resolveProductAlignment(
    { left: 300, top: 0, width: 220, height: 400 },
    { width: 300, height: 600 },
    { width: 1000, height: 1000 }
  );
  expect(result.reason).toBe("invalid_geometry");
  expect(result.measurement.renderedBounds?.top).toBe(-20);
  expect(result.placement).toBeUndefined();
});
