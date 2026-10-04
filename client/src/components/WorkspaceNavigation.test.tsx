// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SidebarProvider, useSidebar } from "./ui/sidebar";
import {
  WorkspaceNavigation,
  workspaceNavigation,
  workspacePageLabel,
  workspaceSection,
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
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("starts with every submenu closed, including the current section", () => {
  setup();
  expect(
    screen
      .getByRole("button", { name: "Activate" })
      .getAttribute("aria-expanded")
  ).toBe("false");
  expect(screen.queryByRole("link", { name: "Meta Ads" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  expect(
    screen.getByRole("link", { name: "Meta Ads" }).getAttribute("aria-current")
  ).toBe("page");
  expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});
it("opens only one submenu at a time and Escape restores focus", () => {
  const router = setup();
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  const parent = screen.getByRole("button", { name: "Create" });
  fireEvent.click(parent);
  expect(screen.queryByRole("link", { name: "Meta Ads" })).toBeNull();
  const link = screen.getByRole("link", { name: "Apps" });
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  expect(document.activeElement === parent).toBe(true);
  expect(parent.getAttribute("aria-expanded")).toBe("false");
  expect(router.history).toHaveLength(1);
});
it("opens a compact flyout without expanding the rail and closes it after navigation", async () => {
  vi.useFakeTimers();
  const router = setup("/app", true);
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/false"
  );
  expect(
    document.querySelector('[role="dialog"][aria-label="Activate navigation"]')
  ).toBeTruthy();
  await act(async () => {
    fireEvent.click(
      document.querySelector('[role="dialog"] a[href="/app/advertising/meta"]')!
    );
    vi.advanceTimersByTime(1);
  });
  expect(document.querySelector('[role="dialog"]') === null).toBe(true);
  expect(router.history.at(-1)).toBe("/app/advertising/meta");
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/false"
  );
}, 30000);
it("supports Escape and focus return from the compact flyout", async () => {
  // Radix restores trigger focus after removing its portal. JSDOM floating
  // layout/focus cleanup can exceed the default 5s timeout on shared runners.
  vi.useFakeTimers();
  setup("/app", true);
  const parent = screen.getByRole("button", { name: "Create" });
  fireEvent.click(parent);
  await act(async () => {
    fireEvent.keyDown(
      document.querySelector('[role="dialog"] a[href="/app/creatives"]')!,
      { key: "Escape" }
    );
  });
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  expect(document.querySelector('[role="dialog"]') === null).toBe(true);
  expect(document.activeElement === parent).toBe(true);
}, 30000);
it("keeps groups closed after remount even if the legacy preference had them open", () => {
  localStorage.setItem(
    "frame-navigation-groups-v1",
    JSON.stringify({ "/app/advertising": true })
  );
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  cleanup();
  setup();
  expect(
    screen
      .getByRole("button", { name: "Activate" })
      .getAttribute("aria-expanded")
  ).toBe("false");
});
it("preserves date and comparison filters between analytics reports", () => {
  const router = setup(
    "/app/analytics?tab=social&since=2026-09-01&until=2026-09-20&compare=1&account=page1&channel=facebook"
  );
  fireEvent.click(screen.getByRole("button", { name: "Measure" }));
  expect(
    screen.getByRole("link", { name: "Social" }).getAttribute("aria-current")
  ).toBe("page");
  fireEvent.click(screen.getByRole("link", { name: "Advertising" }));
  expect(router.history.at(-1)).toBe(
    "/app/analytics/advertising?since=2026-09-01&until=2026-09-20&compare=1"
  );
  expect(
    screen
      .getByRole("button", { name: "Measure" })
      .getAttribute("aria-expanded")
  ).toBe("false");
});
it("mobile selection closes the drawer without changing the desktop preference", () => {
  viewport.mobile = true;
  setup("/app", true);
  fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/true"
  );
  fireEvent.click(screen.getByRole("link", { name: "Meta Ads" }));
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/false"
  );
});
it("supports a growing channel list in the same flyout", () => {
  const items = [
    {
      ...workspaceNavigation.find(item => item.label === "Activate")!,
      children: Array.from({ length: 10 }, (_, i) => ({
        label: `Channel ${i + 1}`,
        path: `/app/advertising/channel-${i + 1}`,
      })),
    },
  ];
  setup("/app/advertising/channel-10", true, items);
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  const menu = within(screen.getByRole("dialog"));
  expect(menu.getAllByRole("link")).toHaveLength(10);
  expect(
    menu.getByRole("link", { name: "Channel 10" }).getAttribute("aria-current")
  ).toBe("page");
});
it("keeps the library filter and Brand routes distinct", () => {
  setup("/app/library?view=approved");
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  expect(
    screen
      .getByRole("link", { name: "Approved assets" })
      .getAttribute("aria-current")
  ).toBe("page");
  expect(
    screen
      .getByRole("link", { name: "Review history" })
      .getAttribute("aria-current")
  ).toBeNull();
  expect(workspacePageLabel("/app/settings/company")).toBe(
    "Brand / Business profile"
  );
});
it("keeps app editors, historic links, and roadmap labels understandable", () => {
  expect(workspacePageLabel("/app/advertising/meta/legacy")).toBe(
    "Activate / Meta Ads"
  );
  expect(workspacePageLabel("/app/analytics", "tab=advertising")).toBe(
    "Measure / Advertising"
  );
  expect(workspacePageLabel("/app/creatives/video", "type=ugc")).toBe(
    "Create / UGC video"
  );
  expect(workspacePageLabel("/app/briefs")).toBe("Create / Campaign plans");
  expect(workspaceSection("/app/creatives/workflows")).toBe("Create");
  setup("/app");
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(
    screen
      .getByRole("link", { name: "API & AI assistants Planned" })
      .getAttribute("href")
  ).toBe("/app/settings/developer");
  expect(workspaceNavigation.some(item => item.path.startsWith("/admin"))).toBe(
    false
  );
});
