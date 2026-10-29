// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  organizationId: 1,
  role: "owner",
  search: "",
  query: {} as any,
  selection: {} as any,
  begin: vi.fn(),
  connect: vi.fn(),
  cancel: vi.fn(),
  verify: vi.fn(),
  disconnect: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    organizationId: fixture.organizationId,
    membership: { role: fixture.role },
  }),
}));
vi.mock("wouter", async importOriginal => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useSearch: () => fixture.search,
  useLocation: () => ["/app/settings/integrations", fixture.navigate],
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      googleAds: { connections: { invalidate: fixture.invalidate } },
    }),
    googleAds: {
      connections: { useQuery: () => fixture.query },
      selection: { useQuery: () => fixture.selection },
      beginOAuth: {
        useMutation: () => ({ mutate: fixture.begin, isPending: false }),
      },
      connect: {
        useMutation: () => ({ mutate: fixture.connect, isPending: false }),
      },
      cancelSelection: {
        useMutation: () => ({ mutate: fixture.cancel, isPending: false }),
      },
      verify: {
        useMutation: () => ({ mutate: fixture.verify, isPending: false }),
      },
      disconnect: {
        useMutation: () => ({ mutate: fixture.disconnect, isPending: false }),
      },
    },
  },
}));
import {
  GoogleAdsConnectionCard,
  GoogleAdsConnectionSelection,
} from "./GoogleAdsConnections";
const selectionId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  fixture.organizationId = 1;
  fixture.role = "owner";
  fixture.search = "";
  fixture.query = {
    data: { items: [], oauthConfigured: true },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };
  fixture.selection = {
    data: {
      accounts: [
        {
          id: "2222222222",
          name: "CLX Gaming",
          currency: "USD",
          timezone: "UTC",
          testAccount: false,
          loginCustomerId: "1111111111",
        },
        {
          id: "3333333333",
          name: "Other brand",
          currency: "USD",
          timezone: "UTC",
          testAccount: true,
        },
      ],
      warnings: [],
    },
    isLoading: false,
    error: null,
  };
});
afterEach(cleanup);
it("starts Google's consent flow for the current workspace", () => {
  render(<GoogleAdsConnectionCard />);
  fireEvent.click(screen.getByRole("button", { name: "Connect with Google" }));
  expect(fixture.begin).toHaveBeenCalledWith({ organizationId: 1 });
});
it("explains unavailable setup and disables connection until configured", () => {
  fixture.query.data.oauthConfigured = false;
  render(<GoogleAdsConnectionCard />);
  expect(
    (
      screen.getByRole("button", {
        name: "Connect with Google",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.getByText(/setup is pending/)).toBeTruthy();
  expect(fixture.begin).not.toHaveBeenCalled();
});
it("does not offer account linking to a viewer", () => {
  fixture.role = "viewer";
  render(<GoogleAdsConnectionCard />);
  expect(
    (
      screen.getByRole("button", {
        name: "Connect with Google",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.getByText(/owner or administrator/)).toBeTruthy();
});
it("searches authorized accounts and submits only the explicit selections", () => {
  fixture.search = "googleSelection=" + selectionId;
  render(<GoogleAdsConnectionSelection />);
  expect(
    (
      screen.getByRole("button", {
        name: "Connect selected",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search Google Ads accounts" }),
    { target: { value: "CLX" } }
  );
  expect(screen.queryByText("Other brand")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: /CLX Gaming/ }));
  fireEvent.click(screen.getByRole("button", { name: "Connect selected (1)" }));
  expect(fixture.connect).toHaveBeenCalledWith({
    organizationId: 1,
    discoveryId: selectionId,
    accountIds: ["2222222222"],
  });
  expect(screen.getByText(/Via manager 111-111-1111/)).toBeTruthy();
});
it("does not invent a successful connection when no Ads accounts are available", () => {
  fixture.search = "googleSelection=" + selectionId;
  fixture.selection.data.accounts = [];
  render(<GoogleAdsConnectionSelection />);
  expect(screen.getByText(/No active advertising accounts/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Connect selected",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fixture.cancel).toHaveBeenCalledWith({
    organizationId: 1,
    id: selectionId,
  });
});
it("shows readable consent errors without reflecting raw callback input", () => {
  fixture.search = "googleError=scope";
  const { rerender } = render(<GoogleAdsConnectionSelection />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Google Ads access was not granted"
  );
  fixture.search = "googleError=private-token-from-query";
  rerender(<GoogleAdsConnectionSelection />);
  expect(screen.getByRole("alert").textContent).not.toContain("private-token");
  fixture.search = "googleError=__proto__";
  rerender(<GoogleAdsConnectionSelection />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Google could not complete"
  );
});
it("clears selected accounts when the workspace changes", () => {
  fixture.search = "googleSelection=" + selectionId;
  const { rerender } = render(<GoogleAdsConnectionSelection />);
  fireEvent.click(screen.getByRole("checkbox", { name: /CLX Gaming/ }));
  fixture.organizationId = 2;
  fixture.selection.error = {
    message: "Selection belongs to another workspace",
  };
  fixture.selection.data = undefined;
  rerender(<GoogleAdsConnectionSelection />);
  expect(screen.getByRole("alert").textContent).toContain("another workspace");
  expect(
    (
      screen.getByRole("button", {
        name: "Connect selected",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(fixture.connect).not.toHaveBeenCalled();
});
it("requires a visible confirmation before disconnecting one account", () => {
  fixture.query.data.items = [
    {
      id: selectionId,
      name: "CLX Gaming",
      accountId: "2222222222",
      status: "connected",
      needsReconnect: false,
      details: {
        currency: "USD",
        timezone: "UTC",
        warnings: [],
        google: { testAccount: false },
      },
    },
  ];
  render(<GoogleAdsConnectionCard />);
  fireEvent.click(screen.getByRole("button", { name: "Manage connections" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
  expect(fixture.disconnect).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("alert").textContent).toContain(
    "Disconnect CLX Gaming"
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm disconnect" })
  );
  expect(fixture.disconnect).toHaveBeenCalledWith({
    organizationId: 1,
    id: selectionId,
    confirm: true,
  });
});
