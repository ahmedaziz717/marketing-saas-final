// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATIVE_THEMES,
  DEFAULT_CREATIVE_BASE_PROMPT,
  defaultCreativeSetup,
} from "@shared/creativeBuilder";

const api = vi.hoisted(() => ({
  role: "owner",
  options: {} as any,
  save: { isPending: false, mutateAsync: vi.fn() },
  refresh: { isPending: false, mutateAsync: vi.fn() },
  generate: { isPending: false, mutateAsync: vi.fn() },
  invalidate: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: api.role } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      creativeBuilder: { options: { invalidate: api.invalidate } },
      creatives: { overview: { invalidate: api.invalidate } },
      activity: { list: { invalidate: api.invalidate } },
    }),
    creativeBuilder: {
      options: { useQuery: () => ({ data: api.options, isLoading: false }) },
      save: { useMutation: () => api.save },
      refreshCopy: { useMutation: () => api.refresh },
      generate: { useMutation: () => api.generate },
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { CreativeBuilder } from "./CreativeBuilder";

beforeEach(() => {
  vi.clearAllMocks();
  api.role = "owner";
  api.options = {
    products: [
      {
        id: 11,
        name: "Studio lamp",
        sku: "LAMP-01",
        specifications: { Power: "12 W", Material: "Aluminum" },
        price: "89.00",
        currency: "USD",
        images: [
          { id: 21, url: "/lamp-front.png", altText: "Lamp front" },
          { id: 22, url: "/lamp-side.png", altText: "Lamp side" },
        ],
      },
      {
        id: 12,
        name: "Oak shelf",
        sku: "SHELF-01",
        specifications: { Material: "Oak" },
        images: [{ id: 23, url: "/shelf.png", altText: "Shelf" }],
      },
    ],
    logos: [{ id: 31, name: "White brand mark", url: "/logo.png" }],
    brand: { status: "active" },
    drafts: [],
  };
  api.save.mutateAsync.mockResolvedValue({ briefId: 100, updatedAtMs: 200 });
  api.refresh.mutateAsync.mockResolvedValue({
    headline: "A new perspective",
    subheadline: "Made for your space",
    cta: "Explore",
  });
  api.generate.mutateAsync.mockResolvedValue({ jobId: 300, status: "running" });
});
afterEach(cleanup);

describe("Creative Builder controls", () => {
  it("searches monthly themes and saves editable main and theme prompt layers", async () => {
    render(<CreativeBuilder onGenerated={vi.fn()} />);
    expect(screen.getByText(/100 directions/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search creative themes"), {
      target: { value: "Cyber Monday" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cyber Monday" }));
    expect((screen.getByLabelText("Theme prompt") as HTMLTextAreaElement).value).toContain("Digital deal atmosphere");
    fireEvent.change(screen.getByLabelText("Main prompt"), {
      target: { value: "Create a precise premium commerce composition with generous safe space." },
    });
    fireEvent.change(screen.getByLabelText("Theme prompt"), {
      target: { value: "Use electric cyan data light with a restrained violet retail-event atmosphere." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save setup" }));
    await waitFor(() => expect(api.save.mutateAsync).toHaveBeenCalled());
    expect(api.save.mutateAsync.mock.calls[0][0]).toMatchObject({
      setup: {
        theme: "cyber-monday",
        basePrompt: "Create a precise premium commerce composition with generous safe space.",
        themePrompt: "Use electric cyan data light with a restrained violet retail-event atmosphere.",
      },
    });
  });

  it("resets both prompt layers and restores saved prompt overrides", async () => {
    const savedSetup = {
      ...defaultCreativeSetup(),
      theme: "cyber-monday" as const,
      basePrompt: "Saved main prompt for a premium retail composition.",
      themePrompt: "Saved theme prompt with cyan data light and restrained violet depth.",
      copy: {
        headline: "Saved headline",
        subheadline: "Saved subheadline",
        cta: "Saved CTA",
      },
    };
    api.options.drafts = [
      { id: 44, name: "Saved Cyber", setup: savedSetup, updatedAtMs: 55 },
    ];
    render(<CreativeBuilder onGenerated={vi.fn()} />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Main prompt") as HTMLTextAreaElement).value
      ).toBe(savedSetup.basePrompt)
    );
    expect(
      (screen.getByLabelText("Theme prompt") as HTMLTextAreaElement).value
    ).toBe(savedSetup.themePrompt);
    const resetButtons = screen.getAllByRole("button", { name: "Reset" });
    fireEvent.click(resetButtons[0]);
    fireEvent.click(resetButtons[1]);
    expect(
      (screen.getByLabelText("Main prompt") as HTMLTextAreaElement).value
    ).toBe(DEFAULT_CREATIVE_BASE_PROMPT);
    expect(
      (screen.getByLabelText("Theme prompt") as HTMLTextAreaElement).value
    ).toBe(CREATIVE_THEMES["cyber-monday"].direction);
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(
      savedSetup.copy.headline
    );
    fireEvent.click(screen.getByRole("button", { name: "Holiday" }));
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(
      CREATIVE_THEMES.holiday.headline
    );
    expect(
      (screen.getByLabelText("Subheadline") as HTMLInputElement).value
    ).toBe(CREATIVE_THEMES.holiday.subheadline);
    expect(
      (screen.getByLabelText("Call to action") as HTMLInputElement).value
    ).toBe(CREATIVE_THEMES.holiday.cta);
    fireEvent.click(screen.getByRole("button", { name: "Save setup" }));
    await waitFor(() => expect(api.save.mutateAsync).toHaveBeenCalled());
    expect(api.save.mutateAsync.mock.calls[0][0]).toMatchObject({
      briefId: 44,
      setup: {
        theme: "holiday",
        themePrompt: CREATIVE_THEMES.holiday.direction,
        copy: {
          headline: CREATIVE_THEMES.holiday.headline,
          subheadline: CREATIVE_THEMES.holiday.subheadline,
          cta: CREATIVE_THEMES.holiday.cta,
        },
      },
    });
  });

  it("shows channel sizes and replaces edited copy when a different theme is selected", () => {
    render(<CreativeBuilder onGenerated={vi.fn()} />);
    expect(screen.queryByText("300 × 250")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Google Display" }));
    expect(screen.getByText("300 × 250")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Headline"), {
      target: { value: "My exact headline" },
    });
    fireEvent.change(screen.getByLabelText("Subheadline"), {
      target: { value: "My exact subheadline" },
    });
    fireEvent.change(screen.getByLabelText("Call to action"), {
      target: { value: "My exact CTA" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: CREATIVE_THEMES.spotlight.name })
    );
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(
      "My exact headline"
    );
    fireEvent.click(
      screen.getByRole("button", { name: CREATIVE_THEMES.holiday.name })
    );
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(
      CREATIVE_THEMES.holiday.headline
    );
    expect(
      (screen.getByLabelText("Subheadline") as HTMLInputElement).value
    ).toBe(CREATIVE_THEMES.holiday.subheadline);
    expect(
      (screen.getByLabelText("Call to action") as HTMLInputElement).value
    ).toBe(CREATIVE_THEMES.holiday.cta);
    expect(api.refresh.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("300 × 250")).toBeTruthy();
    expect(screen.queryByText(/GPT|Sunburst|OpenAI/i)).toBeNull();
  });

  it("saves the selected product image, specs, logo, channel and direction; copy refresh and undo retain them", async () => {
    render(<CreativeBuilder onGenerated={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Studio lamp/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Use image 22 for Studio lamp" })
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Power 12 W/ }));
    fireEvent.click(screen.getByRole("button", { name: /White brand mark/ }));
    fireEvent.change(screen.getByLabelText(/Extra direction/), {
      target: { value: "Warm window light" },
    });
    fireEvent.change(screen.getByLabelText("Shot type"), {
      target: { value: "female" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh copy" }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Headline") as HTMLInputElement).value
      ).toBe("A new perspective")
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(
      CREATIVE_THEMES.spotlight.headline
    );
    fireEvent.click(screen.getByRole("button", { name: "Save setup" }));
    await waitFor(() => expect(api.save.mutateAsync).toHaveBeenCalled());
    expect(api.save.mutateAsync.mock.calls[0][0]).toMatchObject({
      organizationId: 1,
      setup: {
        products: [
          {
            productId: 11,
            imageId: 22,
            featuredSpecKeys: ["Power"],
            includePrice: false,
          },
        ],
        logoAssetId: 31,
        shot: "female",
        extraDirection: "Warm window light",
      },
    });
  });

  it("keeps selections when product search filters the list", () => {
    render(<CreativeBuilder onGenerated={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Studio lamp/ }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search products or SKU" }),
      { target: { value: "SHELF" } }
    );
    expect(screen.queryByRole("checkbox", { name: /Studio lamp/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove Studio lamp" })
    ).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Oak shelf/ })).toBeTruthy();
  });

  it("does not replace newer edits when an earlier copy refresh returns", async () => {
    let finish!: (copy: {
      headline: string;
      subheadline: string;
      cta: string;
    }) => void;
    api.refresh.mutateAsync.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    render(<CreativeBuilder onGenerated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh copy" }));
    fireEvent.change(screen.getByLabelText("Headline"), {
      target: { value: "Keep my newer edit" },
    });
    finish({ headline: "Stale response", subheadline: "Stale", cta: "Stale" });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Headline") as HTMLInputElement).value
      ).toBe("Keep my newer edit")
    );
  });

  it("reviews the setup and starts a saved generation job without a separate campaign brief screen", async () => {
    const onGenerated = vi.fn();
    render(<CreativeBuilder onGenerated={onGenerated} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Studio lamp/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review & generate" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate with AI" }));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledOnce());
    expect(api.generate.mutateAsync.mock.calls[0][0]).toMatchObject({
      organizationId: 1,
      briefId: 100,
      expectedUpdatedAtMs: 200,
    });
    expect(api.generate.mutateAsync.mock.calls[0][0].requestId).toMatch(
      /^[0-9a-f-]{36}$/
    );
  });

  it("keeps generation and saving unavailable to reviewers", () => {
    api.role = "reviewer";
    render(<CreativeBuilder onGenerated={vi.fn()} />);
    expect(
      (screen.getByRole("button", { name: "Save setup" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Review & generate",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
