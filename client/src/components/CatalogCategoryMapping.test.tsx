// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  save: vi.fn(),
  callbacks: null as any,
  revision: 1,
}));
const id = "10000000-0000-4000-8000-000000000001";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      catalogCategories: { read: { invalidate: vi.fn() } },
      catalog: { overview: { invalidate: vi.fn() } },
    }),
    catalogCategories: {
      read: {
        useQuery: () => ({
          data: {
            revision: state.revision,
            settings: {
              categories: [
                {
                  id,
                  name: "Home",
                  audience: "Families",
                  useCases: "",
                  vocabulary: "",
                  cta: "",
                  avoid: "",
                },
              ],
              mappings: [],
            },
            sources: [],
            codes: [],
          },
        }),
      },
      save: {
        useMutation: (callbacks: any) => {
          state.callbacks = callbacks;
          return { mutate: state.save, isPending: false };
        },
      },
    },
  },
}));
import { CatalogCategoryMapping } from "./CatalogCategoryMapping";
afterEach(() => {
  cleanup();
  state.revision = 1;
  state.save.mockReset();
});
it("requires review and preserves manual edits with their original revision after a conflict", () => {
  state.save.mockImplementation(() =>
    state.callbacks.onError(new Error("Mappings changed"))
  );
  const view = render(<CatalogCategoryMapping organizationId={1} canEdit />);
  fireEvent.click(screen.getByText("Category mapping and category-aware copy"));
  fireEvent.click(screen.getByText("Home", { selector: "summary" }));
  fireEvent.change(screen.getByLabelText("Home audience"), {
    target: { value: "My reviewed audience" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm and save mappings",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and save mappings" })
  );
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: 1, revision: 1, confirm: true })
  );
  expect(screen.getByRole("alert").textContent).toContain("Your edits remain");
  state.revision = 2;
  view.rerender(<CatalogCategoryMapping organizationId={1} canEdit />);
  expect(
    (screen.getByLabelText("Home audience") as HTMLTextAreaElement).value
  ).toBe("My reviewed audience");
  fireEvent.click(
    screen.getByRole("button", { name: "Discard mapping edits" })
  );
  expect(
    (screen.getByLabelText("Home audience") as HTMLTextAreaElement).value
  ).toBe("Families");
});
