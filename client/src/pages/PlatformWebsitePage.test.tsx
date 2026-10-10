// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "user",
  query: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  profile: {
    available: true,
    revision: 2,
    profile: {
      operatorName: "Example operator",
      supportEmail: "support@example.test",
      privacyEmail: "privacy@example.test",
      operatorWebsite: "",
      businessAddress: "",
      disclosuresApproved: true,
    },
  },
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: state.role }, loading: false }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: any) => children,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      publicWebsiteAdmin: {
        profile: { invalidate: vi.fn() },
        requests: { invalidate: vi.fn() },
      },
    }),
    publicWebsiteAdmin: {
      profile: {
        useQuery: () => {
          state.query();
          return { data: state.profile };
        },
      },
      requests: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "fc224537-5fa0-4f37-888c-7b5b7a9d012b",
                name: "Test requester",
                email: "requester@example.test",
                topic: "deletion",
                workspace: "Demo",
                message: "Please remove my uploaded image",
                state: "received",
                createdAtMs: 1,
                updatedAtMs: 2,
                resolutionNote: null,
              },
            ],
            nextBefore: null,
          },
          refetch: vi.fn(),
        }),
      },
      saveProfile: {
        useMutation: () => ({ mutate: state.save, isPending: false }),
      },
      updateRequest: {
        useMutation: () => ({ mutate: state.update, isPending: false }),
      },
    },
  },
}));
import PlatformWebsitePage from "./PlatformWebsitePage";
afterEach(() => {
  cleanup();
  state.role = "user";
  vi.clearAllMocks();
});
it("does not fetch public inbox or identity for a customer workspace owner", () => {
  render(<PlatformWebsitePage />);
  expect(
    screen.getByText("Platform administrator access required")
  ).toBeTruthy();
  expect(state.query).not.toHaveBeenCalled();
  expect(screen.queryByText("Test requester")).toBeNull();
});
it("resets disclosure confirmation when operator details change", () => {
  state.role = "admin";
  render(<PlatformWebsitePage />);
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  fireEvent.change(screen.getByLabelText("Legal operating company"), {
    target: { value: "Updated operator" },
  });
  expect(checkbox.checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Save public details" }));
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 2,
      profile: expect.objectContaining({
        operatorName: "Updated operator",
        disclosuresApproved: false,
      }),
    })
  );
});
it("keeps request handling distinct from destructive data deletion", () => {
  state.role = "admin";
  render(<PlatformWebsitePage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Public requests inbox" })
  );
  expect(
    screen.getByText(/Closing a request does not delete any account/)
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "requester@example.test" })
      .getAttribute("href")
  ).toBe("mailto:requester@example.test");
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "under_review" },
  });
  fireEvent.change(screen.getByLabelText("Internal outcome / next step"), {
    target: { value: "Awaiting verified account authority" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save status" }));
  expect(state.update).toHaveBeenCalledWith(
    expect.objectContaining({ state: "under_review", updatedAtMs: 2 })
  );
  expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
});
