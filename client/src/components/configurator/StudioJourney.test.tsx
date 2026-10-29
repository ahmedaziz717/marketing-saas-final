// @vitest-environment jsdom
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Palette, Send } from "lucide-react";
import { StudioJourney, useStudioJourney } from "./StudioJourney";

let mobile = true;
const listeners = new Set<() => void>();
beforeEach(() => {
  localStorage.clear();
  mobile = true;
  listeners.clear();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return mobile;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Fixture({
  scope = "one",
  missing = false,
}: {
  scope?: string;
  missing?: boolean;
}) {
  const [section, setSection] = useState("look");
  const [category, setCategory] = useState("theme");
  const journey = useStudioJourney({
    scopeKey: scope,
    section,
    category,
    sections: [
      {
        id: "look",
        title: "Look & Feel",
        subtitle: "Make it yours",
        icon: Palette,
        categories: [
          { id: "theme", title: "Theme", value: "Neon dusk" },
          {
            id: "fonts",
            title: "Fonts",
            value: missing ? "Choose a font" : "Rubik",
            needsInput: missing,
          },
          {
            id: "people",
            title: "People",
            value: "No people",
            disabled: true,
            reason: "Choose a people scene",
          },
        ],
      },
      {
        id: "review",
        title: "Review",
        subtitle: "Finish",
        icon: Send,
        categories: [
          { id: "review", title: "Summary", value: "Review choices" },
        ],
      },
    ],
    onNavigate: (s, c) => {
      setSection(s);
      setCategory(c);
    },
  });
  return (
    <StudioJourney journey={journey}>
      <input aria-label="Creative name" defaultValue="" />
    </StudioJourney>
  );
}
it("shows every category on mobile, marks only opened categories and preserves input state across overview and resize", () => {
  render(<Fixture />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getAllByText("0/2 viewed")[0]).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Open People category",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Open Theme category" }));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "My campaign" } });
  expect(screen.getAllByText("1/2 viewed")[0]).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "All categories" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open Fonts category" }));
  expect(screen.getByRole("textbox")).toBe(input);
  expect((input as HTMLInputElement).value).toBe("My campaign");
  act(() => {
    mobile = false;
    listeners.forEach(fn => fn());
  });
  expect(screen.getByRole("textbox")).toBe(input);
  expect(
    screen.getByRole("navigation", { name: "Studio sections" })
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole("button", { name: "Open Fonts category" })
    ).getByText("Viewed")
  ).toBeTruthy();
});
it("navigates immediately without opening a review or changing unviewed choices", () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Open Theme category" }));
  fireEvent.click(screen.getByRole("button", { name: "All categories" }));
  fireEvent.click(
    screen.getByRole("button", { name: /Continue to next section/ })
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("region", { name: "Review unviewed choices" })
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Open Summary category" })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Look & Feel/ }));
  expect(
    screen.getByRole("button", { name: "Open Theme category" }).textContent
  ).toContain("Viewed");
  expect(
    screen.getByRole("button", { name: "Open Fonts category" }).textContent
  ).toContain("Not viewed");
});
it("opens an optional inline review with actual values and keeps required inputs distinct", () => {
  render(<Fixture missing />);
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  const panel = screen.getByRole("region", { name: "Review unviewed choices" });
  expect(within(panel).getByText("Not set · Required")).toBeTruthy();
  expect(within(panel).queryByText("People")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(within(panel).getByRole("button", { name: /Fonts/ }));
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(
    screen.queryByRole("region", { name: "Review unviewed choices" })
  ).toBeNull();
});
it("keeps navigation memory isolated when the workspace or draft changes", () => {
  const { rerender } = render(<Fixture scope="one" />);
  fireEvent.click(screen.getByRole("button", { name: "Open Theme category" }));
  rerender(<Fixture scope="two" />);
  expect(screen.getAllByText("0/2 viewed")[0]).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open Fonts category" }));
  fireEvent.click(screen.getByRole("button", { name: "All categories" }));
  expect(
    screen.getByRole("button", { name: "Open Theme category" }).textContent
  ).toContain("Not viewed");
  expect(
    screen.getByRole("button", { name: "Open Fonts category" }).textContent
  ).toContain("Viewed");
  rerender(<Fixture scope="one" />);
  expect(
    screen.getByRole("button", { name: "Open Theme category" }).textContent
  ).toContain("Viewed");
  expect(
    screen.getByRole("button", { name: "Open Fonts category" }).textContent
  ).toContain("Not viewed");
});

it("starts a new visit with no viewed categories, ignoring old browser memory", () => {
  localStorage.setItem(
    "one:journey:v1",
    JSON.stringify({ viewed: ["theme", "fonts"], accepted: [] })
  );
  const view = render(<Fixture />);
  expect(screen.getAllByText("0/2 viewed")[0]).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open Theme category" }));
  fireEvent.click(screen.getByRole("button", { name: "All categories" }));
  fireEvent.click(screen.getByRole("button", { name: "Open Fonts category" }));
  fireEvent.click(screen.getByRole("button", { name: "All categories" }));
  expect(screen.getAllByText("2/2 viewed")[0]).toBeTruthy();
  view.unmount();
  render(<Fixture />);
  expect(screen.getAllByText("0/2 viewed")[0]).toBeTruthy();
});
