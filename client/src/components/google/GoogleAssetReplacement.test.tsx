// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GoogleAssetReplacement } from "./GoogleAssetReplacement";
import {
  pmaxChangedAssetIssues,
  pmaxImageCapacity,
  type GoogleChange,
} from "@shared/googleCampaigns";
afterEach(cleanup);
const assets = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    assetGroup: { id: "22" },
    asset: {
      id: String(i + 1),
      name: `Photo ${i + 1}`,
      imageAsset: { fullSize: { url: `https://example.test/${i}.png` } },
    },
    assetGroupAsset: { resourceName: `link${i}`, fieldType: "MARKETING_IMAGE" },
  }));
const change: Extract<GoogleChange, { kind: "asset_group_assets" }> = {
  kind: "asset_group_assets",
  campaignId: "11",
  assetGroupId: "22",
  add: [
    {
      field: "MARKETING_IMAGE",
      source: { kind: "library", key: "creative:95" },
    },
  ],
  remove: [],
};
it("keeps all existing assets by default and never exposes irrelevant text removals", () => {
  const onChange = vi.fn();
  render(
    <GoogleAssetReplacement
      change={change}
      assets={assets(5)}
      onChange={onChange}
    />
  );
  expect(screen.getByText("Existing assets are kept")).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
it("requires deliberate replacement selection at capacity and supports cancellation", () => {
  const onChange = vi.fn();
  const view = render(
    <GoogleAssetReplacement
      change={change}
      assets={assets(20)}
      onChange={onChange}
    />
  );
  expect(
    screen.getAllByRole("checkbox").every(e => !(e as HTMLInputElement).checked)
  ).toBe(true);
  fireEvent.click(screen.getByLabelText(/Replace Photo 1 ·/));
  const next = onChange.mock.calls[0][0];
  expect(next.remove).toEqual([{ assetId: "1", field: "MARKETING_IMAGE" }]);
  view.rerender(
    <GoogleAssetReplacement
      change={next}
      assets={assets(20)}
      onChange={onChange}
    />
  );
  expect(
    (screen.getByLabelText(/Replace Photo 2 ·/) as HTMLInputElement).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Cancel replacements/ }));
  expect(onChange.mock.calls.at(-1)![0].remove).toEqual([]);
});
it("counts only the selected group and avoids counting an already-linked asset twice", () => {
  const existing = [{ assetId: "999", field: "MARKETING_IMAGE" }];
  expect(
    pmaxImageCapacity(existing, [
      { field: "MARKETING_IMAGE", source: { kind: "existing", id: "999" } },
    ])[0].added
  ).toBe(0);
  const onChange = vi.fn();
  render(
    <GoogleAssetReplacement
      change={change}
      assets={assets(20).map(a => ({ ...a, assetGroup: { id: "other" } }))}
      onChange={onChange}
    />
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it("validates only changed fields locally while preserving changed-type minima and maxima", () => {
  expect(
    pmaxChangedAssetIssues(
      [
        ...Array(21).fill("HEADLINE"),
        ...Array(6).fill("DESCRIPTION"),
        "MARKETING_IMAGE",
      ],
      ["MARKETING_IMAGE"]
    )
  ).toEqual([]);
  expect(
    pmaxChangedAssetIssues(Array(21).fill("MARKETING_IMAGE"), [
      "MARKETING_IMAGE",
    ])
  ).toHaveLength(1);
  expect(
    pmaxChangedAssetIssues(["HEADLINE"], ["HEADLINE"])[0].message
  ).toContain("Add 2 more");
});
it("counts all image orientations together and protects the last required image orientation", () => {
  const mixed = assets(19).concat([
    {
      ...assets(1)[0],
      asset: { ...assets(1)[0].asset, id: "square", name: "Only square" },
      assetGroupAsset: {
        resourceName: "square-link",
        fieldType: "SQUARE_MARKETING_IMAGE",
      },
    },
  ]);
  render(
    <GoogleAssetReplacement change={change} assets={mixed} onChange={vi.fn()} />
  );
  expect(screen.getByText("Choose images to replace")).toBeTruthy();
  expect(
    (screen.getByLabelText(/Replace Only square/) as HTMLInputElement).disabled
  ).toBe(true);
  expect(
    (screen.getByLabelText(/Replace Photo 1 ·/) as HTMLInputElement).disabled
  ).toBe(false);
});
it("describes a legacy removal-only draft honestly and lets the user cancel it", () => {
  const onChange = vi.fn();
  render(
    <GoogleAssetReplacement
      change={{
        ...change,
        add: [],
        remove: [{ assetId: "1", field: "MARKETING_IMAGE" }],
      }}
      assets={assets(2)}
      onChange={onChange}
    />
  );
  expect(screen.getByText("Review selected removals")).toBeTruthy();
  expect(screen.getByText(/will be removed on confirmation/)).toBeTruthy();
  expect(screen.queryByText("Existing assets are kept")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Cancel removals/ }));
  expect(onChange.mock.calls[0][0].remove).toEqual([]);
});
