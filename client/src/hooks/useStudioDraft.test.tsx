// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import { useState } from "react";
import { z } from "zod";
import { useStudioDraft } from "./useStudioDraft";
import {
  draftShapeSchema,
  studioDraftKey,
  writeStudioDraft,
  readStudioDraft,
} from "@/lib/studioDrafts";

const schema = z.object({
  url: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
const initial = { url: "", model: "default", enabled: false };
function useHarness(key: string, revision?: number, ready = true) {
  const [value, setValue] = useState(initial);
  const draft = useStudioDraft({
    key,
    value,
    restore: setValue,
    schema,
    revision,
    ready,
  });
  return { value, setValue, ...draft };
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("tolerates browsers that deny access to the storage property itself", () => {
  const storage = vi
    .spyOn(window, "localStorage", "get")
    .mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
  try {
    expect(readStudioDraft("draft", JSON.parse)).toBeNull();
    expect(writeStudioDraft("draft", initial)).toBe(false);
  } finally {
    storage.mockRestore();
  }
});
it("restores URL, model and toggle after leaving and remounting without submission", () => {
  const key = studioDraftKey(2, 3, "creative")!;
  const first = renderHook(() => useHarness(key));
  const edited = {
    url: "https://example.com/product",
    model: "chosen-model",
    enabled: true,
  };
  act(() => first.result.current.setValue(edited));
  first.unmount();
  const second = renderHook(() => useHarness(key));
  expect(second.result.current.value).toEqual(edited);
  expect(JSON.parse(localStorage.getItem(key)!).value).toEqual(edited);
});
it("isolates users, workspaces, studios and saved entities", () => {
  const keys = [
    studioDraftKey(1, 2, "creative"),
    studioDraftKey(2, 2, "creative"),
    studioDraftKey(1, 3, "creative"),
    studioDraftKey(1, 2, "insights"),
    studioDraftKey(1, 2, "creative", "video:7"),
  ];
  expect(new Set(keys).size).toBe(keys.length);
  writeStudioDraft(keys[0], {
    version: 1,
    value: { ...initial, url: "private" },
  });
  const view = renderHook(() => useHarness(keys[1]!));
  expect(view.result.current.value.url).toBe("");
  expect(studioDraftKey(undefined, 2, "creative")).toBeNull();
});
it("waits for a saved entity and rejects stale local revisions", () => {
  const key = studioDraftKey(1, 2, "video", "7")!;
  writeStudioDraft(key, {
    version: 1,
    revision: 2,
    value: { ...initial, url: "older edit" },
  });
  const view = renderHook(({ ready }) => useHarness(key, 3, ready), {
    initialProps: { ready: false },
  });
  expect(JSON.parse(localStorage.getItem(key)!).revision).toBe(2);
  view.rerender({ ready: true });
  expect(view.result.current.value).toEqual(initial);
  expect(view.result.current.stale).toBe(true);
});
it("does not let later refetches overwrite edits in an active session", () => {
  const key = studioDraftKey(1, 2, "video", "7")!;
  const view = renderHook(({ revision }) => useHarness(key, revision), {
    initialProps: { revision: 2 },
  });
  act(() => view.result.current.setValue({ ...initial, url: "unsaved" }));
  view.rerender({ revision: 3 });
  expect(view.result.current.value.url).toBe("unsaved");
  expect(JSON.parse(localStorage.getItem(key)!).revision).toBe(2);
});
it("clears only the current setup; prompt definitions and other studios survive", () => {
  localStorage.setItem("unrelated-prompt", "keep");
  const other = studioDraftKey(1, 2, "insights")!;
  writeStudioDraft(other, { version: 1, value: { url: "keep" } });
  const key = studioDraftKey(1, 2, "creative")!;
  const view = renderHook(() => useHarness(key));
  act(() => {
    view.result.current.clear();
    view.result.current.setValue({ ...initial });
  });
  expect(localStorage.getItem("unrelated-prompt")).toBe("keep");
  expect(localStorage.getItem(other)).toContain("keep");
  expect(view.result.current.value).toEqual(initial);
});
it("rejects corrupt entries and preserves structurally valid unfinished fields", () => {
  localStorage.setItem("bad", "{");
  expect(readStudioDraft("bad", JSON.parse)).toBeNull();
  const draft = draftShapeSchema(
    z.object({
      url: z.string().url().max(100),
      title: z.string().min(1),
      enabled: z.boolean().default(false),
    })
  );
  expect(draft.safeParse({ url: "", title: "", enabled: false }).success).toBe(
    true
  );
  expect(draft.safeParse({ url: 5, title: "x", enabled: false }).success).toBe(
    false
  );
  expect(
    draft.safeParse({ url: "x".repeat(101), title: "x", enabled: false })
      .success
  ).toBe(false);
  expect(
    draft.parse({ url: "https://example.com", title: "Ready" }).enabled
  ).toBe(false);
});
