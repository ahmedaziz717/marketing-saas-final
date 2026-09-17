// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "owner", mutate: vi.fn() }));
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
  fireEvent.click(screen.getByRole("button", { name: "Billing & usage" }));
  expect(screen.getByText("Planned")).toBeTruthy();
  expect(screen.getByText(/not connected yet/)).toBeTruthy();
});
