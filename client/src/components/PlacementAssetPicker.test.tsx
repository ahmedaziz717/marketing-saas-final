// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./ChannelConnections", () => ({ channelInput: "input" }));
import { PlacementAssetPicker } from "./PlacementAssetPicker";
afterEach(cleanup);
it("limits each slot to its size and retains selections in the other slots", () => {
  const assets = [
    ["Square", 1080],
    ["Portrait", 1350],
    ["Vertical", 1920],
  ].map(([name, height], i) => ({
    key: `asset:${i + 1}`,
    name,
    state: "approved",
    purpose: "finished",
    mediaType: "image",
    width: 1080,
    height,
    url: `/${i}.png`,
  })) as any;
  const onChange = vi.fn();
  render(
    <PlacementAssetPicker
      assets={assets}
      value={{ square: "asset:1" }}
      onChange={onChange}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose 9:16 image" }));
  expect(screen.queryByRole("button", { name: /Portrait/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Square/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Vertical/ }));
  fireEvent.click(screen.getByRole("button", { name: "Use selected assets" }));
  expect(onChange).toHaveBeenCalledWith({
    square: "asset:1",
    story: "asset:3",
  });
});
