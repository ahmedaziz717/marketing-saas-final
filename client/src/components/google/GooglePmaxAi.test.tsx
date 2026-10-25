// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  generate: vi.fn(),
  save: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ membership: { role: "owner" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    prompts: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: "google.pmax.copy",
              value: "Saved brand prompt",
              revision: 3,
              restorePoints: { brand: { value: "Initial brand prompt" } },
            },
          ],
          refetch: f.refetch,
        }),
      },
      change: {
        useMutation: () => ({ mutateAsync: f.save, isPending: false }),
      },
    },
    catalog: {
      overview: {
        useQuery: () => ({
          data: {
            products: [
              {
                id: 4,
                name: "Approved product",
                marketingCategory: { category: null },
              },
            ],
            hasMore: false,
          },
        }),
      },
    },
    googleAds: {
      campaigns: {
        draftPmaxCopy: {
          useMutation: () => ({
            mutate: f.generate,
            isPending: false,
            data: {
              headlines: ["New headline"],
              longHeadlines: ["New long headline"],
              descriptions: ["New description"],
            },
          }),
        },
      },
    },
  },
}));
import { GooglePmaxAi } from "./GooglePmaxAi";
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  f.save.mockResolvedValue({});
  f.refetch.mockResolvedValue({});
});
it("keeps per-run prompt edits separate from explicit shared saves and suggestion acceptance", async () => {
  const add = vi.fn();
  render(<GooglePmaxAi organizationId={7} onAdd={add} />);
  fireEvent.click(screen.getByText("Create PMax copy with AI"));
  fireEvent.change(screen.getByDisplayValue("Saved brand prompt"), {
    target: { value: "Only this run" },
  });
  fireEvent.click(screen.getByText("Create suggestions with AI"));
  expect(f.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId: 7,
      defaultInstructions: "Only this run",
    })
  );
  expect(f.save).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByText("Add to draft")[0]);
  expect(add).toHaveBeenCalledWith({
    field: "HEADLINE",
    source: { kind: "text", text: "New headline" },
  });
  fireEvent.click(screen.getByText("Save as shared default"));
  await waitFor(() =>
    expect(f.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "save",
        expectedRevision: 3,
        value: "Only this run",
      })
    )
  );
});
it("makes restoring the initial brand default explicit and revision checked", async () => {
  render(<GooglePmaxAi organizationId={7} onAdd={() => {}} />);
  fireEvent.click(screen.getByText("Create PMax copy with AI"));
  fireEvent.click(screen.getByText("Restore initial Brand Kit default"));
  await waitFor(() =>
    expect(f.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "restore_brand_initial",
        expectedRevision: 3,
      })
    )
  );
  expect(f.generate).not.toHaveBeenCalled();
});
