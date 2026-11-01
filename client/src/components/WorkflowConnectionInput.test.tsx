// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  picture: vi.fn(() => ({})),
  connections: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channels: {
      connections: {
        useQuery: (input: unknown) => {
          api.connections(input);
          return {
            data: {
              items: [
                {
                  id: "meta-1",
                  name: "Meta store",
                  channel: "meta_ads",
                  status: "connected",
                  details: {},
                },
                {
                  id: "google-1",
                  name: "Google store",
                  channel: "google_ads",
                  status: "connected",
                  details: {},
                },
                {
                  id: "expired",
                  name: "Expired store",
                  channel: "meta_ads",
                  status: "connected",
                  expired: true,
                  details: {},
                },
                {
                  id: "disconnected",
                  name: "Disconnected store",
                  channel: "google_ads",
                  status: "disconnected",
                  details: {},
                },
              ],
            },
          };
        },
      },
      accountImage: { useQuery: api.picture },
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
  expect(api.connections).toHaveBeenCalledWith({
    organizationId: 3,
    includeGoogle: true,
  });
  expect(screen.queryByRole("radio", { name: "Meta store" })).toBeNull();
  expect(
    screen.queryByRole("radio", { name: "Disconnected store" })
  ).toBeNull();
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
  expect(screen.queryByRole("radio", { name: "Expired store" })).toBeNull();
  expect(screen.queryByRole("radio", { name: "Google store" })).toBeNull();
  expect(api.picture).toHaveBeenCalledWith(
    { organizationId: 3, id: "meta-1" },
    expect.any(Object)
  );
});
