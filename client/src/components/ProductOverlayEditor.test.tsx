// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  save: vi.fn(),
  align: vi.fn(),
  refetch: vi.fn(),
  sourceWidth: 600,
  layerCount: 1,
  applied: true,
  automaticFailure: undefined as "source_resolution" | undefined,
  sources: [] as any[],
  query: vi.fn(),
}));
vi.mock("./ActionCredits", () => ({ ActionCredits: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    assetLibrary: { studioList: { useQuery: () => ({ data: calls.sources }) } },
    creativeBuilder: {
      productOverlay: {
        useQuery: (input: unknown) => {
          calls.query(input);
          return {
            dataUpdatedAt: 1,
            refetch: calls.refetch,
            data: {
              designUrl: "data:image/png;base64,preview",
              width: 1000,
              height: 1000,
              applied: calls.applied,
              automaticFailure: calls.automaticFailure,
              revision: "revision",
              layers: Array.from({ length: calls.layerCount }, () => ({
                left: 100,
                top: 100,
                width: 400,
                sourceWidth: calls.sourceWidth,
                sourceHeight: calls.sourceWidth * 2,
                aspect: 0.5,
                preview: "data:image/png;base64,product",
              })),
            },
          };
        },
      },
      saveProductOverlay: { useMutation: () => ({ mutateAsync: calls.save }) },
      alignProductOverlay: {
        useMutation: () => ({ mutateAsync: calls.align }),
      },
    },
  },
}));
import { ProductOverlayEditor } from "./ProductOverlayEditor";
it("keeps failed alignment visible and editable on open/reset without paid calls", () => {
  calls.applied = false;
  render(
    <ProductOverlayEditor organizationId={3} variantId={90} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  expect(screen.getByAltText("Original product 1")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Compare with original design"));
  expect(screen.queryByAltText("Original product 1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reset placement" }));
  expect(screen.getByAltText("Original product 1")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("left in pixels"), {
    target: { value: "150" },
  });
  expect(screen.getByAltText("Original product 1").style.left).toBe("15%");
  fireEvent.click(screen.getByRole("button", { name: "Reset placement" }));
  expect(screen.getByAltText("Original product 1").style.left).toBe("10%");
  expect(calls.align).not.toHaveBeenCalled();
  expect(calls.save).not.toHaveBeenCalled();
});
afterEach(cleanup);
beforeEach(() => {
  calls.sourceWidth = 600;
  calls.layerCount = 1;
  calls.applied = true;
  calls.automaticFailure = undefined;
  calls.sources = [];
  vi.clearAllMocks();
});

it("requires fresh source selection and confirmation after switching product layers by pointer", () => {
  calls.layerCount = 2;
  calls.sources = [
    {
      key: "asset:9",
      revision: "a".repeat(64),
      name: "Layer A original",
      origin: "uploaded",
      purpose: "source",
      sourceType: "product",
      state: "approved",
      mimeType: "image/png",
    },
  ];
  render(
    <ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  const choice = screen.getByLabelText(
    "Higher-resolution product source"
  ) as HTMLSelectElement;
  const confirmation = screen.getByLabelText(
    "I verified the same product, configuration and camera view."
  ) as HTMLInputElement;
  const preview = screen.getByRole("button", {
    name: "Preview replacement",
  }) as HTMLButtonElement;
  fireEvent.change(choice, { target: { value: "asset:9" } });
  fireEvent.click(confirmation);
  fireEvent.click(preview);
  const layerA = {
    index: 0,
    key: "asset:9",
    revision: "a".repeat(64),
    sameViewConfirmed: true,
  };
  const layerBImage = screen.getByAltText("Original product 2");
  Object.defineProperty(layerBImage, "setPointerCapture", { value: vi.fn() });
  fireEvent.pointerDown(layerBImage, {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
  });
  expect(choice.value).toBe("");
  expect(confirmation.checked).toBe(false);
  expect(preview.disabled).toBe(true);
  fireEvent.click(preview);
  expect(calls.query).toHaveBeenLastCalledWith({
    organizationId: 1,
    variantId: 2,
    replacements: [layerA],
  });
  // Even the same uploaded asset must be deliberately selected and confirmed for B.
  fireEvent.change(choice, { target: { value: "asset:9" } });
  expect(preview.disabled).toBe(true);
  fireEvent.click(confirmation);
  fireEvent.click(preview);
  expect(calls.query).toHaveBeenLastCalledWith({
    organizationId: 1,
    variantId: 2,
    replacements: [layerA, { ...layerA, index: 1 }],
  });
  expect(calls.save).not.toHaveBeenCalled();
  expect(calls.align).not.toHaveBeenCalled();
});

it("previews an explicitly confirmed source without alignment and saves a bound replacement", async () => {
  calls.sources = [
    {
      key: "asset:9",
      revision: "a".repeat(64),
      name: "Same view original",
      origin: "uploaded",
      purpose: "source",
      sourceType: "product",
      state: "approved",
      mimeType: "image/png",
    },
  ];
  calls.save.mockResolvedValue({ key: "creative:3" });
  render(
    <ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  fireEvent.change(screen.getByLabelText("Higher-resolution product source"), {
    target: { value: "asset:9" },
  });
  const preview = screen.getByRole("button", {
    name: "Preview replacement",
  }) as HTMLButtonElement;
  expect(preview.disabled).toBe(true);
  fireEvent.click(
    screen.getByLabelText(
      "I verified the same product, configuration and camera view."
    )
  );
  fireEvent.click(preview);
  const replacement = {
    index: 0,
    key: "asset:9",
    revision: "a".repeat(64),
    sameViewConfirmed: true,
  };
  expect(calls.query).toHaveBeenLastCalledWith({
    organizationId: 1,
    variantId: 2,
    replacements: [replacement],
  });
  expect(screen.getByText(/previewing an unsaved placement/)).toBeTruthy();
  expect(calls.align).not.toHaveBeenCalled();
  fireEvent.load(screen.getByAltText("Original complete creative design"));
  fireEvent.click(screen.getByRole("button", { name: "Save as new version" }));
  await waitFor(() =>
    expect(calls.save).toHaveBeenCalledWith(
      expect.objectContaining({
        replacements: [replacement],
        allowUpscale: false,
      })
    )
  );
});

it("explains a recorded resolution failure without starting another paid alignment", () => {
  calls.applied = false;
  calls.automaticFailure = "source_resolution";
  render(
    <ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  expect(
    screen.getByText(/sharper source or accepted enlargement/)
  ).toBeTruthy();
  expect(calls.align).not.toHaveBeenCalled();
  expect(calls.save).not.toHaveBeenCalled();
});

it("separates unsaved alignment from saved state and resets without spending credits", async () => {
  calls.applied = false;
  calls.sourceWidth = 164;
  calls.align.mockResolvedValue({
    sameAngle: true,
    layers: [{ left: 443, top: 211, width: 525 }],
  });
  render(
    <ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  fireEvent.load(screen.getByAltText("Original complete creative design"));
  expect(screen.getByText(/Saved cutout: 164/)).toBeTruthy();
  expect(calls.align).not.toHaveBeenCalled();
  expect(screen.getByText(/This saved version has no applied/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suggest alignment" }));
  await waitFor(() =>
    expect(screen.getByText(/Alignment suggested/)).toBeTruthy()
  );
  expect(screen.queryByText(/This saved version has no applied/)).toBeNull();
  expect(screen.getByText(/previewing an unsaved placement/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Save as new version",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(screen.getByLabelText("Accept enlargement for this version"));
  fireEvent.click(screen.getByRole("button", { name: "Reset placement" }));
  expect(screen.queryByText(/Alignment suggested/)).toBeNull();
  expect(screen.getByText(/This saved version has no applied/)).toBeTruthy();
  expect(
    (screen.getByLabelText("Compare with original design") as HTMLInputElement)
      .checked
  ).toBe(false);
  expect(
    (
      screen.getByLabelText(
        "Accept enlargement for this version"
      ) as HTMLInputElement
    ).checked
  ).toBe(false);
  expect(calls.align).toHaveBeenCalledTimes(1);
  expect(calls.save).not.toHaveBeenCalled();
});

it("requires the original background to load before alignment or saving", () => {
  render(
    <ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  const save = screen.getByRole("button", {
    name: "Save as new version",
  }) as HTMLButtonElement;
  const align = screen.getByRole("button", {
    name: "Suggest alignment",
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect(align.disabled).toBe(true);
  const design = screen.getByAltText("Original complete creative design");
  fireEvent.load(design);
  expect(save.disabled).toBe(false);
  expect(align.disabled).toBe(false);
  fireEvent.error(design);
  expect(save.disabled).toBe(true);
  expect(align.disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain(
    "could not be displayed"
  );
  expect(
    screen.getByRole("button", { name: "Reload original design" })
  ).toBeTruthy();
  expect(calls.save).not.toHaveBeenCalled();
  expect(calls.align).not.toHaveBeenCalled();
});

it("requires explicit acceptance when a manual placement exceeds the measured source resolution", () => {
  calls.sourceWidth = 300;
  render(
    <ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  fireEvent.load(screen.getByAltText("Original complete creative design"));
  const save = screen.getByRole("button", {
    name: "Save as new version",
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Accept enlargement for this version"));
  expect(save.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("width in pixels"), {
    target: { value: "450" },
  });
  expect(save.disabled).toBe(true);
  expect(calls.save).not.toHaveBeenCalled();
});
it("allows accepted enlargement of a verified replacement and saves independent height", async () => {
  calls.sourceWidth = 300;
  calls.sources = [
    {
      key: "asset:9",
      revision: "a".repeat(64),
      name: "Same view original",
      origin: "uploaded",
      purpose: "source",
      sourceType: "product",
      state: "approved",
      mimeType: "image/png",
    },
  ];
  calls.save.mockResolvedValue({ key: "creative:3" });
  render(
    <ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adjust original product" })
  );
  fireEvent.load(screen.getByAltText("Original complete creative design"));
  fireEvent.change(screen.getByLabelText("Higher-resolution product source"), {
    target: { value: "asset:9" },
  });
  fireEvent.click(
    screen.getByLabelText(
      "I verified the same product, configuration and camera view."
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview replacement" }));
  fireEvent.change(screen.getByLabelText("height in pixels"), {
    target: { value: "700" },
  });
  expect(
    (screen.getByAltText("Original product 1") as HTMLImageElement).style.height
  ).toBe("70%");
  const save = screen.getByRole("button", {
    name: "Save as new version",
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Accept enlargement for this version"));
  fireEvent.click(save);
  await waitFor(() =>
    expect(calls.save).toHaveBeenCalledWith(
      expect.objectContaining({
        allowUpscale: true,
        layers: [{ left: 100, top: 100, width: 400, height: 700 }],
        replacements: [expect.objectContaining({ key: "asset:9" })],
      })
    )
  );
  expect(calls.align).not.toHaveBeenCalled();
});
