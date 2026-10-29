// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
const state = vi.hoisted(() => ({ userId: 1 }));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: state.userId } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workspace: {
      mine: {
        useQuery: () => ({
          data: [
            {
              organization: { id: 10, name: "First" },
              membership: { role: "owner" },
            },
            {
              organization: { id: 20, name: "Second" },
              membership: { role: "creator" },
            },
          ],
        }),
      },
    },
  },
}));
import { useWorkspace } from "./useWorkspace";
import { rememberWorkspace } from "@/lib/workspaceSelection";
beforeEach(() => {
  localStorage.clear();
  state.userId = 1;
});
it("opens a selected account with its own membership role", () => {
  rememberWorkspace(1, 20);
  const { result } = renderHook(useWorkspace);
  expect(result.current.organizationId).toBe(20);
  expect(result.current.membership?.role).toBe("creator");
});
it("ignores inaccessible accounts and another user's saved preference", () => {
  rememberWorkspace(1, 99);
  expect(renderHook(useWorkspace).result.current.organizationId).toBe(10);
  rememberWorkspace(1, 20);
  state.userId = 2;
  expect(renderHook(useWorkspace).result.current.organizationId).toBe(10);
});
