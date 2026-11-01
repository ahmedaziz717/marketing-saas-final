// @vitest-environment jsdom
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
    assetLibrary: {
      list: {
        useQuery: () => ({
          data: [
            {
              key: "asset:1",
              name: "Selected creative",
              mediaType: "image",
              url: "/creative.png",
            },
          ],
        }),
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
            mutateAsync: f.generate,
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
import { GoogleCopyEditor } from "./GooglePmaxCopyEditor";
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  f.generate.mockResolvedValue({
    headlines: ["New headline", "Second headline"],
    longHeadlines: ["New long headline"],
    descriptions: ["New description"],
  });
  f.save.mockResolvedValue({});
  f.refetch.mockResolvedValue({});
});

it.each(["DISPLAY", "PERFORMANCE_MAX"] as const)(
  "stages %s suggestions and fills remaining slots without replacing manual copy",
  async adType => {
    const max = adType === "DISPLAY" ? 5 : 15;
    const apply = vi.fn();
    render(
      <GooglePmaxAi
        organizationId={7}
        adType={adType}
        onAdd={vi.fn()}
        onApply={apply}
        occupiedFields={Array(max - 1).fill("HEADLINE")}
        existingCopy={{
          headlines: ["Manual headline"],
          longHeadlines: [],
          descriptions: [],
        }}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create suggestions with AI" })
    );
    await screen.findByDisplayValue("New headline");
    expect(apply).not.toHaveBeenCalled();
    const field = within(
      screen.getByRole("region", { name: "Headlines AI suggestions" })
    );
    fireEvent.click(field.getByRole("button", { name: "Add all that fit" }));
    expect(apply).toHaveBeenCalledWith([
      { field: "HEADLINE", source: { kind: "text", text: "New headline" } },
    ]);
    expect(
      screen
        .getAllByRole("status")
        .map(e => e.textContent)
        .join(" ")
    ).toContain("no remaining slot");
    expect(screen.getByDisplayValue("Manual headline")).toHaveProperty(
      "readOnly",
      true
    );
  }
);
it("adds only selected edited proposals and clears selection after acceptance and regeneration", async () => {
  const apply = vi.fn();
  render(<GooglePmaxAi organizationId={7} onAdd={vi.fn()} onApply={apply} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  await screen.findByDisplayValue("New headline");
  fireEvent.change(screen.getByLabelText("Headlines suggestion 2"), {
    target: { value: "My edit" },
  });
  fireEvent.click(screen.getByLabelText("Select headline suggestion 2"));
  fireEvent.click(screen.getByRole("button", { name: "Add selected (1)" }));
  expect(apply).toHaveBeenCalledWith([
    { field: "HEADLINE", source: { kind: "text", text: "My edit" } },
  ]);
  expect(screen.getByLabelText("Select headline suggestion 2")).toHaveProperty(
    "checked",
    false
  );
  fireEvent.click(screen.getByLabelText("Select headline suggestion 1"));
  fireEvent.click(
    screen.getByRole("button", { name: "Regenerate all suggestions" })
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText("Select headline suggestion 1")
    ).toHaveProperty("checked", false)
  );
});
it("preserves per-run prompt changes until an explicit shared save", async () => {
  render(<GooglePmaxAi organizationId={7} onAdd={vi.fn()} />);
  fireEvent.change(screen.getByDisplayValue("Saved brand prompt"), {
    target: { value: "Only this run" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  await screen.findByDisplayValue("New headline");
  expect(f.generate).toHaveBeenCalledWith(
    expect.objectContaining({ defaultInstructions: "Only this run" })
  );
  expect(f.save).not.toHaveBeenCalled();
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
it.each(["DISPLAY", "PERFORMANCE_MAX"] as const)(
  "uses %s channel generation limits",
  async adType => {
    render(<GooglePmaxAi organizationId={7} adType={adType} onAdd={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create suggestions with AI" })
    );
    await screen.findByDisplayValue("New headline");
    expect(f.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        copyRequest: expect.objectContaining({
          adType,
          counts:
            adType === "DISPLAY"
              ? { headlines: 5, longHeadlines: 1, descriptions: 5 }
              : { headlines: 15, longHeadlines: 5, descriptions: 5 },
        }),
      })
    );
  }
);
it("discards in-flight responses after a manual draft edit", async () => {
  let resolve!: (value: unknown) => void;
  f.generate.mockImplementationOnce(
    () =>
      new Promise(r => {
        resolve = r;
      })
  );
  const { rerender } = render(
    <GooglePmaxAi organizationId={7} onAdd={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  rerender(
    <GooglePmaxAi
      organizationId={7}
      onAdd={vi.fn()}
      existingCopy={{
        headlines: ["Manual edit"],
        longHeadlines: [],
        descriptions: [],
      }}
    />
  );
  await act(async () =>
    resolve({
      headlines: ["Stale response"],
      longHeadlines: [],
      descriptions: [],
    })
  );
  expect(screen.queryByDisplayValue("Stale response")).toBeNull();
});
it("keeps explicit replacement opt-in and rejects stale targets", async () => {
  const replace = vi.fn();
  const props = { organizationId: 7, onAdd: vi.fn(), onReplace: replace };
  const { rerender } = render(
    <GooglePmaxAi
      {...props}
      replacementOptions={[
        { id: "one", field: "headlines", label: "Original" },
      ]}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  await screen.findByDisplayValue("New headline");
  const select = screen.getByLabelText(
    "Text to replace with headlines suggestion 1"
  );
  fireEvent.change(select, { target: { value: "one" } });
  expect(replace).not.toHaveBeenCalled();
  rerender(
    <GooglePmaxAi
      {...props}
      replacementOptions={[{ id: "two", field: "headlines", label: "Edited" }]}
    />
  );
  expect(
    screen.getAllByText("Replace selected text in draft")[0]
  ).toHaveProperty("disabled", true);
});
it("keeps uncategorized products optional and generates without confirmation", async () => {
  render(<GooglePmaxAi organizationId={7} onAdd={vi.fn()} />);
  fireEvent.click(
    screen.getByLabelText("Approved product — Product facts only")
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  await screen.findByDisplayValue("New headline");
  expect(f.generate).toHaveBeenCalledWith(
    expect.objectContaining({ productIds: [4] })
  );
  expect(f.generate.mock.calls[0][0]).not.toHaveProperty("neutralCategories");
});

it("discards superseded responses and clears proposals after the creative context changes", async () => {
  let resolveFirst!: (value: unknown) => void;
  f.generate.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        resolveFirst = resolve;
      })
  );
  const { rerender } = render(
    <GooglePmaxAi organizationId={7} onAdd={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  await screen.findByDisplayValue("New headline");
  await act(async () =>
    resolveFirst({
      headlines: ["Older response"],
      longHeadlines: [],
      descriptions: [],
    })
  );
  expect(screen.queryByDisplayValue("Older response")).toBeNull();
  fireEvent.click(screen.getByLabelText("Select headline suggestion 1"));
  rerender(
    <GooglePmaxAi
      organizationId={7}
      onAdd={vi.fn()}
      assets={[
        {
          field: "MARKETING_IMAGE",
          source: { kind: "library", key: "asset:1" },
        },
      ]}
    />
  );
  expect(screen.queryByDisplayValue("New headline")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add selected (1)" })).toBeNull();
});
