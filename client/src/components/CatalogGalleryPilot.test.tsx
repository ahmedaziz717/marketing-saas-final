// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CatalogGalleryPilot } from "./CatalogGalleryPilot";
const state = vi.hoisted(() => ({
  preview: vi.fn(),
  queue: vi.fn(),
  resume: vi.fn(),
  save: vi.fn(),
  settings: null as any,
  status: null as any,
}));
vi.mock("@/lib/trpc", async () => {
  const { useState } = await import("react");
  const mutation = (fn: any) => () => {
    const [data, setData] = useState<any>();
    return {
      data,
      isPending: false,
      isSuccess: !!data,
      reset: () => setData(undefined),
      mutateAsync: async (input: unknown) => {
        const value = await fn(input);
        setData(value);
        return value;
      },
    };
  };
  return {
    trpc: {
      catalogSources: {
        galleryRecipeSettings: {
          useQuery: () => ({ data: state.settings, refetch: vi.fn() }),
        },
        saveGalleryRecipe: { useMutation: mutation(state.save) },
        galleryPilotProducts: {
          useQuery: () => ({
            data: [{ id: 7, name: "Selected system", externalId: "system-a" }],
          }),
        },
        galleryPilotStatus: {
          useQuery: () => ({ data: state.status, refetch: vi.fn() }),
        },
        previewGalleryPilot: { useMutation: mutation(state.preview) },
        queueGalleryPilot: { useMutation: mutation(state.queue) },
        action: { useMutation: mutation(state.resume) },
      },
    },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.status = null;
  state.settings = null;
});

it("reuses a saved recipe but requires an explicit reviewed source save without importing", async () => {
  state.preview.mockResolvedValue({
    token: { ciphertext: "review", iv: "iv", tag: "tag" },
    productName: "Selected system",
    distinctImages: 8,
    cachedImages: 1,
    groups: [{}],
    groupsAdded: [],
    groupsReplaced: ["system"],
    maximumNewImages: 7,
    existingImagesReferenced: [1],
    maximumImageAttempts: 24,
  });
  state.settings = {
    updatedAtMs: 42,
    recipeOrigin: "saved",
    recipe: {
      detailIdentityPath: "code",
      detailUrlTemplate: "https://source.example/{code}",
    },
    coverage: [{ id: 7, imageCount: 1, groupCount: 0 }],
  };
  state.save.mockResolvedValue({ saved: true, queued: false });
  render(
    <CatalogGalleryPilot
      organizationId={3}
      sourceId={1}
      onQueued={async () => {}}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Repair one product gallery" })
  );
  expect(screen.getByText(/one or no stored photo/)).toBeTruthy();
  expect(
    (
      screen.getByLabelText(
        "Reviewed gallery recipe (JSON)"
      ) as HTMLTextAreaElement
    ).value
  ).toContain("https://source.example/{code}");
  fireEvent.change(screen.getByLabelText("Product"), {
    target: { value: "7" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Preview gallery repair" })
  );
  const save = await screen.findByRole("button", {
    name: "Save reviewed source recipe",
  });
  expect((save as HTMLButtonElement).disabled).toBe(true);
  expect(state.save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByLabelText("Use this recipe for future source syncs")
  );
  fireEvent.click(save);
  await waitFor(() =>
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 3,
        sourceId: 1,
        expectedUpdatedAtMs: 42,
        confirmed: true,
      })
    )
  );
  expect(state.queue).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Confirm this product only" })
  ).toBeNull();
  expect(screen.getByText(/No import was started/)).toBeTruthy();
});
it("requires a preview and separate confirmation, invalidates review when inputs change, and does not auto-import", async () => {
  state.preview.mockResolvedValue({
    token: { ciphertext: "review", iv: "iv", tag: "tag" },
    productName: "Selected system",
    distinctImages: 183,
    cachedImages: 0,
    groups: Array(21).fill({}),
    groupsAdded: Array(21).fill("group"),
    groupsReplaced: [],
    maximumNewImages: 183,
    existingImagesReferenced: [],
    maximumImageAttempts: 549,
  });
  state.queue.mockResolvedValue({ queued: true });
  render(
    <CatalogGalleryPilot
      organizationId={3}
      sourceId={1}
      onQueued={async () => {}}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Repair one product gallery" })
  );
  fireEvent.change(screen.getByLabelText("Product"), {
    target: { value: "7" },
  });
  fireEvent.change(screen.getByLabelText("Reviewed gallery recipe (JSON)"), {
    target: { value: '{"detailUrlTemplate":"https://source.example/{code}"}' },
  });
  expect(state.queue).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Preview gallery repair" })
  );
  await screen.findByRole("button", { name: "Confirm this product only" });
  expect(state.preview).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: 3, sourceId: 1, productId: 7 })
  );
  expect(state.queue).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Detail response product ID field"), {
    target: { value: "id" },
  });
  expect(
    screen.queryByRole("button", { name: "Confirm this product only" })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Preview gallery repair" })
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm this product only" })
  );
  await waitFor(() =>
    expect(state.queue).toHaveBeenCalledWith({
      organizationId: 3,
      sourceId: 1,
      token: { ciphertext: "review", iv: "iv", tag: "tag" },
    })
  );
});
it("shows resumable progress and prevents replacing the pending pilot", () => {
  state.status = {
    externalId: "system-a",
    processed: 12,
    total: 183,
    completed: false,
    status: "error",
    error: "Image unavailable",
  };
  render(
    <CatalogGalleryPilot
      organizationId={3}
      sourceId={1}
      onQueued={async () => {}}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Repair one product gallery" })
  );
  expect(screen.getByRole("status").textContent).toContain("12 / 183");
  expect((screen.getByLabelText("Product") as HTMLSelectElement).disabled).toBe(
    true
  );
  expect(
    screen.getByRole("button", { name: "Resume gallery repair" })
  ).toBeTruthy();
  expect(state.resume).not.toHaveBeenCalled();
});
