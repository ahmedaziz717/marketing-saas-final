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
  expect(document.documentElement.style.colorScheme).toBe("light");
  localStorage.setItem(APPEARANCE_KEY, "dark");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: APPEARANCE_KEY,
        newValue: "dark",
        storageArea: localStorage,
      })
    )
  );
  expect(document.documentElement.style.colorScheme).toBe("dark");
});

it("does not replay a queued cross-tab event over a newer explicit choice", () => {
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: APPEARANCE_KEY,
        newValue: "light",
        storageArea: localStorage,
      })
    )
  );
  expect(screen.getByRole("status").textContent).toBe("dark/dark");
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe("dark");
});

it.each([null, "invalid"])(
  "does not reset an explicit choice for a non-preference storage event (%s)",
  value => {
    render(
      <ThemeProvider switchable>
        <Controls />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: APPEARANCE_KEY,
          newValue: value,
          storageArea: localStorage,
        })
      )
    );
    expect(screen.getByRole("status").textContent).toBe("dark/dark");
  }
);

it("ignores session-storage events with the same key", () => {
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: APPEARANCE_KEY,
        newValue: "light",
        storageArea: sessionStorage,
      })
    )
  );
  expect(screen.getByRole("status").textContent).toBe("dark/dark");
});

it.each(["light", "dark", "system"] as const)(
  "preserves %s through route changes, OS changes and remounts",
  choice => {
    const tree = (workspace: boolean) => (
      <ThemeProvider switchable={workspace}>
        <Controls />
      </ThemeProvider>
    );
    const view = render(tree(true));
    fireEvent.click(screen.getByRole("button", { name: choice }));
    act(() => {
      dark = true;
      listeners.forEach(callback => callback());
    });
    const resolved = choice === "system" ? "dark" : choice;
    expect(screen.getByRole("status").textContent).toBe(
      `${choice}/${resolved}`
    );
    view.rerender(tree(false));
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe(choice);
    view.rerender(tree(true));
    expect(screen.getByRole("status").textContent).toBe(
      `${choice}/${resolved}`
    );
    cleanup();
    render(tree(true));
    expect(screen.getByRole("status").textContent).toBe(
      `${choice}/${resolved}`
    );
  }
);

it("applies the latest cross-tab system selection but ignores older queued events", () => {
  render(
    <ThemeProvider switchable>
      <Controls />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  localStorage.setItem(APPEARANCE_KEY, "system");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: APPEARANCE_KEY,
        newValue: "system",
        storageArea: localStorage,
      })
    )
  );
  expect(screen.getByRole("status").textContent).toBe("system/light");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: APPEARANCE_KEY,
        newValue: "dark",
        storageArea: localStorage,
      })
    )
  );
  expect(screen.getByRole("status").textContent).toBe("system/light");
  act(() => {
    dark = true;
    listeners.forEach(callback => callback());
  });
  expect(screen.getByRole("status").textContent).toBe("system/dark");
});
