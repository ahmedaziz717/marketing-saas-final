// @vitest-environment jsdom
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Image, Palette, Send } from "lucide-react";
import { StudioSections } from "./StudioSections";
import { StudioCategories } from "./StudioCategories";
import { scrollStudioChoices } from "./studioNavigation";

let mobile = true;
const mediaListeners = new Set<() => void>();
beforeEach(() => {
  mobile = true;
  mediaListeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("700px") ? mobile : true;
    },
    addEventListener: (_: string, listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      mediaListeners.delete(listener),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sections = [
  {
    id: "type",
    title: "Type & Source",
    subtitle: "Start with an idea",
    icon: Image,
  },
  {
    id: "look",
    title: "Look & Feel",
    subtitle: "Make it yours",
    icon: Palette,
  },
  {
    id: "review",
    title: "Review",
    subtitle: "Ready to publish",
    icon: Send,
    disabled: true,
    disabledReason: "Complete your setup first",
  },
];
function Form() {
  const [current, select] = useState("type");
  return (
    <StudioSections
      label="Studio sections"
      items={sections}
      current={current}
      onSelect={select}
    >
      <input aria-label="Campaign brief" defaultValue="" />
    </StudioSections>
  );
}
it("keeps every mobile section above the panel and preserves inputs through collapse, navigation and resizing", () => {
  render(<Form />);
  expect(screen.getByRole("group", { name: "Studio sections" })).toBeTruthy();
  const input = screen.getByRole("textbox", { name: "Campaign brief" });
  fireEvent.change(input, { target: { value: "Keep my draft" } });
  const first = screen.getByRole("button", { name: /^Type & Source/ });
  expect(first.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(first);
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(first);
  fireEvent.click(screen.getByRole("button", { name: /^Look & Feel/ }));
  const panel = screen.getByRole("region", { name: "Look & Feel" });
  expect(panel.previousElementSibling?.getAttribute("aria-label")).toBe(
    "Studio sections"
  );
  expect(panel.previousElementSibling?.textContent).toContain("Review");
  expect(screen.getByRole("textbox")).toBe(input);
  expect((input as HTMLInputElement).value).toBe("Keep my draft");
  expect(
    (screen.getByRole("button", { name: /^Review/ }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  act(() => {
    mobile = false;
    mediaListeners.forEach(listener => listener());
  });
  expect(
    screen.getByRole("navigation", { name: "Studio sections" })
  ).toBeTruthy();
  expect(screen.getByRole("textbox")).toBe(input);
  act(() => {
    mobile = true;
    mediaListeners.forEach(listener => listener());
  });
  expect(screen.getByRole("textbox")).toBe(input);
  expect(
    screen
      .getByRole("button", { name: /^Look & Feel/ })
      .getAttribute("aria-expanded")
  ).toBe("true");
});

it("scrolls overflowing categories with bounded arrows without changing the selected category", () => {
  const select = vi.fn();
  render(
    <StudioCategories items={sections} current="type" onSelect={select} />
  );
  const track = screen.getByRole("group", { name: "Section categories" });
  let width = 200;
  Object.defineProperties(track, {
    clientWidth: { get: () => width },
    scrollWidth: { value: 600 },
  });
  const scrollBy = vi.fn(({ left }: ScrollToOptions) => {
    track.scrollLeft = Math.min(
      400,
      Math.max(0, track.scrollLeft + (left ?? 0))
    );
    fireEvent.scroll(track);
  });
  Object.defineProperty(track, "scrollBy", { value: scrollBy });
  fireEvent.scroll(track);
  const left = screen.getByRole("button", {
    name: "Scroll section categories left",
  }) as HTMLButtonElement;
  const right = screen.getByRole("button", {
    name: "Scroll section categories right",
  }) as HTMLButtonElement;
  expect(left.disabled).toBe(true);
  expect(right.disabled).toBe(false);
  fireEvent.click(right);
  expect(scrollBy).toHaveBeenLastCalledWith({ left: 160, behavior: "auto" });
  expect(left.disabled).toBe(false);
  fireEvent.click(right);
  fireEvent.click(right);
  expect(right.disabled).toBe(true);
  fireEvent.click(left);
  expect(right.disabled).toBe(false);
  expect(select).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Type & Source" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  width = 700;
  fireEvent.scroll(track);
  expect(
    screen.queryByRole("button", { name: "Scroll section categories right" })
  ).toBeNull();
});

it("scrolls to the visible mobile section when another preserved draft is hidden", () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  const { container } = render(
    <div className="cfg-root">
      <div hidden>
        <h2 className="cfg-section-heading">
          <button aria-expanded="true">Saved draft</button>
        </h2>
      </div>
      <h2 className="cfg-section-heading">
        <button aria-expanded="true">Current draft</button>
      </h2>
    </div>
  );
  const headers = container.querySelectorAll("h2");
  const hiddenScroll = vi.fn(),
    visibleScroll = vi.fn();
  headers[0].scrollIntoView = hiddenScroll;
  headers[1].scrollIntoView = visibleScroll;
  scrollStudioChoices(container.firstElementChild as HTMLElement);
  expect(hiddenScroll).not.toHaveBeenCalled();
  expect(visibleScroll).toHaveBeenCalledWith({
    block: "start",
    behavior: "auto",
  });
});

it.each([
  {
    name: "reveals a tall choice covered by the action bar",
    bottom: 860,
    scrolls: true,
  },
  {
    name: "keeps the expanded preview visible when the choice already fits",
    bottom: 620,
    scrolls: false,
  },
])("$name", ({ bottom, scrolls }) => {
  mobile = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("innerHeight", 768);
  const { container } = render(
    <div className="cfg-root">
      <header className="cfg-heading">Creative Studio</header>
      <div className="studio-journey">
        <div className="journey-editor">
          <article className="cfg-card">Image</article>
        </div>
      </div>
      <footer className="cfg-bottom">Generate</footer>
    </div>
  );
  const root = container.firstElementChild as HTMLElement;
  const bounds = (selector: string, top: number, bottom: number) => {
    vi.spyOn(
      root.querySelector(selector)!,
      "getBoundingClientRect"
    ).mockReturnValue({ top, bottom, height: bottom - top } as DOMRect);
  };
  bounds(".cfg-heading", 64, 120);
  bounds(".studio-journey", 300, 1000);
  bounds(".cfg-card", 400, bottom);
  bounds(".cfg-bottom", 696, 760);
  const journey = root.querySelector<HTMLElement>(".studio-journey")!;
  journey.scrollIntoView = vi.fn();
  scrollStudioChoices(root);
  if (scrolls)
    expect(journey.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
  else expect(journey.scrollIntoView).not.toHaveBeenCalled();
});
