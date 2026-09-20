// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  analyticsFilters,
  analyticsHref,
  analyticsViewForRoute,
} from "@/lib/analyticsNavigation";
const requests = vi.hoisted(() => ({ current: [] as any[] }));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1 }),
}));
vi.mock("@/components/ChannelConnections", () => ({
  channelInput: "test-input",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueries: ({ queries }: any) => {
    if (!queries[0] || queries[0].enabled === undefined)
      requests.current = queries;
    return queries.map(() => ({}));
  },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ client: { channels: { report: { query: vi.fn() } } } }),
    channels: {
      connections: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "page1",
                name: "Test Page",
                channel: "facebook",
                status: "connected",
              },
              {
                id: "ads1",
                name: "Test Ads",
                channel: "meta_ads",
                status: "connected",
              },
            ],
          },
        }),
      },
    },
  },
}));
import AnalyticsPage from "./AnalyticsPage";
afterEach(cleanup);
function setup(path = "/app/analytics") {
  const router = memoryLocation({ path, record: true });
  render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <AnalyticsPage />
    </Router>
  );
  return router;
}
it("overall view exposes channel/account filters without duplicating section navigation", () => {
  setup();
  expect(
    screen.getByRole("heading", { name: "Analytics overview" })
  ).toBeTruthy();
  expect(screen.getByLabelText("Analytics channel")).toBeTruthy();
  expect(screen.getByRole("option", { name: /Test Page/ })).toBeTruthy();
  expect(screen.getByRole("option", { name: /Test Ads/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Advertising" })).toBeNull();
  expect(requests.current.map(q => q.queryKey[2])).toEqual(["page1", "ads1"]);
});
it("advertising view requests only ad accounts and ignores incompatible saved selections", () => {
  setup("/app/analytics/advertising?channel=facebook&account=page1");
  expect(
    screen.getByRole("heading", { name: "Advertising analytics" })
  ).toBeTruthy();
  expect(screen.queryByRole("option", { name: /Test Page/ })).toBeNull();
  expect(requests.current.map(q => q.queryKey[2])).toEqual(["ads1"]);
});
it("responds to route changes and history navigation instead of keeping a stale initial tab", () => {
  const router = setup("/app/analytics?tab=social");
  expect(requests.current.map(q => q.queryKey[2])).toEqual(["page1"]);
  act(() => router.navigate("/app/analytics/advertising"));
  expect(
    screen.getByRole("heading", { name: "Advertising analytics" })
  ).toBeTruthy();
  expect(requests.current.map(q => q.queryKey[2])).toEqual(["ads1"]);
  act(() => router.navigate("/app/analytics?tab=social"));
  expect(
    screen.getByRole("heading", { name: "Social media analytics" })
  ).toBeTruthy();
});
it("channel filtering resets account and updates the shareable URL", () => {
  const router = setup("/app/analytics?account=ads1");
  fireEvent.change(screen.getByLabelText("Analytics channel"), {
    target: { value: "facebook" },
  });
  expect(router.history?.at(-1)).toBe("/app/analytics?channel=facebook");
  expect(requests.current.map(q => q.queryKey[2])).toEqual(["page1"]);
});
it("restores date/compare from URL and applies changed dates explicitly", () => {
  const router = setup(
    "/app/analytics?since=2026-09-01&until=2026-09-20&compare=1"
  );
  expect(
    (screen.getByLabelText("Analytics start date") as HTMLInputElement).value
  ).toBe("2026-09-01");
  expect(
    (screen.getByLabelText("Compare previous period") as HTMLInputElement)
      .checked
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Analytics start date"), {
    target: { value: "2026-09-05" },
  });
  expect(requests.current[0].queryKey[3].since).toBe("2026-09-01");
  fireEvent.click(screen.getByRole("button", { name: "Apply date range" }));
  expect(router.history?.at(-1)).toContain("since=2026-09-05");
  expect(requests.current[0].queryKey[3].since).toBe("2026-09-05");
});
it("validates untrusted deep-link dates and recognizes canonical paths", () => {
  expect(
    analyticsViewForRoute("/app/analytics/social", "tab=advertising")
  ).toBe("social");
  const filters = analyticsFilters(
    "since=not-date&until=2026-09-01",
    Date.parse("2026-09-20T12:00:00Z")
  );
  expect(filters.range).toEqual({ since: "2026-08-22", until: "2026-09-20" });
  expect(
    analyticsHref(
      "overview",
      "tab=social&account=private-account&since=2026-09-01&until=2026-09-20"
    )
  ).toBe("/app/analytics?since=2026-09-01&until=2026-09-20");
});
