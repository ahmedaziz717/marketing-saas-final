// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LibraryAsset } from "@shared/assetLibrary";
import { StudioAssetTiles } from "./StudioAssetTiles";
afterEach(cleanup);
const image = {
  key: "asset:1",
  name: "Square image",
  mediaType: "image",
  state: "approved",
  purpose: "finished",
  width: 1080,
  height: 1080,
  url: "/image.webp",
  origin: "generated",
  mimeType: "image/webp",
  isUgc: false,
  revision: "a".repeat(64),
  fingerprint: "a".repeat(64),
  parentKey: null,
  createdAtMs: 1,
  reviewedAtMs: null,
  reviewedByUserId: null,
} satisfies LibraryAsset;
it("only shows approved finished assets inline, filters by dimensions and selects without a popup", () => {
  const onSelect = vi.fn();
  render(
    <StudioAssetTiles
      assets={[
        image,
        { ...image, key: "asset:2", name: "Draft", state: "draft" },
        { ...image, key: "asset:3", name: "Source", purpose: "source" },
        { ...image, key: "asset:4", name: "Portrait image", height: 1350 },
      ]}
      channel="meta_ads"
      selected={[]}
      onSelect={onSelect}
    />
  );
  expect(screen.queryByRole("button", { name: "Select Draft" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Select Source" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Asset dimensions" }), {
    target: { value: "portrait" },
  });
  expect(
    screen.queryByRole("button", { name: "Select Square image" })
  ).toBeNull();
  expect(screen.getByText("Portrait · 4:5 · 1080 × 1350 px")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Select Portrait image" })
  );
  expect(onSelect).toHaveBeenCalledWith(["asset:4"]);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("restricts placement slots to their ratio and carousel selections to ten while allowing removal", () => {
  const assets = Array.from({ length: 11 }, (_, i) => ({
    ...image,
    key: `asset:${i + 1}` as const,
    name: `Image ${i + 1}`,
  }));
  const onSelect = vi.fn();
  const view = render(
    <StudioAssetTiles
      assets={assets}
      channel="meta_ads"
      selected={assets.slice(0, 10).map(a => a.key)}
      multiple
      onSelect={onSelect}
    />
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Select Image 11",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Select Image 1" }));
  expect(onSelect.mock.calls[0][0]).toHaveLength(9);
  view.rerender(
    <StudioAssetTiles
      assets={assets}
      channel="meta_ads"
      selected={[]}
      requiredFormat="story"
      onSelect={onSelect}
    />
  );
  expect(screen.queryByRole("button", { name: "Select Image 1" })).toBeNull();
});
