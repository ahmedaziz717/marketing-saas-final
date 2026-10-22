// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ picture: vi.fn(() => ({})) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channels: {
      connections: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "meta-1",
                name: "Meta store",
                channel: "meta_ads",
                status: "connected",
                details: {},
              },
            ],
          },
        }),
      },
      accountImage: { useQuery: api.picture },
    },
    googleAds: {
      connections: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "google-1",
                name: "Google store",
                channel: "google_ads",
                status: "connected",
                details: {},
              },
            ],
          },
        }),
      },
    },
  },
}));
import { WorkflowConnectionInput } from "./WorkflowConnectionInput";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("selects a Google account without looking up its photo in Meta connections", () => {
  const change = vi.fn();
  render(
    <WorkflowConnectionInput
      organizationId={3}
      title="Advertising account"
      channel="google_ads"
      value=""
      onChange={change}
    />
  );
  fireEvent.click(screen.getByRole("radio", { name: "Google store" }));
  expect(change).toHaveBeenCalledWith("google-1");
  expect(api.picture).not.toHaveBeenCalled();
});
it("continues resolving photos for Meta accounts", () => {
  render(
    <WorkflowConnectionInput
      organizationId={3}
      title="Advertising account"
      channel="meta_ads"
      value="meta-1"
      onChange={() => {}}
    />
  );
  expect(api.picture).toHaveBeenCalledWith(
    { organizationId: 3, id: "meta-1" },
    expect.any(Object)
  );
});
