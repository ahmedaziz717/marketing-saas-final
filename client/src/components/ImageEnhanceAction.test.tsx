// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultCreativeSetup } from "@shared/creativeBuilder";
import { DEFAULT_IMAGE_MODEL, generationModel } from "@shared/modelCatalog";
import type { LibraryAsset } from "@shared/assetLibrary";
import { ImageEnhanceAction } from "./ImageEnhanceAction";

const api = vi.hoisted(() => ({
  save: vi.fn(),
  generate: vi.fn(),
  initial: {} as any,
  job: undefined as any,
  invalidate: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      assetLibrary: {
        studioList: { invalidate: api.invalidate },
        list: { invalidate: api.invalidate },
      },
      models: { credits: { invalidate: api.invalidate } },
    }),
    models: {
      studioCatalog: {
        useQuery: () => ({
          data: [
            {
              ...generationModel(DEFAULT_IMAGE_MODEL),
              id: DEFAULT_IMAGE_MODEL,
              routeId: DEFAULT_IMAGE_MODEL,
              enabled: true,
            },
          ],
        }),
      },
    },
    creativeBuilder: {
      enhancementSetup: { useQuery: () => ({ data: api.initial }) },
      quote: { useQuery: () => ({ data: { credits: 24 }, isFetching: false }) },
      save: { useMutation: () => ({ mutateAsync: api.save }) },
      generate: { useMutation: () => ({ mutateAsync: api.generate }) },
      studioJob: { useQuery: () => ({ data: api.job }) },
    },
  },
}));
vi.mock("./ModelPicker", () => ({ ModelSettings: () => null }));
const asset: LibraryAsset = {
  key: "creative:19",
  name: "CLX ad",
  origin: "generated",
  mediaType: "image",
  mimeType: "image/png",
  revision: "a".repeat(64),
  url: "/media/ad.png",
  purpose: "finished",
  isUgc: false,
  state: "draft",
  fingerprint: "a".repeat(64),
  parentKey: null,
  createdAtMs: 1,
  reviewedAtMs: null,
  reviewedByUserId: null,
};
beforeEach(() => {
  api.initial = {
    setup: {
      ...defaultCreativeSetup(),
      modelId: DEFAULT_IMAGE_MODEL,
      preserveProduct: true,
      enhancement: {
        assetKey: asset.key,
        revision: asset.revision,
        instruction:
          "Recreate this CLX Gaming product advertisement as a stunning, professional ad creative with dramatically improved visual quality.",
      },
    },
    width: 1080,
    height: 1080,
    canPreserveProductOverlay: true,
  };
  api.save.mockReset().mockResolvedValue({ briefId: 42, updatedAtMs: 123 });
  api.generate.mockReset().mockResolvedValue({ jobId: 7 });
  api.invalidate.mockClear();
  api.job = undefined;
});
afterEach(cleanup);

it("quotes without generating, preserves the overlay choice, and reuses the same request after a network failure", async () => {
  render(<ImageEnhanceAction asset={asset} organizationId={3} />);
  fireEvent.click(screen.getByRole("button", { name: "Enhance image" }));
  const dialog = within(screen.getByRole("dialog"));
  const action = dialog.getByRole("button", {
    name: "Enhance image",
  }) as HTMLButtonElement;
  await waitFor(() => expect(action.disabled).toBe(false));
  expect(
    dialog
      .getByRole("radio", { name: /Preserve overlay/ })
      .getAttribute("aria-checked")
  ).toBe("true");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.generate).not.toHaveBeenCalled();
  api.generate.mockRejectedValueOnce(new Error("Connection interrupted"));
  fireEvent.click(action);
  await screen.findByText("Connection interrupted");
  await waitFor(() => expect(action.disabled).toBe(false));
  fireEvent.click(action);
  await waitFor(() => expect(api.generate).toHaveBeenCalledTimes(2));
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(api.save.mock.calls[0][0].setup).toMatchObject({
    preserveProduct: true,
    enhancement: { assetKey: asset.key, revision: asset.revision },
  });
  expect(api.generate.mock.calls[1][0]).toEqual(api.generate.mock.calls[0][0]);
  expect(api.generate.mock.calls[0][0]).toMatchObject({
    organizationId: 3,
    briefId: 42,
    quotedCredits: 24,
  });
});

it("explains invalid instructions and saves a completed result for review without approval", async () => {
  const onSaved = vi.fn();
  const view = render(
    <ImageEnhanceAction asset={asset} organizationId={3} onSaved={onSaved} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Enhance image" }));
  const dialog = within(screen.getByRole("dialog"));
  const direction = dialog.getByRole("textbox", {
    name: "Enhancement direction",
  });
  fireEvent.change(direction, { target: { value: "Better" } });
  expect(dialog.getByRole("alert").textContent).toContain(
    "at least 20 characters"
  );
  expect(
    (dialog.getByRole("button", { name: "Enhance image" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  fireEvent.change(direction, {
    target: { value: api.initial.setup.enhancement.instruction },
  });
  await waitFor(() =>
    expect(
      (
        dialog.getByRole("button", {
          name: "Enhance image",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  fireEvent.click(dialog.getByRole("button", { name: "Enhance image" }));
  await waitFor(() => expect(api.generate).toHaveBeenCalledTimes(1));
  api.job = {
    status: "completed",
    variants: [{ id: 24, url: "/media/enhanced.png" }],
  };
  view.rerender(
    <ImageEnhanceAction asset={asset} organizationId={3} onSaved={onSaved} />
  );
  await screen.findByRole("button", { name: "Review enhanced image" });
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(api.invalidate).toHaveBeenCalledTimes(3);
  expect(dialog.getByRole("img", { name: "CLX ad" }).getAttribute("src")).toBe(
    asset.url
  );
  expect(
    dialog.getByRole("img", { name: "Enhanced draft" }).getAttribute("src")
  ).toBe("/media/enhanced.png");
});
