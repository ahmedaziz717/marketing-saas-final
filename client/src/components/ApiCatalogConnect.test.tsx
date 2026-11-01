// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const api = vi.hoisted(() => ({ preview: vi.fn(), connect: vi.fn() }));
vi.mock("./ActionCredits", () => ({ ActionCredits: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    catalogSources: {
      previewApi: {
        useMutation: () => {
          const [data, setData] = useState<any>();
          return {
            data,
            isPending: false,
            mutateAsync: async (input: any) => {
              const result = await api.preview(input);
              setData(result);
              return result;
            },
          };
        },
      },
      connect: {
        useMutation: () => ({ isPending: false, mutateAsync: api.connect }),
      },
    },
  },
}));
import { ApiCatalogConnect } from "./ApiCatalogConnect";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function open() {
  render(<ApiCatalogConnect organizationId={3} onConnected={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect API endpoint" }));
}
it("explains malformed URLs before contacting the API and keeps mapping advanced", async () => {
  open();
  fireEvent.change(screen.getByLabelText("API endpoint"), {
    target: { value: "use https://api.vendor.example/products please" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview products" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Enter only the API address"
  );
  expect(api.preview).not.toHaveBeenCalled();
  expect(
    screen
      .getByText("Advanced settings · optional mapping overrides")
      .closest("details")?.open
  ).toBe(false);
});
it("shows missing details but allows a verified incomplete feed to import for review", async () => {
  api.preview.mockResolvedValue({
    mapping: { fields: {}, itemsPath: "", nextPath: "" },
    count: 1,
    ready: true,
    issues: [{ field: "productUrl", product: "Test PC", blocking: false }],
    samples: [
      {
        name: "Test PC",
        sku: "PC-1",
        specifications: { Memory: "32 GB total · 2 × 16GB DDR5" },
        productUrl: "",
      },
    ],
  });
  open();
  fireEvent.change(screen.getByLabelText("API endpoint"), {
    target: { value: "  https://api.vendor.example/products  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview products" }));
  await waitFor(() =>
    expect(screen.getByText("32 GB total · 2 × 16GB DDR5")).toBeTruthy()
  );
  expect(api.preview.mock.calls[0][0].endpoint).toBe(
    "https://api.vendor.example/products"
  );
  expect(screen.getByLabelText(/An example product-page link/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Connect and import catalog",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});

it("requires a fresh preview after edits and keeps the current settings and instructions", async () => {
  const response = {
    count: 1,
    ready: true,
    reviewProductCount: 1,
    mapping: { fields: {}, itemsPath: "", nextPath: "" },
    issues: [
      {
        field: "imageUrl",
        product: "PC",
        blocking: false,
        message: "Image missing",
      },
    ],
    samples: [{ name: "PC", sku: "1", productUrl: "", specifications: {} }],
  };
  api.preview.mockResolvedValue(response);
  open();
  fireEvent.change(screen.getByLabelText("API endpoint"), {
    target: { value: "https://api.example/products" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview products" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Connect and import catalog",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  fireEvent.change(
    screen.getByLabelText(/Website address where product images/),
    { target: { value: "https://cdn.example/clx" } }
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Connect and import catalog",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.getByText(/Settings changed. Update the preview/)).toBeTruthy();
  expect(api.preview).toHaveBeenCalledTimes(1);
  api.preview.mockResolvedValue({
    ...response,
    mapping: { ...response.mapping, imageBaseUrl: "https://cdn.example/clx/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update preview" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Connect and import catalog",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Connect and import catalog" })
  );
  await waitFor(() =>
    expect(api.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        storeUrl: "https://api.example/products",
        api: expect.objectContaining({
          imageBaseUrl: "https://cdn.example/clx/",
          notes: "",
        }),
      })
    )
  );
});

it("keeps source errors beside the actions, not inside the scroll body", async () => {
  api.preview.mockRejectedValue(
    new Error("The API response is not valid JSON.")
  );
  open();
  fireEvent.change(screen.getByLabelText("API endpoint"), {
    target: { value: "https://api.example/products" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview products" }));
  const alert = await screen.findByRole("alert");
  expect(alert.closest("[data-dialog-actions]")).toBeTruthy();
  expect(alert.closest("[data-dialog-scroll]")).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Connect and import catalog",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
