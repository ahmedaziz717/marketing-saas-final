// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
  result: {} as any,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    googleAds: {
      campaigns: {
        assetMetrics: {
          useQuery: (...args: unknown[]) => {
            f.query(...args);
            return f.result;
          },
        },
      },
    },
  },
}));
import {
  GoogleAssetMetrics,
  GoogleAssetMetricsProvider,
} from "./GoogleAssetMetrics";
const name = "customers/222/assetGroupAssets/22~33~MARKETING_IMAGE";
const props = {
  organizationId: 3,
  connectionId: "owned",
  campaignId: "11",
  assetGroupId: "22",
};
function Picker() {
  return (
    <>
      <button>Select existing image</button>
      <GoogleAssetMetrics resourceName={name} />
    </>
  );
}
const renderPicker = () =>
  render(
    <GoogleAssetMetricsProvider {...props}>
      <Picker />
    </GoogleAssetMetricsProvider>
  );
afterEach(cleanup);
beforeEach(() => {
  f.query.mockReset();
  f.refetch.mockReset();
  f.result = {
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: f.refetch,
    data: {
      status: "available",
      since: "2026-09-26",
      until: "2026-10-25",
      timezone: "America/Chicago",
      days: 30,
      rows: [
        {
          resourceName: name,
          impressions: 100,
          clicks: 5,
          ctr: 0.05,
          conversions: 1.5,
          conversionRate: 0.15,
        },
      ],
    },
  };
});
it("shows exact association metrics with fractional conversions and interaction-based rate", () => {
  renderPicker();
  const metrics = within(screen.getByLabelText("Asset performance"));
  expect(metrics.getByText("100")).toBeTruthy();
  expect(metrics.getByText("5%")).toBeTruthy();
  expect(metrics.getByText("1.5")).toBeTruthy();
  expect(metrics.getByText("15%")).toBeTruthy();
  expect(screen.getByText("America/Chicago")).toBeTruthy();
  expect(screen.getByText(/2026-09-26/)).toBeTruthy();
  expect(screen.getByText(/ratios are directional/)).toBeTruthy();
});
it("refreshes and changes period without changing asset selections", () => {
  renderPicker();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "7" } });
  expect(f.query.mock.lastCall?.[0]).toMatchObject({ ...props, days: 7 });
  fireEvent.click(screen.getByRole("button", { name: "Refresh performance" }));
  expect(f.refetch).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Select existing image" })
  ).toBeTruthy();
});
it("keeps inventory available on report error and never presents stale data as zero", () => {
  f.result.isError = true;
  renderPicker();
  expect(
    screen.getByRole("button", { name: "Select existing image" })
  ).toBeTruthy();
  expect(screen.getByText("Performance unavailable")).toBeTruthy();
  expect(screen.queryByText("100")).toBeNull();
});
it("distinguishes no reported activity from zero values and unavailable", () => {
  f.result.data.rows = [];
  const view = renderPicker();
  expect(screen.getByText("No reported activity in this period")).toBeTruthy();
  f.result.data = {
    ...f.result.data,
    rows: [
      {
        resourceName: name,
        impressions: 0,
        clicks: 0,
        ctr: null,
        conversions: 0,
        conversionRate: null,
      },
    ],
  };
  view.rerender(
    <GoogleAssetMetricsProvider {...props}>
      <Picker />
    </GoogleAssetMetricsProvider>
  );
  expect(screen.getAllByText("0")).toHaveLength(2);
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.queryByText("0%")).toBeNull();
});
it("uses changed account and group query keys and does not borrow another association", () => {
  f.result.data.rows[0].resourceName =
    "customers/other/assetGroupAssets/other~33~MARKETING_IMAGE";
  const view = renderPicker();
  expect(screen.getByText("No reported activity in this period")).toBeTruthy();
  view.rerender(
    <GoogleAssetMetricsProvider
      {...props}
      connectionId="other"
      campaignId="44"
      assetGroupId="55"
    >
      <Picker />
    </GoogleAssetMetricsProvider>
  );
  expect(f.query.mock.lastCall?.[0]).toMatchObject({
    connectionId: "other",
    campaignId: "44",
    assetGroupId: "55",
  });
  expect(f.query.mock.lastCall?.[1]).not.toHaveProperty("placeholderData");
});
it("shows loading without blocking selection and suppresses duplicate refreshes", () => {
  f.result.isPending = true;
  f.result.isFetching = true;
  f.result.data = undefined;
  renderPicker();
  expect(screen.getByText("Loading performance…")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Refresh performance" })
  ).toHaveProperty("disabled", true);
  expect(
    screen.getByRole("button", { name: "Select existing image" })
  ).toHaveProperty("disabled", false);
});
