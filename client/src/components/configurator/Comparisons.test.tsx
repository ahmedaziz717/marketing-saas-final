// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfigurationComparison } from "./Comparisons";
import {
  newConfiguration,
  readConfigurationSnapshot,
} from "@shared/creativeConfigurator";
afterEach(cleanup);
it("distinguishes two photos of the same product and displays their previews", () => {
  const before = newConfiguration(),
    after = newConfiguration();
  before.image.products = [
    { productId: 1, imageId: 2, includePrice: false, featuredSpecKeys: [] },
  ];
  after.image.products = [
    { productId: 1, imageId: 3, includePrice: false, featuredSpecKeys: [] },
  ];
  render(
    <ConfigurationComparison
      baseline={{ config: before, credits: 100, capturedAt: Date.now() }}
      current={after}
      credits={120}
      context={{
        products: [
          {
            id: 1,
            name: "Lamp",
            images: [
              { id: 2, url: "/front.png" },
              { id: 3, url: "/back.png" },
            ],
          },
        ],
        assets: [],
        references: [],
        logos: [],
        models: [],
      }}
      onClose={vi.fn()}
      onSwap={vi.fn()}
    />
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Show differences only" })
  );
  expect(screen.getByRole("rowheader", { name: "Source images" })).toBeTruthy();
  expect(screen.getByText("Lamp · Photo 1")).toBeTruthy();
  expect(screen.getByText("Lamp · Photo 2")).toBeTruthy();
  expect(
    screen.getAllByAltText("Source reference").map(e => e.getAttribute("src"))
  ).toEqual(["/front.png", "/back.png"]);
});
it("does not restore malformed comparison snapshots or invalid credit values", () => {
  const snapshot = {
    config: newConfiguration(),
    credits: 100,
    capturedAt: Date.now(),
  };
  expect(readConfigurationSnapshot(JSON.stringify(snapshot))?.credits).toBe(
    100
  );
  expect(
    readConfigurationSnapshot(JSON.stringify({ ...snapshot, credits: -1 }))
  ).toBeNull();
  expect(
    readConfigurationSnapshot(JSON.stringify({ ...snapshot, config: null }))
  ).toBeNull();
  expect(readConfigurationSnapshot("invalid")).toBeNull();
});
