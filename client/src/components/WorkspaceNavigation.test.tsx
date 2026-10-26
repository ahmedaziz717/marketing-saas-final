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
import { Router, useLocation } from "wouter";
import type { ReactNode } from "react";
import ToolsDirectoryPage from "@/pages/ToolsDirectoryPage";
import { memoryLocation } from "wouter/memory-location";
import { workflowSections } from "@shared/workflowPlatform";
import { SidebarProvider, useSidebar } from "./ui/sidebar";
import {
  WorkspaceNavigation,
  workspaceNavigation,
  workspacePageLabel,
  workspaceSection,
} from "./WorkspaceNavigation";
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
function Directory() {
  const [location] = useLocation();
  if (location !== "/app/apps" && location !== "/app/workflows") return null;
  return <ToolsDirectoryPage workflows={location === "/app/workflows"} />;
}
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
  path = "/app/activate/studio",
  collapsed = false,
  items = workspaceNavigation
) {
  const router = memoryLocation({ path, record: true });
  render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <SidebarProvider defaultOpen={!collapsed}>
        <WorkspaceNavigation items={items} />
        <State />
        <Directory />
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
it.each(Object.values(workflowSections))(
  "separates $name Apps from Workflows and highlights the selected destination",
  section => {
    const router = setup(section.appsPath);
    const appsLabel = section.name === "Measure" ? "Workflow apps" : "Apps";
    fireEvent.click(screen.getByRole("button", { name: section.name }));
    expect(
      screen.getByRole("link", { name: appsLabel }).getAttribute("aria-current")
    ).toBe("page");
    const workflow = screen.getByRole("link", {
      name: "Workflows",
    });
    expect(workflow.getAttribute("aria-current")).toBeNull();
    fireEvent.click(workflow);
    expect(router.history.at(-1)).toBe(section.path);
    expect(workspacePageLabel(section.path)).toBe(
      `${section.name} / Workflows`
    );
    expect(workspacePageLabel(section.appsPath)).toBe(
      `${section.name} / ${appsLabel}`
    );
  }
);
it("starts with every submenu closed, including the current section", () => {
  setup();
  expect(
    screen
      .getByRole("button", { name: "Activate" })
      .getAttribute("aria-expanded")
  ).toBe("false");
  expect(screen.queryByRole("link", { name: "Activation Studio" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  expect(
    screen
      .getByRole("link", { name: "Activation Studio" })
      .getAttribute("aria-current")
  ).toBe("page");
  expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  for (const name of [
    "Advertising",
    "Meta Ads",
    "Social publishing",
    "Facebook",
  ])
    expect(screen.queryByRole("link", { name })).toBeNull();
});
it("opens only one submenu at a time and Escape restores focus", () => {
  const router = setup();
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  const parent = screen.getByRole("button", { name: "Create" });
  fireEvent.click(parent);
  expect(screen.queryByRole("link", { name: "Activation Studio" })).toBeNull();
  const link = screen.getByRole("link", { name: "Apps" });
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  expect(document.activeElement === parent).toBe(true);
  expect(parent.getAttribute("aria-expanded")).toBe("false");
  expect(router.history).toHaveLength(1);
});
// Real Radix portal/focus cleanup takes 35–48s in JSDOM on shared runners.
// Keep the interaction assertions and allow that measured cleanup to finish.
it("opens a compact flyout without expanding the rail and closes it after navigation", async () => {
  vi.useFakeTimers();
  const router = setup("/app", true);
  fireEvent.click(screen.getByLabelText("Activate", { selector: "button" }));
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/false"
  );
  expect(
    document.querySelector('[role="dialog"][aria-label="Activate navigation"]')
  ).toBeTruthy();
  await act(async () => {
    fireEvent.click(
      document.querySelector('[role="dialog"] a[href="/app/activate/studio"]')!
    );
    vi.advanceTimersByTime(1);
  });
  expect(document.querySelector('[role="dialog"]') === null).toBe(true);
  expect(router.history.at(-1)).toBe("/app/activate/studio");
  expect(screen.getByTestId("sidebar-state").textContent).toBe(
    "collapsed/false"
  );
}, 90000);
it("supports Escape and focus return from the compact flyout", async () => {
  // Use the explicit accessible label to avoid JSDOM computing visibility for
  // every navigation icon while the real Radix focus/keyboard behavior runs.
  vi.useFakeTimers();
  setup("/app", true);
  const parent = screen.getByLabelText("Create", { selector: "button" });
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
}, 90000);
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
  const measureMenu = document.getElementById(
    screen
      .getByRole("button", { name: "Measure" })
      .getAttribute("aria-controls")!
  );
  expect(measureMenu?.querySelector("a")?.textContent).toBe("Insights Studio");
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
  fireEvent.click(screen.getByRole("link", { name: "Activation Studio" }));
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
it("keeps library filters, Brand, and administrative Settings distinct", () => {
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
  expect(workspacePageLabel("/app/settings/company")).toBe("Brand");
  expect(workspacePageLabel("/app/brand")).toBe("Brand");
  expect(workspacePageLabel("/app/settings/catalog/import")).toBe(
    "Catalog / Import website"
  );
  expect(workspaceSection("/app/settings/company")).toBe("Brand");
  expect(screen.getByRole("link", { name: "Brand" }).getAttribute("href")).toBe(
    "/app/brand"
  );
  fireEvent.click(screen.getByRole("link", { name: "Brand" }));
  expect(
    screen.getByRole("link", { name: "Brand" }).getAttribute("aria-current")
  ).toBe("page");
  expect(
    screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")
  ).toBeNull();
});
it.each([
  { mobile: false, compact: false },
  { mobile: false, compact: true },
  { mobile: true, compact: true },
])(
  "puts Catalog directly above Brand and navigates in $mobile/$compact mode",
  ({ mobile, compact }) => {
    viewport.mobile = mobile;
    const router = setup("/app/settings/team", compact);
    fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
    const catalog = screen.getByRole("link", { name: "Catalog" });
    expect(catalog.closest("li")?.nextElementSibling?.textContent).toBe(
      "Brand"
    );
    fireEvent.click(catalog);
    expect(router.history.at(-1)).toBe("/app/catalog");
    expect(catalog.getAttribute("aria-current")).toBe("page");
    expect(
      screen
        .getByRole("link", { name: "Settings" })
        .getAttribute("aria-current")
    ).toBeNull();
    if (mobile)
      expect(screen.getByTestId("sidebar-state").textContent).toBe(
        "collapsed/false"
      );
    for (const path of [
      "/app/catalog",
      "/app/catalog/import",
      "/app/settings/catalog",
      "/app/settings/catalog/import",
      "/app/import",
    ]) {
      expect(workspaceSection(path)).toBe("Catalog");
      expect(workspacePageLabel(path)).toMatch(/^Catalog/);
    }
  }
);
it("keeps app editors, historic links, and roadmap labels understandable", () => {
  expect(workspacePageLabel("/app/advertising/meta/legacy")).toBe(
    "Activate / Meta Ads"
  );
  expect(workspacePageLabel("/app/analytics", "tab=advertising")).toBe(
    "Measure / Advertising"
  );
  expect(workspacePageLabel("/app/creatives/video", "type=ugc")).toBe(
    "Create / Creator video"
  );
  expect(workspacePageLabel("/app/briefs")).toBe("Create / Campaign plans");
  expect(workspaceSection("/app/creatives/workflows")).toBe("Create");
  setup("/app");
  fireEvent.click(screen.getByRole("link", { name: "Settings" }));
  expect(
    screen.getByRole("link", { name: "Settings" }).getAttribute("href")
  ).toBe("/app/settings");
  expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  expect(workspaceNavigation.some(item => item.path.startsWith("/admin"))).toBe(
    false
  );
});

it.each(["Apps", "Workflows"])(
  "%s opens its four-category landing page and submenu directly",
  label => {
    const router = setup("/app");
    const trigger = screen.getByRole("button", { name: label });
    fireEvent.click(trigger);
    const path = `/app/${label.toLowerCase()}`;
    expect(router.history.at(-1)).toBe(path);
    expect(workspacePageLabel(path)).toBe(label);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = document.getElementById(
      trigger.getAttribute("aria-controls")!
    )!;
    const links = within(menu).getAllByRole("link");
    expect(links).toHaveLength(4);
    const tiles = within(
      screen.getByRole("region", { name: `${label} collections` })
    ).getAllByRole("link");
    expect(tiles).toHaveLength(4);
    expect(links.map(link => link.getAttribute("href"))).toEqual(
      tiles.map(link => link.getAttribute("href"))
    );
    expect(screen.queryByRole("link", { name: `All ${label}` })).toBeNull();
    // Repeated clicks toggle only the menu, never add duplicate history entries.
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(router.history).toEqual(["/app", path]);
    fireEvent.click(within(menu).getAllByRole("link")[0]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // External history navigation restores the page without reopening overlays.
    act(() => router.navigate(path));
    expect(
      screen.getByRole("region", { name: `${label} collections` })
    ).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    act(() => router.navigate("/app"));
    expect(
      screen.queryByRole("region", { name: `${label} collections` })
    ).toBeNull();
  }
);

it.each(["Apps", "Workflows"])(
  "mobile %s shows four choices, then closes the drawer on category selection",
  label => {
    viewport.mobile = true;
    const router = setup("/app", true);
    fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
    const trigger = screen.getByRole("button", { name: label });
    fireEvent.click(trigger);
    expect(router.history.at(-1)).toBe(`/app/${label.toLowerCase()}`);
    expect(screen.getByTestId("sidebar-state").textContent).toBe(
      "collapsed/true"
    );
    const menu = document.getElementById(
      trigger.getAttribute("aria-controls")!
    )!;
    const links = within(menu).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(document.querySelectorAll(".tools-directory-card")).toHaveLength(4);
    const destination = links[2].getAttribute("href");
    fireEvent.click(links[2]);
    expect(router.history.at(-1)).toBe(destination);
    expect(screen.getByTestId("sidebar-state").textContent).toBe(
      "collapsed/false"
    );
  }
);
