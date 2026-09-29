// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DateRangeFilter } from "./DateRangeFilter";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("orders shared presets and applies calendar presets immediately", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  const change = vi.fn();
  render(
    <DateRangeFilter
      value={{ since: "2026-09-01", until: "2026-09-20" }}
      onChange={change}
    />
  );
  expect(screen.getAllByRole("option").map(x => x.textContent)).toEqual([
    "Today",
    "Yesterday",
    "Last 7 days",
    "Last 14 days",
    "Last 30 days",
    "Last 90 days",
    "This month",
    "Last month",
    "This year",
    "Last year",
    "Last 365 days",
    "Custom date range",
  ]);
  fireEvent.change(screen.getByLabelText("Date range"), {
    target: { value: "last_month" },
  });
  expect(change).toHaveBeenLastCalledWith({
    since: "2026-08-01",
    until: "2026-08-31",
  });
});
it("keeps custom drafts unapplied and rejects invalid or overlong ranges inline", () => {
  const change = vi.fn();
  render(
    <DateRangeFilter
      value={{ since: "2026-09-01", until: "2026-09-20" }}
      onChange={change}
    />
  );
  fireEvent.change(screen.getByLabelText("Date range start date"), {
    target: { value: "2025-01-01" },
  });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Apply date range"));
  expect(screen.getByRole("alert").textContent).toContain("366 days");
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Date range start date"), {
    target: { value: "2026-09-05" },
  });
  fireEvent.click(screen.getByText("Apply date range"));
  expect(change).toHaveBeenCalledWith({
    since: "2026-09-05",
    until: "2026-09-20",
  });
});
