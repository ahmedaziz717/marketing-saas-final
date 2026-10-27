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
  fireEvent.click((await screen.findAllByText("Add to draft"))[0]);
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

it("requests 15/5/5 maximum and forwards selected media, not draft text", async () => {
  const assets = [
    {
      field: "SQUARE_MARKETING_IMAGE" as const,
      source: { kind: "library" as const, key: "asset:1" },
    },
    {
      field: "HEADLINE" as const,
      source: { kind: "text" as const, text: "Keep my copy" },
    },
  ];
  const add = vi.fn();
  render(
    <GooglePmaxAi
      organizationId={7}
      connectionId="connection"
      assets={assets}
      onAdd={add}
    />
  );
  expect(screen.getByAltText("Selected creative")).toBeTruthy();
  const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
  expect(inputs.map(i => Number(i.value))).toEqual([15, 5, 5]);
  fireEvent.change(inputs[0], { target: { value: "99" } });
  expect(inputs[0].value).toBe("15");
  fireEvent.click(screen.getByText("Create suggestions with AI"));
  await screen.findByDisplayValue("New headline");
  expect(f.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: "connection",
      selectedAssets: [assets[0]],
      copyRequest: expect.objectContaining({
        counts: { headlines: 15, longHeadlines: 5, descriptions: 5 },
      }),
    })
  );
  expect(add).not.toHaveBeenCalled();
});

it("edits suggestions before explicit acceptance and regenerates only one suggestion", async () => {
  const add = vi.fn(),
    apply = vi.fn();
  render(<GooglePmaxAi organizationId={7} onAdd={add} onApply={apply} />);
  fireEvent.click(screen.getByText("Create suggestions with AI"));
  const suggestion = await screen.findByDisplayValue("New headline");
  fireEvent.change(suggestion, { target: { value: "My edited headline" } });
  expect(add).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(
    within(
      suggestion.closest(".google-copy-suggestion") as HTMLElement
    ).getByText("Add to draft")
  );
  expect(add).toHaveBeenCalledWith({
    field: "HEADLINE",
    source: { kind: "text", text: "My edited headline" },
  });
  f.generate.mockResolvedValueOnce({
    headlines: ["Replacement"],
    longHeadlines: [],
    descriptions: [],
  });
  fireEvent.click(
    within(
      suggestion.closest(".google-copy-suggestion") as HTMLElement
    ).getByText("Regenerate this headline")
  );
  await screen.findByDisplayValue("Replacement");
  expect(f.generate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      copyRequest: expect.objectContaining({
        target: "headlines",
        counts: { headlines: 1, longHeadlines: 0, descriptions: 0 },
      }),
    })
  );
  expect(screen.getByDisplayValue("Second headline")).toBeTruthy();
  expect(screen.getByDisplayValue("New description")).toBeTruthy();
  expect(add).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Add all valid suggestions to draft"));
  expect(apply).toHaveBeenCalledWith(
    expect.arrayContaining([
      { field: "HEADLINE", source: { kind: "text", text: "Replacement" } },
    ])
  );
});

it("generates alternatives at full capacity without adding or replacing existing copy", async () => {
  const occupied = [
    ...Array(14).fill("HEADLINE"),
    ...Array(4).fill("LONG_HEADLINE"),
    ...Array(5).fill("DESCRIPTION"),
  ];
  const add = vi.fn(),
    apply = vi.fn();
  const { rerender } = render(
    <GooglePmaxAi
      organizationId={7}
      occupiedFields={occupied}
      onAdd={add}
      onApply={apply}
    />
  );
  expect(
    (screen.getAllByRole("spinbutton") as HTMLInputElement[]).map(i =>
      Number(i.value)
    )
  ).toEqual([15, 5, 5]);
  rerender(
    <GooglePmaxAi
      organizationId={7}
      occupiedFields={[...occupied, "HEADLINE", "LONG_HEADLINE"]}
      onAdd={add}
      onApply={apply}
    />
  );
  expect(
    (screen.getByText("Create suggestions with AI") as HTMLButtonElement)
      .disabled
  ).toBe(false);
  fireEvent.click(screen.getByText("Create suggestions with AI"));
  await screen.findByDisplayValue("New headline");
  expect(f.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      copyRequest: expect.objectContaining({
        counts: { headlines: 15, longHeadlines: 5, descriptions: 5 },
      }),
    })
  );
  expect(
    screen
      .getAllByText("All slots occupied")
      .every(button => (button as HTMLButtonElement).disabled)
  ).toBe(true);
  fireEvent.click(screen.getByText("Add all valid suggestions to draft"));
  expect(add).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});

it("requires choosing and explicitly accepting a same-field replacement", async () => {
  const replace = vi.fn(),
    add = vi.fn();
  const { rerender } = render(
    <GooglePmaxAi
      organizationId={7}
      onAdd={add}
      onReplace={replace}
      replacementOptions={[
        {
          id: "headline-1",
          field: "headlines",
          label: "Google: Original headline",
        },
        {
          id: "description-1",
          field: "descriptions",
          label: "Google: Original description",
        },
      ]}
    />
  );
  fireEvent.click(screen.getByText("Create suggestions with AI"));
  const suggestion = await screen.findByDisplayValue("New headline");
  const row = within(
    suggestion.closest(".google-copy-suggestion") as HTMLElement
  );
  const button = row.getByText(
    "Replace selected text in draft"
  ) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(row.queryByText("Google: Original description")).toBeNull();
  fireEvent.change(row.getByRole("combobox"), {
    target: { value: "headline-1" },
  });
  expect(replace).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(replace).toHaveBeenCalledWith("headline-1", {
    field: "HEADLINE",
    source: { kind: "text", text: "New headline" },
  });
  expect(add).not.toHaveBeenCalled();
  fireEvent.change(row.getByRole("combobox"), {
    target: { value: "headline-1" },
  });
  rerender(
    <GooglePmaxAi
      organizationId={7}
      onAdd={add}
      onReplace={replace}
      replacementOptions={[
        {
          id: "headline-2",
          field: "headlines",
          label: "Google: Changed headline",
        },
      ]}
    />
  );
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(replace).toHaveBeenCalledTimes(1);
});

it("discards an in-flight suggestion response after selected creative changes", async () => {
  let resolve!: (value: unknown) => void;
  f.generate.mockImplementationOnce(
    () =>
      new Promise(r => {
        resolve = r;
      })
  );
  const add = vi.fn();
  const { rerender } = render(<GooglePmaxAi organizationId={7} onAdd={add} />);
  fireEvent.click(screen.getByText("Create suggestions with AI"));
  rerender(
    <GooglePmaxAi
      organizationId={7}
      assets={[
        {
          field: "MARKETING_IMAGE",
          source: { kind: "library", key: "asset:1" },
        },
      ]}
      onAdd={add}
    />
  );
  await act(async () => {
    resolve({
      headlines: ["Stale response"],
      longHeadlines: [],
      descriptions: [],
    });
  });
  await waitFor(() => expect(f.generate).toHaveBeenCalledTimes(1));
  expect(screen.queryByDisplayValue("Stale response")).toBeNull();
  expect(add).not.toHaveBeenCalled();
});

it("uses shared Display generation with 5/1/5 counts and selected asset context", async () => {
  const onAdd = vi.fn();
  render(
    <GooglePmaxAi
      organizationId={7}
      connectionId="account"
      adType="DISPLAY"
      assets={[
        {
          field: "SQUARE_MARKETING_IMAGE",
          source: { kind: "library", key: "asset:1" },
        },
      ]}
      onAdd={onAdd}
    />
  );
  expect(
    screen.getByText("Create Responsive Display copy with AI")
  ).toBeTruthy();
  expect(screen.getByLabelText("Headlines to generate")).toHaveProperty(
    "value",
    "5"
  );
  expect(screen.getByLabelText("Long headlines to generate")).toHaveProperty(
    "value",
    "1"
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create suggestions with AI" })
  );
  await waitFor(() => expect(f.generate).toHaveBeenCalled());
  expect(f.generate.mock.calls[0][0]).toMatchObject({
    connectionId: "account",
    selectedAssets: [
      {
        field: "SQUARE_MARKETING_IMAGE",
        source: { kind: "library", key: "asset:1" },
      },
    ],
    copyRequest: {
      adType: "DISPLAY",
      counts: { headlines: 5, longHeadlines: 1, descriptions: 5 },
    },
  });
  expect(onAdd).not.toHaveBeenCalled();
});
