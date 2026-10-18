// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
const state = vi.hoisted(() => ({
  role: "owner",
  pending: false,
  total: 125,
  mutate: vi.fn(),
  options: null as any,
  invalidate: vi.fn(),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/components/CatalogSources", () => ({
  CatalogSources: () => <div>Catalog sources</div>,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: state.role } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      catalog: { overview: { invalidate: state.invalidate } },
      activity: { list: { invalidate: state.invalidate } },
    }),
    catalog: {
      overview: {
        useQuery: (input: any) => ({
          data: {
            products: [1, 2].map(id => ({
              id: id + input.offset,
              name: `Item ${id + input.offset}`,
              category: "Shoes",
              recordType: input.kind === "services" ? "service" : "standalone",
              status: "pending",
              specifications: {},
              images: [],
              variants: [],
              productUrl: "https://example.test",
            })),
            categories: ["Shoes"],
            total: state.total,
            hasMore: input.offset === 0,
          },
          isFetching: false,
        }),
      },
      bulkReview: {
        useMutation: (options: any) => {
          state.options = options;
          return { mutate: state.mutate, isPending: state.pending };
        },
      },
      reviewProduct: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateProduct: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      cleanupNonProducts: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deleteProduct: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));
import CatalogPage from "./CatalogPage";
import { toast } from "sonner";
function setup(path = "/app/catalog") {
  const router = memoryLocation({ path, record: true });
  const view = render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <CatalogPage />
    </Router>
  );
  return { ...view, router };
}
const selectPage = () =>
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all on this page" })
  );
beforeEach(() => {
  state.role = "owner";
  state.pending = false;
  state.total = 125;
  vi.clearAllMocks();
});
afterEach(cleanup);

it("selects a page, supports partial selection, and sends only selected IDs", () => {
  setup();
  selectPage();
  expect(
    screen
      .getByRole("checkbox", { name: "Select Item 1" })
      .getAttribute("aria-checked")
  ).toBe("true");
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Item 2" }));
  expect(
    screen
      .getByRole("checkbox", { name: "Select all on this page" })
      .getAttribute("aria-checked")
  ).toBe("mixed");
  fireEvent.click(screen.getByRole("button", { name: "Approve 1" }));
  expect(state.mutate).toHaveBeenCalledWith({
    organizationId: 1,
    productIds: [1],
    decision: "approved",
  });
});

it("offers all matching entries across pages and resets selection when filters change", () => {
  setup();
  fireEvent.change(screen.getByRole("textbox", { name: "Search catalog" }), {
    target: { value: "shoe" },
  });
  selectPage();
  fireEvent.click(
    screen.getByRole("button", { name: "Select all 125 matching entries" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve 125" }));
  expect(state.mutate).toHaveBeenCalledWith({
    organizationId: 1,
    decision: "approved",
    filter: {
      search: "shoe",
      kind: "products",
      category: "all",
      status: "all",
    },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Search catalog" }), {
    target: { value: "hat" },
  });
  expect(screen.queryByRole("button", { name: /^Approve \d/ })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("0 selected");
});

it("clears selection across pagination and product/service tabs", () => {
  const { router } = setup();
  selectPage();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("status").textContent).toBe("0 selected");
  selectPage();
  fireEvent.click(
    screen.getByRole("button", { name: "Services & subscriptions" })
  );
  expect(router.history.at(-1)).toBe("/app/catalog?view=services");
  expect(screen.getByRole("status").textContent).toBe("0 selected");
  selectPage();
  fireEvent.click(
    screen.getByRole("button", { name: "Select all 125 matching entries" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve 125" }));
  expect(state.mutate.mock.calls.at(-1)?.[0].filter.kind).toBe("services");
});

it("clears selection after success and retains it after an error for retry", async () => {
  setup();
  selectPage();
  await act(async () => {
    state.options.onError(new Error("Retry this request"));
  });
  expect(screen.getByRole("button", { name: "Approve 2" })).toBeTruthy();
  expect(toast.error).toHaveBeenCalledWith("Retry this request");
  await act(async () => {
    await state.options.onSuccess({ updated: 2 }, { decision: "approved" });
  });
  expect(screen.getByRole("status").textContent).toBe("0 selected");
  expect(toast.success).toHaveBeenCalledWith("2 catalog entries approved");
});

it("disables selection during review and for roles without review access", () => {
  state.pending = true;
  setup();
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Select all on this page",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  cleanup();
  state.pending = false;
  state.role = "creator";
  setup();
  selectPage();
  expect(state.mutate).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("0 selected");
});
