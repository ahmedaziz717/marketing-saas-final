// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SidebarProvider, useSidebar } from "./ui/sidebar";
import {
  WorkspaceNavigation,
  workspaceNavigation,
  workspacePageLabel,
} from "./WorkspaceNavigation";
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => viewport.mobile }));
function State() {
  const sidebar = useSidebar();
  return (
    <>
      <output data-testid="sidebar-state">
        {sidebar.state}/{String(sidebar.openMobile)}
      </output>
      <button onClick={() => sidebar.setOpenMobile(true)}>Open drawer</button>
    </>
  );
}
function setup(
  path = "/app/advertising/meta",
  collapsed = false,
  items = workspaceNavigation
) {
  const router = memoryLocation({ path, record: true });
  render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <SidebarProvider defaultOpen={!collapsed}>
        <WorkspaceNavigation items={items} />
        <State />
      </SidebarProvider>
    </Router>
  );
  return router;
}
beforeEach(() => {
  localStorage.clear();
  viewport.mobile = false;
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
it("opens the active group and marks only its leaf current", () => {
  setup();
  expect(
    screen
      .getByRole("button", { name: "Advertising" })
      .getAttribute("aria-expanded")
  ).toBe("true");
  expect(
    screen.getByRole("link", { name: "Meta Ads" }).getAttribute("aria-current")
  ).toBe("page");
  expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "Google Ads" })).toBeNull();
  expect(
    screen
      .getByTitle("Google Ads - planned, not available yet")
      .getAttribute("aria-disabled")
  ).toBe("true");
});
it("toggles groups without navigating and Escape returns focus to the parent", () => {
  const router = setup();
  const parent = screen.getByRole("button", { name: "Advertising" });
  fireEvent.click(parent);
  expect(screen.queryByRole("link", { name: "Meta Ads" })).toBeNull();
  expect(router.history).toHaveLength(1);
  fireEvent.click(parent);
  const link = screen.getByRole("link", { name: "Meta Ads" });
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  expect(document.activeElement).toBe(parent);
  expect(parent.getAttribute("aria-expanded")).toBe("false");
});
it("keeps independent collapse state and restores it on remount", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Social Media" }));
  expect(screen.getByRole("link", { name: "Facebook" })).toBeTruthy();
  cleanup();
  setup("/app");
  expect(
    screen
      .getByRole("button", { name: "Social Media" })
      .getAttribute("aria-expanded")
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "Advertising" })
      .getAttribute("aria-expanded")
  ).toBe("true");
});
it("recognizes legacy Analytics deep links and preserves date/comparison filters", () => {
  const router = setup(
    "/app/analytics?tab=social&since=2026-09-01&until=2026-09-20&compare=1&account=page1&channel=facebook"
  );
  expect(
    screen
      .getByRole("link", { name: "Social Media" })
      .getAttribute("aria-current")
  ).toBe("page");
  fireEvent.click(screen.getByRole("link", { name: "Advertising" }));
  expect(router.history?.at(-1)).toBe(
    "/app/analytics/advertising?since=2026-09-01&until=2026-09-20&compare=1"
  );
  expect(
    screen
      .getByRole("link", { name: "Advertising" })
      .getAttribute("aria-current")
  ).toBe("page");
});
it("expands the icon rail before opening a group without selecting a page", () => {
  const router = setup("/app", true);
  fireEvent.click(screen.getByRole("button", { name: "Advertising" }));
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "expanded/false"
  );
  expect(screen.getByRole("link", { name: "Meta Ads" })).toBeTruthy();
  expect(router.history).toHaveLength(1);
});
it("mobile group toggles keep the drawer open and selecting a leaf closes it", () => {
  viewport.mobile = true;
  setup("/app", true);
  fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
  fireEvent.click(screen.getByRole("button", { name: "Advertising" }));
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/true"
  );
  fireEvent.click(screen.getByRole("link", { name: "Meta Ads" }));
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/false"
  );
});
it("handles ten channels with the same nested-list structure", () => {
  const items = [
    {
      ...workspaceNavigation.find(item => item.path === "/app/advertising")!,
      children: Array.from({ length: 10 }, (_, i) => ({
        label: `Channel ${i + 1}`,
        path: `/app/advertising/channel-${i + 1}`,
      })),
    },
  ];
  setup("/app/advertising/channel-10", false, items);
  const nav = screen.getByRole("navigation", { name: "Workspace navigation" });
  expect(within(nav).getAllByRole("link")).toHaveLength(10);
  expect(
    within(nav)
      .getByRole("link", { name: "Channel 10" })
      .getAttribute("aria-current")
  ).toBe("page");
});
it("does not crash if local storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Social Media" }));
  expect(screen.getByRole("link", { name: "Facebook" })).toBeTruthy();
});
it("labels direct and historical nested pages correctly", () => {
  expect(workspacePageLabel("/app/advertising/meta/legacy")).toBe(
    "Advertising / Meta Ads"
  );
  expect(workspacePageLabel("/app/analytics", "tab=advertising")).toBe(
    "Analytics / Advertising"
  );
  expect(workspacePageLabel("/app/social/facebook")).toBe(
    "Social Media / Facebook"
  );
});
it("groups tools under the four product stages and keeps administration separate", () => {
  setup("/app");
  for (const name of ["Create", "Activate", "Measure", "Optimize"]) expect(screen.getByText(name)).toBeTruthy();
  expect(workspaceNavigation.find(item => item.path === "/app/creatives")?.group).toBe("Create");
  expect(workspaceNavigation.find(item => item.path === "/app/advertising")?.group).toBe("Activate");
  expect(workspaceNavigation.find(item => item.path === "/app/analytics")?.group).toBe("Measure");
  expect(workspaceNavigation.find(item => item.path === "/app/optimize/agent")?.roadmap).toBe(true);
});
it("opens Settings for the retained Brand route and highlights billing", () => {
  setup("/app/brand");
  expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "Brand kit" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Billing & Usage" })).toBeTruthy();
});
it("maps old saved-work deep links to the Studio subsection", () => {
  setup("/app/creatives?tab=saved&asset=creative%3A42");
  expect(screen.getByRole("link", { name: "Saved work" }).getAttribute("aria-current")).toBe("page");
  expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});
it("keeps channel Overview separate from the individual Meta route", () => {
  setup("/app/advertising");
  expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Meta Ads" }).getAttribute("aria-current")).toBeNull();
});
