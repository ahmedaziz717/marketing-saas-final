// @vitest-environment jsdom
import {
  cleanup,
  render as testingRender,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  user: null as null | { role: string; email: string },
  loading: false,
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ ...auth, logout: vi.fn() }),
}));
import { ThemeProvider } from "@/contexts/ThemeContext";
const render = (ui: React.ReactNode) =>
  testingRender(<ThemeProvider switchable>{ui}</ThemeProvider>);
import PlatformAdminLayout from "./PlatformAdminLayout";
const mounted = vi.fn();
function PrivateContent() {
  mounted();
  return <div>Private account totals</div>;
}
afterEach(() => {
  cleanup();
  mounted.mockClear();
  auth.user = null;
  auth.loading = false;
});
it("requires sign-in without mounting private content", () => {
  render(
    <PlatformAdminLayout>
      <PrivateContent />
    </PlatformAdminLayout>
  );
  expect(
    screen.getByRole("button", { name: "Sign in to administration" })
  ).toBeTruthy();
  expect(mounted).not.toHaveBeenCalled();
});
it("does not treat a customer workspace administrator as platform staff", () => {
  auth.user = { role: "user", email: "owner@example.test" };
  render(
    <PlatformAdminLayout>
      <PrivateContent />
    </PlatformAdminLayout>
  );
  expect(
    screen.getByText("Platform administrator access required")
  ).toBeTruthy();
  expect(mounted).not.toHaveBeenCalled();
});
it("renders platform staff in a separate shell without customer navigation", () => {
  auth.user = { role: "admin", email: "staff@example.test" };
  render(
    <PlatformAdminLayout>
      <PrivateContent />
    </PlatformAdminLayout>
  );
  expect(screen.getByText("Private account totals")).toBeTruthy();
  expect(
    screen.getByRole("navigation", { name: "Platform administration" })
  ).toBeTruthy();
  expect(screen.queryByText("Content Studio")).toBeNull();
  expect(document.querySelector('a[href^="/app"]')).toBeNull();
});
