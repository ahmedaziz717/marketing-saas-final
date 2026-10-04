// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout, { SIDEBAR_PREFERENCE_KEY } from "./DashboardLayout";
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: 1, name: "Demo", email: "demo@example.test" },
    logout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    organizationId: 1,
    organization: { id: 1, name: "Demo workspace" },
    workspaces: [
      { organization: { id: 1, name: "Demo workspace" } },
      { organization: { id: 2, name: "Second workspace" } },
    ],
  }),
}));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
function setup() {
  const router = memoryLocation({ path: "/app/creatives", record: true });
  return render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <ThemeProvider switchable>
        <TooltipProvider>
          <DashboardLayout>
            <h1>Create</h1>
          </DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </Router>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("defaults to a compact rail, keeps account switching visible, and remembers explicit expansion", () => {
  setup();
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Switch account" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(localStorage.getItem(SIDEBAR_PREFERENCE_KEY)).toBe("true");
  cleanup();
  setup();
  expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Create" }).getAttribute("aria-expanded")
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  cleanup();
  setup();
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
});
it("keeps navigation usable when preference storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("blocked");
  });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
});
