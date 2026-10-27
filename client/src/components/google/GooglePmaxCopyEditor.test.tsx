// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GoogleAssetInput } from "@shared/googleCampaigns";
const f = vi.hoisted(() => ({ ai: null as any }));
vi.mock("./GooglePmaxAi", () => ({
  GooglePmaxAi: (props: any) => {
    f.ai = props;
    return <div>AI suggestions</div>;
  },
}));
import { GooglePmaxCopyEditor } from "./GooglePmaxCopyEditor";
afterEach(cleanup);
beforeEach(() => {
  f.ai = null;
});
const text = (
  field: GoogleAssetInput["field"],
  value: string
): GoogleAssetInput => ({
  field,
  source: { kind: "text", text: value },
});

it("forwards selected media and retained copy without changing anything on render", () => {
  const onChange = vi.fn();
  const assets: GoogleAssetInput[] = [
    {
      field: "SQUARE_MARKETING_IMAGE",
      source: { kind: "library", key: "asset:1" },
    },
    text("HEADLINE", "Draft headline"),
  ];
  render(
    <GooglePmaxCopyEditor
      organizationId={7}
      connectionId="connection"
      assets={assets}
      existing={[{ field: "HEADLINE", text: "Retained headline" }]}
      onChange={onChange}
    />
  );
  expect(f.ai.assets).toEqual(assets);
  expect(f.ai.connectionId).toBe("connection");
  expect(f.ai.existingCopy.headlines).toEqual([
    "Retained headline",
    "Draft headline",
  ]);
  expect(
    f.ai.occupiedFields.filter((field: string) => field === "HEADLINE")
  ).toHaveLength(2);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText("Retained headline")).toBeTruthy();
  expect(screen.queryByDisplayValue("Retained headline")).toBeNull();
});

it("explicit apply fills a blank slot, respects retained capacity, and preserves media and existing text", () => {
  const onChange = vi.fn();
  const media: GoogleAssetInput = {
    field: "SQUARE_MARKETING_IMAGE",
    source: { kind: "library", key: "asset:1" },
  };
  const assets = [media, text("HEADLINE", "")];
  const existing = Array.from({ length: 14 }, (_, i) => ({
    field: "HEADLINE",
    text: `Retained ${i}`,
  }));
  render(
    <GooglePmaxCopyEditor
      organizationId={7}
      connectionId="connection"
      assets={assets}
      existing={existing}
      onChange={onChange}
    />
  );
  expect(
    f.ai.occupiedFields.filter((field: string) => field === "HEADLINE")
  ).toHaveLength(14);
  f.ai.onApply([text("HEADLINE", "First new"), text("HEADLINE", "Second new")]);
  expect(onChange).toHaveBeenCalledWith([media, text("HEADLINE", "First new")]);
  expect(existing).toHaveLength(14);
});

it("rejects duplicates, overlong or empty suggestions without replacing selected text", () => {
  const onChange = vi.fn();
  const assets = [text("HEADLINE", "Existing draft")];
  render(
    <GooglePmaxCopyEditor
      organizationId={7}
      connectionId="connection"
      assets={assets}
      existing={[{ field: "HEADLINE", text: "Retained" }]}
      onChange={onChange}
    />
  );
  f.ai.onApply([
    text("HEADLINE", " retained "),
    text("HEADLINE", "EXISTING DRAFT"),
    text("HEADLINE", "x".repeat(31)),
    text("HEADLINE", " "),
    text("DESCRIPTION", "Valid"),
    text("DESCRIPTION", "valid"),
  ]);
  expect(onChange).toHaveBeenCalledWith([
    ...assets,
    text("DESCRIPTION", "Valid"),
  ]);
});

it("enforces 15/5/5 retained limits and allows editing/removing only draft entries", () => {
  const onChange = vi.fn();
  const existing = [
    ...Array.from({ length: 14 }, (_, i) => ({
      field: "HEADLINE",
      text: `H${i}`,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      field: "LONG_HEADLINE",
      text: `L${i}`,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      field: "DESCRIPTION",
      text: `D${i}`,
    })),
  ];
  const assets = [text("HEADLINE", "Draft")];
  render(
    <GooglePmaxCopyEditor
      organizationId={7}
      connectionId="connection"
      assets={assets}
      existing={existing}
      onChange={onChange}
    />
  );
  for (const name of ["Add headline", "Add long headline", "Add description"]) {
    expect(
      (screen.getByRole("button", { name }) as HTMLButtonElement).disabled
    ).toBe(true);
  }
  fireEvent.change(screen.getByDisplayValue("Draft"), {
    target: { value: "Edited" },
  });
  expect(onChange).toHaveBeenLastCalledWith([text("HEADLINE", "Edited")]);
  fireEvent.click(screen.getByText("Remove draft headline 1"));
  expect(onChange).toHaveBeenLastCalledWith([]);
  expect(existing).toHaveLength(24);
});

it("replaces only the explicitly selected draft text and rejects stale or mismatched targets", () => {
  const onChange = vi.fn();
  const media: GoogleAssetInput = {
    field: "MARKETING_IMAGE",
    source: { kind: "library", key: "asset:1" },
  };
  const assets = [
    media,
    text("HEADLINE", "Original"),
    text("DESCRIPTION", "Keep description"),
  ];
  const { rerender } = render(
    <GooglePmaxCopyEditor
      organizationId={7}
      connectionId="connection"
      assets={assets}
      onChange={onChange}
    />
  );
  const id = f.ai.replacementOptions.find(
    (option: any) => option.field === "headlines"
  ).id;
  f.ai.onReplace(id, text("DESCRIPTION", "Wrong field"));
  expect(onChange).not.toHaveBeenCalled();
  f.ai.onReplace(id, text("HEADLINE", "New headline"));
  expect(onChange).toHaveBeenCalledWith([
    media,
    text("HEADLINE", "New headline"),
    assets[2],
  ]);
  onChange.mockClear();
  rerender(
    <GooglePmaxCopyEditor
      organizationId={7}
      connectionId="connection"
      assets={[media, text("HEADLINE", "Edited since selection")]}
      onChange={onChange}
    />
  );
  f.ai.onReplace(id, text("HEADLINE", "Stale replacement"));
  expect(onChange).not.toHaveBeenCalled();
});

it("replaces retained Google copy only through the explicit association callback", () => {
  const onChange = vi.fn(),
    onReplaceExisting = vi.fn();
  render(
    <GooglePmaxCopyEditor
      organizationId={7}
      connectionId="connection"
      assets={[]}
      existing={[{ assetId: "123", field: "HEADLINE", text: "Retained" }]}
      onChange={onChange}
      onReplaceExisting={onReplaceExisting}
    />
  );
  const id = f.ai.replacementOptions[0].id;
  f.ai.onReplace(id, text("HEADLINE", "retained"));
  f.ai.onReplace(id, text("HEADLINE", "x".repeat(31)));
  expect(onReplaceExisting).not.toHaveBeenCalled();
  f.ai.onReplace(id, text("HEADLINE", "New headline"));
  expect(onReplaceExisting).toHaveBeenCalledWith(
    { assetId: "123", field: "HEADLINE" },
    text("HEADLINE", "New headline")
  );
  expect(onChange).not.toHaveBeenCalled();
});

it("shares explicit Display acceptance while preserving text and format-specific capacity", () => {
  const onChange = vi.fn();
  const assets = [
    text("HEADLINE", "Keep me"),
    text("LONG_HEADLINE", "Keep long"),
  ];
  render(
    <GooglePmaxCopyEditor
      adType="DISPLAY"
      organizationId={7}
      connectionId="account"
      assets={assets}
      onChange={onChange}
    />
  );
  expect(f.ai.adType).toBe("DISPLAY");
  expect(screen.getByText("Long headlines · 1/1")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Add long headline" })
  ).toHaveProperty("disabled", true);
  expect(onChange).not.toHaveBeenCalled();
  f.ai.onApply([
    ...Array.from({ length: 8 }, (_, i) => text("HEADLINE", `Idea ${i}`)),
    text("LONG_HEADLINE", "Do not overwrite"),
  ]);
  const next = onChange.mock.calls[0][0] as GoogleAssetInput[];
  expect(next.filter(a => a.field === "HEADLINE")).toHaveLength(5);
  expect(next.find(a => a.field === "LONG_HEADLINE")).toEqual(assets[1]);
  expect(next.find(a => a.field === "HEADLINE")).toEqual(assets[0]);
});
