// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  library: [] as any[],
  resources: [] as any[],
  refreshLibrary: vi.fn(),
  refreshRemote: vi.fn(),
  remoteError: null as null | { message: string },
  publish: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ membership: { role: "owner" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    assetLibrary: {
      list: {
        useQuery: () => ({ data: api.library, refetch: api.refreshLibrary }),
      },
    },
    googleAds: {
      campaigns: {
        resources: {
          useQuery: () => ({
            data: api.resources,
            error: api.remoteError,
            refetch: api.refreshRemote,
          }),
        },
      },
    },
  },
}));
vi.mock("./GooglePmaxAi", () => ({ GooglePmaxAi: () => null }));
vi.mock("./GoogleVideoTransfer", () => ({ GoogleVideoTransfer: () => null }));
vi.mock("@/components/AssetUploadDialog", () => ({
  AssetUploadDialog: () => null,
}));
import { AssetEditor } from "./GoogleAdEditor";
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
beforeEach(() => {
  vi.clearAllMocks();
  api.library = [];
  api.resources = [];
  api.remoteError = null;
});
afterEach(cleanup);

it("shows approved generated creatives independently of Google account resource failures and refreshes the EL source", () => {
  api.library = [
    {
      key: "creative:99",
      name: "Approved generated creative",
      width: 1200,
      height: 628,
      state: "approved",
      mediaType: "image",
      channel: "meta_ads",
      url: "https://example.com/creative.png",
    },
    {
      key: "creative:100",
      name: "Unapproved generated creative",
      state: "draft",
      mediaType: "image",
      url: "https://example.com/draft.png",
    },
  ];
  api.remoteError = { message: "Google account access expired" };
  const onChange = vi.fn();
  const view = render(
    <AssetEditor
      organizationId={1}
      connectionId="first-google-account"
      format="image"
      assets={[]}
      onChange={onChange}
    />
  );
  expect(
    screen.getByRole("button", { name: "Select Approved generated creative" })
  ).toBeTruthy();
  expect(screen.queryByText("Google account access expired")).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: "Select Unapproved generated creative",
    })
  ).toBeNull();
  click("Refresh EvokeLoop library");
  expect(api.refreshLibrary).toHaveBeenCalledTimes(1);
  expect(api.refreshRemote).not.toHaveBeenCalled();
  view.rerender(
    <AssetEditor
      organizationId={1}
      connectionId="second-google-account"
      format="image"
      assets={[]}
      onChange={onChange}
    />
  );
  click("Select Approved generated creative");
  expect(onChange).toHaveBeenCalledWith([
    {
      field: "MARKETING_IMAGE",
      source: { kind: "library", key: "creative:99" },
    },
  ]);
  click("Select Google Ads Library");
  expect(screen.getByText("Google account access expired")).toBeTruthy();
  click("Select EvokeLoop Library");
  expect(screen.queryByText("Google account access expired")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Select Approved generated creative" })
  ).toBeTruthy();
  expect(api.publish).not.toHaveBeenCalled();
});

it("does not leave the Google creative grid blank when a refresh shrinks a later page", () => {
  api.library = Array.from({ length: 25 }, (_, i) => ({
    key: `creative:${i + 1}`,
    name: `Creative ${i + 1}`,
    state: "approved",
    mediaType: "image",
    url: "https://example.com/creative.png",
  }));
  const props = {
    organizationId: 1,
    connectionId: "google",
    format: "image" as const,
    assets: [],
    onChange: vi.fn(),
  };
  const view = render(<AssetEditor {...props} />);
  click("Next assets");
  click("Next assets");
  expect(
    screen.getByRole("button", { name: "Select Creative 25" })
  ).toBeTruthy();
  api.library = api.library.slice(0, 2);
  view.rerender(<AssetEditor {...props} />);
  expect(
    screen.getByRole("button", { name: "Select Creative 1" })
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Select Creative 2" })
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Next assets" })).toBeNull();
});

it("resets paging across asset types and sources without dropping selected draft assets", () => {
  api.library = Array.from({ length: 14 }, (_, i) => ({
    key: `creative:${i + 1}`,
    name: `Creative ${i + 1}`,
    state: "approved",
    mediaType: "image",
    url: "https://example.com/creative.png",
  }));
  api.library.push({
    key: "asset:50",
    name: "Approved video",
    state: "approved",
    mediaType: "video",
    url: "https://example.com/video.mp4",
  });
  const props = {
    organizationId: 1,
    connectionId: "google",
    assets: [
      {
        field: "MARKETING_IMAGE" as const,
        source: { kind: "library" as const, key: "creative:1" },
      },
    ],
    onChange: vi.fn(),
  };
  const view = render(<AssetEditor {...props} format="image" />);
  click("Next assets");
  view.rerender(<AssetEditor {...props} format="video" />);
  expect(
    screen.getByRole("button", { name: "Select Approved video" })
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Select Creative 1" })
  ).toBeNull();
  expect(screen.getByText("Selected for this draft · 1")).toBeTruthy();
  view.rerender(<AssetEditor {...props} format="image" />);
  expect(
    screen
      .getByRole("button", { name: "Select Creative 1" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(props.onChange).not.toHaveBeenCalled();
});

it("detects each image independently instead of tagging square images as landscape", () => {
  api.library = [
    {
      key: "creative:95",
      name: "Square",
      state: "approved",
      mediaType: "image",
      width: 1080,
      height: 1080,
    },
    {
      key: "creative:96",
      name: "Portrait",
      state: "approved",
      mediaType: "image",
      width: 960,
      height: 1200,
    },
  ];
  const onChange = vi.fn();
  const props = {
    organizationId: 1,
    connectionId: "google",
    format: "image" as const,
    onChange,
  };
  const view = render(<AssetEditor {...props} assets={[]} />);
  click("Select Square");
  expect(onChange.mock.calls[0][0][0].field).toBe("SQUARE_MARKETING_IMAGE");
  view.rerender(<AssetEditor {...props} assets={onChange.mock.calls[0][0]} />);
  click("Select Portrait");
  expect(onChange.mock.calls[1][0].map((a: any) => a.field)).toEqual([
    "SQUARE_MARKETING_IMAGE",
    "PORTRAIT_MARKETING_IMAGE",
  ]);
  click("Select Square");
  expect(onChange.mock.calls[2][0]).toEqual([]);
});
it("does not guess unknown dimensions, and uses loaded full image dimensions when available", () => {
  api.library = [
    {
      key: "creative:95",
      name: "Unknown",
      state: "approved",
      mediaType: "image",
      url: "https://example.com/image.png",
    },
  ];
  const onChange = vi.fn();
  render(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      format="image"
      assets={[]}
      onChange={onChange}
    />
  );
  click("Select Unknown");
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain(
    "Dimensions unavailable"
  );
  const image = screen.getByAltText("Unknown");
  Object.defineProperties(image, {
    naturalWidth: { value: 1080 },
    naturalHeight: { value: 1080 },
  });
  fireEvent.load(image);
  click("Select Unknown");
  expect(onChange.mock.calls[0][0][0].field).toBe("SQUARE_MARKETING_IMAGE");
});
it("keeps logos explicit and blocks a known incompatible manual image placement", () => {
  api.library = [
    {
      key: "creative:95",
      name: "Square",
      state: "approved",
      mediaType: "image",
      width: 1080,
      height: 1080,
    },
  ];
  const onChange = vi.fn();
  const view = render(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      format="image"
      assets={[]}
      onChange={onChange}
    />
  );
  fireEvent.click(
    screen.getByRole("radio", { name: "Landscape image · 1.91:1" })
  );
  click("Select Square");
  expect(onChange).not.toHaveBeenCalled();
  view.rerender(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      format="logo"
      assets={[]}
      onChange={onChange}
    />
  );
  expect(
    screen.queryByRole("radio", { name: "Automatic image size · recommended" })
  ).toBeNull();
  click("Select Square");
  expect(onChange.mock.calls[0][0][0].field).toBe("LOGO");
});
it("offers an explicit correction for a legacy square image saved as landscape", () => {
  api.library = [
    {
      key: "creative:95",
      name: "Square",
      state: "approved",
      mediaType: "image",
      width: 1080,
      height: 1080,
    },
  ];
  const onChange = vi.fn();
  render(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      format="image"
      assets={[
        {
          field: "MARKETING_IMAGE",
          source: { kind: "library", key: "creative:95" },
        },
      ]}
      onChange={onChange}
    />
  );
  expect(onChange).not.toHaveBeenCalled();
  click("Use detected Square image · 1:1");
  expect(onChange.mock.calls[0][0][0].field).toBe("SQUARE_MARKETING_IMAGE");
});

it("shows the twenty-image selection limit without blocking removal or replacement review", () => {
  api.library = [
    {
      key: "creative:95",
      name: "Square",
      state: "approved",
      mediaType: "image",
      width: 1080,
      height: 1080,
    },
  ];
  const onChange = vi.fn();
  const selected = Array.from({ length: 20 }, (_, i) => ({
    field: "SQUARE_MARKETING_IMAGE" as const,
    source: { kind: "library" as const, key: `creative:${i + 1}` },
  }));
  render(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      format="image"
      assets={selected}
      onChange={onChange}
    />
  );
  expect(screen.getByText(/20\/20 images selected/)).toBeTruthy();
  click("Select Square");
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("up to 20 images");
  fireEvent.click(screen.getByLabelText("Remove selected asset 1"));
  expect(onChange.mock.calls[0][0]).toHaveLength(19);
});

it("deduplicates an explicit correction when the square placement is already selected", () => {
  api.library = [
    {
      key: "creative:95",
      name: "Square",
      state: "approved",
      mediaType: "image",
      width: 1080,
      height: 1080,
    },
  ];
  const onChange = vi.fn();
  const source = { kind: "library" as const, key: "creative:95" };
  render(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      format="image"
      assets={[
        { field: "MARKETING_IMAGE", source },
        { field: "SQUARE_MARKETING_IMAGE", source },
      ]}
      onChange={onChange}
    />
  );
  click("Use detected Square image · 1:1");
  expect(onChange).toHaveBeenCalledWith([
    { field: "SQUARE_MARKETING_IMAGE", source },
  ]);
});
it("a late image load never silently changes a saved selection", () => {
  api.library = [
    {
      key: "creative:95",
      name: "Unknown",
      state: "approved",
      mediaType: "image",
      url: "https://example.com/image.png",
    },
  ];
  const onChange = vi.fn();
  render(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      format="image"
      assets={[
        {
          field: "MARKETING_IMAGE",
          source: { kind: "library", key: "creative:95" },
        },
      ]}
      onChange={onChange}
    />
  );
  const image = screen.getByAltText("Unknown");
  Object.defineProperties(image, {
    naturalWidth: { value: 1080 },
    naturalHeight: { value: 1080 },
  });
  fireEvent.load(image);
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByLabelText("Remove selected asset 1").closest("li")?.textContent
  ).toContain("Landscape image · 1.91:1");
});

it("does not impose Performance Max asset-group messaging on display ads", () => {
  render(
    <AssetEditor
      organizationId={1}
      connectionId="google"
      adType="DISPLAY"
      format="image"
      assets={[]}
      onChange={vi.fn()}
    />
  );
  expect(screen.queryByText(/images selected for this draft/)).toBeNull();
});
