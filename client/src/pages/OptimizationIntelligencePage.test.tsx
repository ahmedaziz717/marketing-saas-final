// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  enabled: true,
  role: "owner",
  request: null as any,
  export: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: state.role } }),
}));
vi.mock("@/components/ChannelConnections", () => ({
  channelInput: "test-input",
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channels: {
      connections: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "meta",
                name: "Authorized Meta",
                channel: "meta_ads",
                status: "connected",
              },
              {
                id: "social",
                name: "Social Page",
                channel: "facebook",
                status: "connected",
              },
            ],
          },
        }),
      },
    },
    optimization: {
      availability: { useQuery: () => ({ data: { enabled: state.enabled } }) },
      progress: { useQuery: () => ({ data: null, refetch: vi.fn() }) },
      analyze: {
        useQuery: (input: any, options: any) => {
          state.request = input;
          return {
            refetch: vi.fn(),
            data: options.enabled
              ? {
                  account: { currency: "USD", timezone: "UTC" },
                  summary: {
                    adCount: 1,
                    samples: 2,
                    evidenceStrength: "limited",
                    attribution: null,
                  },
                  coverage: {
                    incomplete: true,
                    status: "queued",
                    truncated: false,
                  },
                  groups: [
                    {
                      labels: ["direct"],
                      spend: 10,
                      impressions: 100,
                      clicks: 2,
                      purchases: null,
                      purchaseValue: null,
                      ctr: 2,
                      cpc: 5,
                      cpa: null,
                      roas: null,
                      adCount: 1,
                      evidenceStrength: "limited",
                    },
                  ],
                  sourceAds: [],
                  caveats: [
                    "Observational association does not establish causality.",
                  ],
                }
              : undefined,
          };
        },
      },
      sync: { useMutation: () => ({ mutate: state.sync }) },
      resume: { useMutation: () => ({ mutate: vi.fn() }) },
      classify: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      override: { useMutation: () => ({ mutate: vi.fn() }) },
      export: { useMutation: () => ({ mutate: state.export }) },
    },
  },
}));
import Page from "./OptimizationIntelligencePage";
afterEach(cleanup);
beforeEach(() => {
  state.enabled = true;
  state.role = "owner";
  vi.clearAllMocks();
});
it("keeps rollout and read-only roles gated and lists only connected ad accounts", () => {
  state.enabled = false;
  const view = render(<Page />);
  expect(screen.getByText(/not in the optimization rollout/)).toBeTruthy();
  expect(screen.queryByLabelText("Connected Meta ad account")).toBeNull();
  state.enabled = true;
  state.role = "viewer";
  view.rerender(<Page />);
  expect(screen.queryByRole("option", { name: "Social Page" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Connected Meta ad account"), {
    target: { value: "meta" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Import 2026 history",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Classify imported ads",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
it("keeps unavailable metrics explicit, combines filters, exports the selected query and clears incompatible grains", () => {
  render(<Page />);
  fireEvent.change(screen.getByLabelText("Connected Meta ad account"), {
    target: { value: "meta" },
  });
  expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  expect(screen.getByText(/Partial evidence/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Add dimension"), {
    target: { value: "theme" },
  });
  fireEvent.change(screen.getByLabelText("Filter values"), {
    target: { value: "direct,educational" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  expect(state.request.query.dimensions).toEqual(["messaging_style", "theme"]);
  expect(state.request.query.filters).toEqual([
    { dimension: "messaging_style", values: ["direct", "educational"] },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Export report CSV" }));
  expect(state.export).toHaveBeenCalledWith(state.request);
  fireEvent.change(screen.getByLabelText("Granularity"), {
    target: { value: "hourly" },
  });
  fireEvent.change(screen.getByLabelText("Add dimension"), {
    target: { value: "hour" },
  });
  fireEvent.change(screen.getByLabelText("Granularity"), {
    target: { value: "daily" },
  });
  expect(state.request.query.dimensions).not.toContain("hour");
});
