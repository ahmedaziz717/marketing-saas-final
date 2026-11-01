// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourcePicker } from "./GoogleCampaignFields";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trpc", () => ({
  trpc: { googleAds: { campaigns: { resources: { useQuery: query } } } },
}));
const countries = [
  { id: "2840", name: "United States", type: "Country" },
  { id: "2826", name: "United Kingdom", type: "Country" },
];
const change = vi.fn();
const props = {
  organizationId: 1,
  connectionId: "one",
  kind: "locations" as const,
  title: "Locations",
  value: [] as string[],
  onChange: change,
};
beforeEach(() => {
  vi.useFakeTimers();
  change.mockReset();
  query.mockReset();
  query.mockReturnValue({ data: countries, isFetching: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function search(text: string) {
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  act(() => vi.advanceTimersByTime(250));
  return input;
}
it("opens visible debounced results while typing and selects without a second dropdown", () => {
  render(<ResourcePicker {...props} />);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  expect(screen.getByRole("status").textContent).toContain("at least 2");
  fireEvent.change(input, { target: { value: " unite " } });
  expect(screen.getByRole("status").textContent).toBe("Loading…");
  expect(screen.queryByRole("option")).toBeNull();
  act(() => vi.advanceTimersByTime(250));
  expect(query.mock.lastCall?.[0].search).toBe("unite");
  fireEvent.click(screen.getByRole("option", { name: /United States/ }));
  expect(change).toHaveBeenCalledWith(["2840"]);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(input);
});
it("supports arrows, Enter, Escape, outside blur, and excludes selected IDs", () => {
  render(<ResourcePicker {...props} value={["2840"]} />);
  const input = search("unite");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(change).toHaveBeenCalledWith(["2840", "2826"]);
  search("unite");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input.getAttribute("aria-expanded")).toBe("false");
  fireEvent.focus(input);
  fireEvent.blur(input, { relatedTarget: document.body });
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("never offers stale options during a newer query or a fetch and shows empty/error/retry", () => {
  const retry = vi.fn();
  const view = render(<ResourcePicker {...props} />);
  const input = search("unite");
  fireEvent.change(input, { target: { value: "canada" } });
  expect(screen.queryByRole("option")).toBeNull();
  query.mockReturnValue({ data: countries, isFetching: true });
  act(() => vi.advanceTimersByTime(250));
  expect(screen.queryByRole("option")).toBeNull();
  query.mockReturnValue({ data: [], isFetching: false });
  view.rerender(<ResourcePicker {...props} />);
  expect(screen.getByRole("status").textContent).toContain("No matching");
  query.mockReturnValue({
    data: countries,
    error: new Error("offline"),
    refetch: retry,
  });
  view.rerender(<ResourcePicker {...props} />);
  expect(screen.queryByRole("option")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
it("filters languages locally, labels defaults, and preserves intentional removal", () => {
  query.mockReturnValue({
    data: [
      { id: "1000", name: "English", type: "Language" },
      { id: "1003", name: "Spanish", type: "Language" },
    ],
  });
  render(
    <ResourcePicker
      {...props}
      kind="languages"
      title="Languages"
      value={["1000"]}
    />
  );
  search("spa");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option").textContent).toContain("Spanish");
  fireEvent.click(screen.getByRole("button", { name: "Remove English" }));
  expect(change).toHaveBeenCalledWith([]);
});
it("resets search on account switch without changing saved selections", () => {
  const view = render(<ResourcePicker {...props} value={["2840"]} />);
  search("unite");
  view.rerender(
    <ResourcePicker {...props} connectionId="two" value={["2826"]} />
  );
  expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
it("does not allow selection when an open picker becomes locked", () => {
  const view = render(
    <fieldset>
      <ResourcePicker {...props} />
    </fieldset>
  );
  search("unite");
  view.rerender(
    <fieldset disabled>
      <ResourcePicker {...props} />
    </fieldset>
  );
  fireEvent.click(screen.getByRole("option", { name: /United States/ }));
  expect(change).not.toHaveBeenCalled();
});
it("reopens with the first option on ArrowDown and the last on ArrowUp", () => {
  render(<ResourcePicker {...props} />);
  const input = search("unite");
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe(
    "true"
  );
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe(
    "true"
  );
});
