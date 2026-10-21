// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { defaultInsightConfig } from "@shared/insights";
const state = vi.hoisted(() => ({
  save: vi.fn(),
  run: vi.fn(),
  options: {
    canEdit: true,
    emailConfigured: true,
    connections: [
      {
        id: "35a96289-711f-419a-b6aa-45ff38e5cd01",
        name: "Example Ads",
        channel: "meta_ads",
        status: "connected",
        currency: "USD",
        timezone: "America/New_York",
      },
    ],
    recipients: [
      { userId: 1, name: "Report owner", email: "owner@example.test" },
    ],
  },
  layouts: [] as any[],
  report: null as any,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    organizationId: 1,
    membership: { userId: 1, role: "owner" },
  }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/components/configurator/studioNavigation", () => ({
  useStudioNavigation: () => ({ current: null }),
  scrollStudioChoices: () => {},
}));
vi.mock("@/components/InsightReport", () => ({
  InsightReport: () => <div>Report output</div>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channels: { accountImage: { useQuery: () => ({ data: {} }) } },
    useUtils: () => ({
      insights: {
        list: { invalidate: vi.fn() },
        runs: { invalidate: vi.fn() },
        dashboardData: { invalidate: vi.fn() },
      },
    }),
    insights: {
      options: { useQuery: () => ({ data: state.options }) },
      get: { useQuery: () => ({ data: state.report }) },
      save: {
        useMutation: () => ({ mutateAsync: state.save, isPending: false }),
      },
      run: {
        useMutation: () => ({ mutateAsync: state.run, isPending: false }),
      },
      runs: { useQuery: () => ({ data: [] }) },
      runDetail: { useQuery: () => ({ data: undefined }) },
    },
  },
}));
import InsightsStudioPage from "./InsightsStudioPage";
beforeEach(() => {
  state.options.canEdit = true;
  state.report = null;
  state.save.mockReset().mockImplementation(async x => ({
    ...x,
    id: "972349b0-04a3-454d-a052-21e3c237fb30",
    revision: 1,
  }));
  state.run
    .mockReset()
    .mockResolvedValue({ id: "363ffaae-ed97-4bcc-b339-c13d6b92b3ef" });
});
afterEach(cleanup);
function setup(path = "/app/analytics/studio") {
  const loc = memoryLocation({ path });
  render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      <InsightsStudioPage />
    </Router>
  );
}
it("keeps report direction in section categories and submits the full setup once at review", async () => {
  setup();
  expect(
    screen
      .getByRole("navigation", { name: "Insights Studio sections" })
      .querySelectorAll("button")
  ).toHaveLength(5);
  changeField(screen.getByLabelText("Report name"), {
    target: { value: "Weekly team report" },
  });
  clickJourney(
    screen.getByRole("button", { name: "Open Accounts & dates category" })
  );
  clickJourney(screen.getByRole("button", { name: /Example Ads/ }));
  clickJourney(screen.getByRole("button", { name: /^Schedule & delivery/ }));
  clickJourney(screen.getByLabelText(/Run this report automatically/));
  changeField(screen.getByRole("radiogroup", { name: "Frequency" }), {
    target: { value: "monthly" },
  });
  changeField(screen.getByLabelText(/Day of month/), {
    target: { value: "15" },
  });
  clickJourney(
    screen.getByRole("button", { name: "Open Notifications & PDF category" })
  );
  clickJourney(screen.getByLabelText(/Email scheduled report results/));
  clickJourney(screen.getByRole("button", { name: /^Review & run/ }));
  clickJourney(screen.getByRole("button", { name: "Save & run report" }));
  await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  const input = state.save.mock.calls[0][0];
  expect(input.config.name).toBe("Weekly team report");
  expect(input.config.connectionIds).toEqual([state.options.connections[0].id]);
  expect(input.config.schedule).toMatchObject({
    enabled: true,
    frequency: "monthly",
    monthDay: 15,
  });
  expect(input.config.delivery).toMatchObject({
    email: true,
    recipientUserIds: [1],
    attachPdf: true,
  });
  expect(state.run.mock.calls[0][0].notify).toBe(false);
});
it("requires explicit selection before sending a manual-run email", async () => {
  const c = defaultInsightConfig();
  c.connectionIds = [state.options.connections[0].id];
  c.delivery = {
    email: true,
    recipientUserIds: [1],
    attachPdf: false,
    notifyFailure: true,
  };
  state.report = {
    id: "972349b0-04a3-454d-a052-21e3c237fb30",
    revision: 4,
    config: c,
  };
  setup(`/app/analytics/studio?id=${state.report.id}`);
  clickJourney(screen.getByRole("button", { name: /^Review & run/ }));
  clickJourney(screen.getByLabelText(/Also notify selected recipients/));
  clickJourney(screen.getByRole("button", { name: "Save & run report" }));
  await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  expect(state.run.mock.calls[0][0].notify).toBe(true);
});
it("shows a clear validation message and blocks execution before sources are selected", () => {
  setup();
  clickJourney(screen.getByRole("button", { name: /^Review & run/ }));
  expect(screen.getByText(/Select at least one account or Page/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Save & run report",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(state.run).not.toHaveBeenCalled();
});

// Business-flow checks accept optional discovery prompts; StudioJourney tests cover the prompt itself.
function clickJourney(element: Element) {
  fireEvent.click(element);
  const keep = screen.queryByRole("button", {
    name: /^(Keep defaults & continue|Continue with current choices)$/,
  });
  if (keep) fireEvent.click(keep);
}

it("opens the Google Ads preset, separates Google metrics, and saves the chosen account", async () => {
  const google = {
    ...state.options.connections[0],
    id: "45a96289-711f-419a-b6aa-45ff38e5cd02",
    name: "Example Google Ads",
    channel: "google_ads",
  };
  state.options.connections.push(google);
  try {
    setup("/app/analytics/studio?channel=google_ads");
    clickJourney(screen.getByRole("button", { name: /Example Google Ads/ }));
    expect(
      screen.queryByRole("button", { name: /Meta advertising.*Example Ads/ })
    ).toBeNull();
    clickJourney(screen.getByRole("button", { name: /^Report setup/ }));
    clickJourney(
      screen.getByRole("button", { name: "Open Key metrics category" })
    );
    expect(screen.getByRole("button", { name: /^Clicks / })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Link clicks / })).toBeNull();
    clickJourney(screen.getByRole("button", { name: /^Review & run/ }));
    clickJourney(screen.getByRole("button", { name: "Save & run report" }));
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][0].config).toMatchObject({
      name: "Google Ads performance",
      connectionIds: [google.id],
    });
    expect(state.save.mock.calls[0][0].config.metrics).toContain("conversions");
    expect(state.save.mock.calls[0][0].config.metrics).not.toContain(
      "linkClicks"
    );
  } finally {
    state.options.connections.pop();
  }
});
