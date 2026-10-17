// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APPEARANCE_KEY, ThemeProvider, useTheme } from "./ThemeContext";
let dark = false;
let listeners: Set<() => void>;
function Controls() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <output>
        {theme}/{resolvedTheme}
      </output>
      {(["light", "dark", "system"] as const).map(value => (
        <button key={value} onClick={() => setTheme(value)}>
          {value}
        </button>
      ))}
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  dark = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return dark;
    },
    addEventListener: (_: string, callback: () => void) =>
      listeners.add(callback),
    removeEventListener: (_: string, callback: () => void) =>
      listeners.delete(callback),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.workspaceTheme;
});
it("defaults to the system appearance and follows system changes", () => {
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  expect(screen.getByRole("status").textContent).toBe("system/light");
  act(() => {
    dark = true;
    listeners.forEach(callback => callback());
  });
  expect(screen.getByRole("status").textContent).toBe("system/dark");
  expect(document.documentElement.dataset.workspaceTheme).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});
it("remembers an explicit choice and does not override it on OS changes", () => {
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe("dark");
  act(() => {
    dark = false;
    listeners.forEach(callback => callback());
  });
  expect(screen.getByRole("status").textContent).toBe("dark/dark");
  cleanup();
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  expect(screen.getByRole("status").textContent).toBe("dark/dark");
});
it("keeps the public website light without losing the workspace preference", () => {
  localStorage.setItem(APPEARANCE_KEY, "dark");
  const { rerender } = render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  rerender(
    <ThemeProvider switchable={false}>
      <Controls />
    </ThemeProvider>
  );
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(document.documentElement.dataset.workspaceTheme).toBeUndefined();
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe("dark");
  rerender(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});
it("ignores invalid saved values and supports unavailable storage", () => {
  localStorage.setItem(APPEARANCE_KEY, "invalid");
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  expect(screen.getByRole("status").textContent).toBe("system/light");
  cleanup();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("blocked");
  });
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  expect(screen.getByRole("status").textContent).toBe("dark/dark");
});
it("syncs a changed preference across tabs", () => {
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: APPEARANCE_KEY, newValue: "dark" })
    )
  );
  expect(document.documentElement.style.colorScheme).toBe("dark");
});
