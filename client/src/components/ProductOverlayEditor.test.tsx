// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  save: vi.fn(),
  align: vi.fn(),
  refetch: vi.fn(),
  sourceWidth: 600,
}));
vi.mock("./ActionCredits", () => ({ ActionCredits: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    creativeBuilder: {
      productOverlay: {
        useQuery: () => ({
          dataUpdatedAt: 1,
          refetch: calls.refetch,
          data: {
            designUrl: "data:image/png;base64,preview",
            width: 1000,
            height: 1000,
            applied: true,
            revision: "revision",
            layers: [
              {
                left: 100,
                top: 100,
                width: 400,
                sourceWidth: calls.sourceWidth,
                sourceHeight: calls.sourceWidth * 2,
                aspect: 0.5,
                preview: "data:image/png;base64,product",
              },
            ],
          },
        }),
      },
      saveProductOverlay: { useMutation: () => ({ mutateAsync: calls.save }) },
      alignProductOverlay: {
        useMutation: () => ({ mutateAsync: calls.align }),
      },
    },
  },
}));
import { ProductOverlayEditor } from "./ProductOverlayEditor";
afterEach(cleanup);
beforeEach(() => { calls.sourceWidth = 600; vi.clearAllMocks(); });

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
  render(<ProductOverlayEditor organizationId={1} variantId={2} onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust original product" }));
  fireEvent.load(screen.getByAltText("Original complete creative design"));
  const save = screen.getByRole("button", { name: "Save as new version" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Accept enlargement for this version"));
  expect(save.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("width in pixels"), { target: { value: "450" } });
  expect(save.disabled).toBe(true);
  expect(calls.save).not.toHaveBeenCalled();
});
