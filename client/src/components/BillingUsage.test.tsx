// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BillingUsage } from "./BillingUsage";
import { PROPOSED_PLANS, USAGE_METERS } from "@shared/frameProduct";
const state = vi.hoisted(() => ({
  role: "owner",
  mutate: vi.fn(),
  query: {
    data: null as any,
    isLoading: false,
    isFetching: false,
    error: null as any,
    refetch: vi.fn(),
  },
  enabled: false,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 7, membership: { role: state.role } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ billing: { summary: { invalidate: vi.fn() } } }),
    billing: {
      summary: {
        useQuery: (_input: any, opts: any) => {
          state.enabled = opts.enabled;
          return state.query;
        },
      },
      selectPreviewPlan: {
        useMutation: () => ({ mutate: state.mutate, isPending: false }),
      },
    },
  },
}));
beforeEach(() => {
  state.role = "owner";
  state.mutate.mockReset();
  state.query.error = null;
  state.query.isLoading = false;
  state.query.data = {
    selectedPreviewPlanId: null,
    revision: 0,
    month: "2026-09",
    plans: PROPOSED_PLANS,
    usage: USAGE_METERS.map(m => ({
      ...m,
      quantity: m.id === "image_outputs" ? 12 : 0,
    })),
    inventory: { activeSeats: 2, catalogItems: 10, connectedAccounts: 1 },
    coverage: "Retained audit events; not billable credits.",
  };
});
afterEach(cleanup);
function tab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("tab", { name }));
}
it("shows real counters without a fabricated credit balance", () => {
  render(<BillingUsage />);
  expect(screen.getByText("12")).toBeTruthy();
  expect(screen.getByText("AI credits are not calculated yet")).toBeTruthy();
  expect(screen.getByText("Preview only - no charges")).toBeTruthy();
  expect(screen.queryByText(/credits remaining/i)).toBeNull();
});
it("does not fetch billing or show plan actions to a creator", () => {
  state.role = "creator";
  render(<BillingUsage />);
  expect(state.enabled).toBe(false);
  expect(
    screen.getByText(/Only workspace owners and administrators/)
  ).toBeTruthy();
  expect(screen.queryByRole("tab")).toBeNull();
});
it("requires an explicit preview confirmation without creating checkout", () => {
  render(<BillingUsage />);
  tab("Proposed plans");
  fireEvent.click(screen.getByRole("button", { name: "Preview Growth" }));
  expect(state.mutate).not.toHaveBeenCalled();
  expect(
    screen.getByText(/This saves a planning preference only/)
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save preview only" }));
  expect(state.mutate).toHaveBeenCalledWith({
    organizationId: 7,
    planId: "growth",
    revision: 0,
    previewOnly: true,
  });
  expect(
    screen.queryByRole("button", { name: /checkout|buy|upgrade/i })
  ).toBeNull();
});
it("states planned tools are not paid unlocks", () => {
  render(<BillingUsage />);
  tab("Feature access");
  expect(screen.getByText("AI Agent")).toBeTruthy();
  expect(
    screen.getAllByText("Planned - not a paid unlock").length
  ).toBeGreaterThan(5);
});
it("shows an error rather than silently displaying zeroes when usage fails", () => {
  state.query.error = new Error("Unavailable");
  state.query.data = null;
  render(<BillingUsage />);
  expect(screen.getByRole("alert").textContent).toContain(
    "could not be loaded"
  );
  expect(screen.queryByText("Generated images")).toBeNull();
});
