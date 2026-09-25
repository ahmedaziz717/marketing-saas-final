// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "owner",
  platformRole: "user",
  mutate: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: state.platformRole }, loading: false }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    organizationId: 1,
    organization: { name: "Demo" },
    membership: { userId: 1, role: state.role },
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workspace: {
        members: { invalidate: vi.fn() },
        invites: { invalidate: vi.fn() },
      },
    }),
    billing: {
      summary: { useQuery: () => ({ data: null, isLoading: false }) },
      selectPreviewPlan: {
        useMutation: () => ({ mutate: state.mutate, isPending: false }),
      },
    },
    workspace: {
      members: {
        useQuery: () => ({
          data: [
            {
              membership: { id: 1, userId: 1, role: "owner" },
              user: { name: "Owner", email: "owner@example.test" },
            },
            {
              membership: { id: 2, userId: 2, role: "creator" },
              user: { name: "Creator", email: "creator@example.test" },
            },
          ],
        }),
      },
      invites: { useQuery: () => ({ data: [] }) },
      createInvite: { useMutation: () => ({ mutate: state.mutate }) },
      updateMember: { useMutation: () => ({ mutate: state.mutate }) },
      manageInvite: { useMutation: () => ({ mutate: state.mutate }) },
    },
  },
}));
import SettingsPage from "./SettingsPage";
afterEach(() => {
  cleanup();
  state.role = "owner";
  state.platformRole = "user";
  state.mutate.mockClear();
});
it("requires confirmation before removing a teammate and protects the owner", () => {
  render(<SettingsPage />);
  expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(state.mutate).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: 1, memberId: 2, remove: true })
  );
});
it("offers email-app and link sharing without claiming automated delivery", () => {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Invite teammate" }));
  expect(screen.getByRole("radio", { name: "Email app" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Copy link" })).toBeTruthy();
  expect(
    screen.getByText(/Automatic email delivery will be connected later/)
  ).toBeTruthy();
});
it("hides administrative actions from creators and labels unimplemented settings", () => {
  state.role = "creator";
  render(<SettingsPage />);
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Invite teammate" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Billing & Usage" }));
  expect(
    screen.getByText(/Only workspace owners and administrators/)
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Security" }));
  expect(screen.getByText("Planned")).toBeTruthy();
  expect(screen.getByText(/not connected yet/)).toBeTruthy();
});

it("keeps platform website administration out of ordinary workspace-owner settings", () => {
  render(<SettingsPage />);
  expect(document.querySelector('a[href="/app/platform/website"]')).toBeNull();
});
it("links the global platform administrator to public website details and requests", () => {
  state.platformRole = "admin";
  render(<SettingsPage />);
  expect(
    document.querySelector('a[href="/app/platform/website"]')
  ).toBeTruthy();
});
