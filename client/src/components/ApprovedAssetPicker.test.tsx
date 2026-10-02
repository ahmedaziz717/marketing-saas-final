// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./ChannelConnections", () => ({ channelInput: "input" }));
import { ApprovedAssetPicker } from "./ApprovedAssetPicker";
afterEach(cleanup);
it("explains ratios and example pixel sizes while showing each image’s actual dimensions", () => {
  const assets = [
    ["Small square", 1080, 1080],
    ["Large square", 1200, 1200],
    ["Portrait image", 1080, 1350],
  ].map(([name, width, height], i) => ({
    key: `asset:${i + 1}`,
    name,
    width,
    height,
    state: "approved",
    purpose: "finished",
    mediaType: "image",
    url: `/image-${i}.png`,
  })) as any;
  const choose = vi.fn();
  render(
    <ApprovedAssetPicker
      assets={assets}
      channel="meta_ads"
      multiple={false}
      selected={[]}
      onSelect={choose}
      onClose={() => {}}
    />
  );
  expect(
    screen.getByRole("option", { name: /Square · 1:1 · e.g. 1080 × 1080 px/ })
  ).toBeTruthy();
  expect(
    screen.getByRole("option", { name: /Portrait · 4:5 · e.g. 1080 × 1350 px/ })
  ).toBeTruthy();
  expect(
    screen.getByRole("option", {
      name: /Stories \/ Reels · 9:16 · e.g. 1080 × 1920 px/,
    })
  ).toBeTruthy();
  expect(
    screen.getByRole("option", {
      name: /Landscape · 1.91:1 · e.g. 1200 × 628 px/,
    })
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Asset dimensions" }), {
    target: { value: "square" },
  });
  expect(screen.queryByRole("button", { name: /Portrait image/ })).toBeNull();
  expect(
    screen.getByRole("button", { name: /Small square/ }).textContent
  ).toContain("1:1 · 1080 × 1080 px");
  expect(
    screen.getByRole("button", { name: /Large square/ }).textContent
  ).toContain("1:1 · 1200 × 1200 px");
  fireEvent.change(screen.getByRole("combobox", { name: "Asset dimensions" }), {
    target: { value: "portrait" },
  });
  expect(screen.queryByRole("button", { name: /Small square/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Portrait image/ }));
  fireEvent.click(screen.getByRole("button", { name: "Use selected assets" }));
  expect(choose).toHaveBeenCalledWith(["asset:3"]);
});
it("shows compatible approved thumbnails and submits the chosen carousel order", () => {
  const assets = ["One", "Two", "Pending", "Portrait"].map((name, i) => ({
    key: `asset:${i + 1}`,
    name,
    state: i === 2 ? "draft" : "approved",
    purpose: "finished",
    mediaType: "image",
    width: 1080,
    height: i === 3 ? 1350 : 1080,
    url: `/image-${i}.png`,
  })) as any;
  const choose = vi.fn();
  render(
    <ApprovedAssetPicker
      assets={assets}
      channel="meta_ads"
      multiple
      selected={[]}
      onSelect={choose}
      onClose={() => {}}
    />
  );
  expect(screen.queryByText("Pending")).toBeNull();
  expect(screen.queryByText("Portrait")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Two/ }));
  expect(
    (
      screen.getByRole("button", {
        name: "Use selected assets",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /One/ }));
  fireEvent.click(screen.getByRole("button", { name: "Use selected assets" }));
  expect(choose).toHaveBeenCalledWith(["asset:2", "asset:1"]);
});
