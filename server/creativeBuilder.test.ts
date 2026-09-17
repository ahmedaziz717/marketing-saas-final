import { describe, expect, it } from "vitest";
import {
  CREATIVE_ART_STYLES,
  CREATIVE_MOODS,
  CREATIVE_THEME_GROUPS,
  CREATIVE_THEME_LIST,
  CREATIVE_THEMES,
  DEFAULT_CREATIVE_BASE_PROMPT,
  applyCreativeTheme,
  creativeSetupSchema,
  defaultCreativeSetup,
  generationSetupIssues,
  outputCount,
} from "../shared/creativeBuilder";
import {
  buildCreativePrompt,
  publicActivityPayload,
  resolveBuilderInputs,
  type BuilderBrandAsset,
  type BuilderBrandKit,
  type BuilderCatalogProduct,
  type BuilderProductImage,
} from "./lib/creativeBuilder";
import { categorizeGenerationError } from "./lib/generation";

const product = {
  id: 11,
  organizationId: 1,
  name: "Studio lamp",
  status: "approved",
  specifications: { Power: "12 W", Material: "Aluminum" },
  price: "89.00",
  currency: "USD",
  updatedAtMs: 1,
} as BuilderCatalogProduct;
const image = {
  id: 21,
  organizationId: 1,
  productId: 11,
  storageKey: "org-1/lamp.png",
  url: "/manus-storage/org-1/lamp.png",
} as BuilderProductImage;
const logo = {
  id: 31,
  organizationId: 1,
  type: "logo",
  status: "approved",
  name: "Studio mark",
  storageKey: "org-1/logo.svg",
} as BuilderBrandAsset;
const brand = {
  name: "Studio",
  voice: "Warm",
  colors: ["#123456"],
  fonts: ["Inter"],
  requiredClaims: "",
  prohibitedContent: "No unsupported claims",
} as BuilderBrandKit;
const setup = () => ({
  ...defaultCreativeSetup(),
  products: [
    {
      productId: 11,
      imageId: 21,
      featuredSpecKeys: ["Power"],
      includePrice: false,
    },
  ],
  logoAssetId: 31,
});

describe("creative setup and trusted catalog inputs", () => {
  it("provides exactly 100 uniquely identified icon-led themes across always-on, evergreen, and all twelve months", () => {
    expect(CREATIVE_THEME_LIST).toHaveLength(100);
    expect(new Set(CREATIVE_THEME_LIST.map(theme => theme.id)).size).toBe(100);
    expect(CREATIVE_THEME_GROUPS.map(group => group.name)).toEqual([
      "Always On",
      "General / Evergreen",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ]);
    expect(
      CREATIVE_THEME_LIST.every(
        theme => theme.icon && theme.direction.length >= 20
      )
    ).toBe(true);
  });

  it("provides stable icon-led mood and art-style options", () => {
    expect(CREATIVE_MOODS.map(option => option.name)).toEqual([
      "Clean",
      "Vibrant",
      "Dark",
      "Minimal",
      "Bold",
      "Warm",
      "Playful",
      "Premium",
    ]);
    expect(CREATIVE_ART_STYLES.map(option => option.name)).toEqual([
      "Realistic",
      "Animation",
      "Illustration",
      "3D Render",
      "Editorial",
      "Cinematic",
      "Collage",
      "Technical",
    ]);
    expect(
      [...CREATIVE_MOODS, ...CREATIVE_ART_STYLES].every(
        option => option.icon && option.direction.length >= 20
      )
    ).toBe(true);
  });

  it("replaces all theme-owned copy for a different theme and preserves edits for the current theme", () => {
    const edited = {
      ...setup(),
      copy: {
        headline: "My edited headline",
        subheadline: "My edited subheadline",
        cta: "My edited CTA",
      },
      themePrompt: "My edited theme prompt with enough detail to remain valid.",
    };
    expect(applyCreativeTheme(edited, edited.theme)).toBe(edited);
    expect(applyCreativeTheme(edited, "holiday")).toMatchObject({
      theme: "holiday",
      themePrompt: CREATIVE_THEMES.holiday.direction,
      copy: {
        headline: CREATIVE_THEMES.holiday.headline,
        subheadline: CREATIVE_THEMES.holiday.subheadline,
        cta: CREATIVE_THEMES.holiday.cta,
      },
    });
  });

  it("restores legacy saved setups with default prompt layers", () => {
    const legacy = defaultCreativeSetup() as Record<string, unknown>;
    delete legacy.basePrompt;
    delete legacy.themePrompt;
    delete legacy.mood;
    delete legacy.artStyle;
    const parsed = creativeSetupSchema.parse(legacy);
    expect(parsed.basePrompt).toBe(DEFAULT_CREATIVE_BASE_PROMPT);
    expect(parsed.themePrompt).toBe(CREATIVE_THEMES.spotlight.direction);
    expect(parsed.mood).toBe("clean");
    expect(parsed.artStyle).toBe("realistic");
    expect(creativeSetupSchema.parse({ ...parsed, shot: "female" }).shot).toBe(
      "female"
    );
    expect(creativeSetupSchema.parse({ ...parsed, shot: "male" }).shot).toBe(
      "male"
    );
    expect(
      creativeSetupSchema.parse({ ...parsed, shot: "lifestyle" }).shot
    ).toBe("lifestyle");
  });

  it("accepts incomplete saved setups but blocks generation until product and size selections are complete", () => {
    expect(creativeSetupSchema.safeParse(defaultCreativeSetup()).success).toBe(
      true
    );
    expect(
      generationSetupIssues(defaultCreativeSetup()).length
    ).toBeGreaterThan(0);
    expect(generationSetupIssues(setup())).toEqual([]);
  });

  it("rejects a size assigned to an unselected channel and duplicate selections", () => {
    expect(
      creativeSetupSchema.safeParse({
        ...setup(),
        formatIds: ["google_rectangle"],
      }).success
    ).toBe(false);
    expect(
      creativeSetupSchema.safeParse({
        ...setup(),
        products: [setup().products[0], setup().products[0]],
      }).success
    ).toBe(false);
    expect(
      creativeSetupSchema.safeParse({
        ...setup(),
        formatIds: ["square_1_1", "square_1_1"],
      }).success
    ).toBe(false);
  });

  it("counts product sets and limits reference images and total output", () => {
    const many = {
      ...setup(),
      products: Array.from({ length: 9 }, (_, i) => ({
        ...setup().products[0],
        productId: i + 1,
      })),
    };
    expect(outputCount(many)).toBe(27);
    expect(generationSetupIssues(many).join(" ")).toMatch(/24/);
    expect(
      creativeSetupSchema.safeParse({ ...many, productMode: "together" })
        .success
    ).toBe(false);
    expect(outputCount({ ...setup(), productMode: "together" })).toBe(3);
  });

  it.each([
    [{ ...product, organizationId: 2 }, image, logo],
    [{ ...product, status: "pending" }, image, logo],
    [product, { ...image, organizationId: 2 }, logo],
    [product, { ...image, productId: 12 }, logo],
    [product, image, { ...logo, organizationId: 2 }],
    [product, image, { ...logo, status: "rejected" }],
  ])(
    "rejects cross-company, mismatched or unapproved references",
    (p, i, l) => {
      expect(() =>
        resolveBuilderInputs(
          1,
          setup(),
          [p as BuilderCatalogProduct],
          [i as BuilderProductImage],
          [l as BuilderBrandAsset]
        )
      ).toThrow();
    }
  );

  it("keeps selected specifications separate from factual context and rejects deleted facts", () => {
    const resolved = resolveBuilderInputs(
      1,
      setup(),
      [product],
      [image],
      [logo]
    );
    expect(resolved.products[0].featuredSpecifications).toEqual({
      Power: "12 W",
    });
    expect(resolved.products[0].specifications).toEqual(product.specifications);
    expect(() =>
      resolveBuilderInputs(
        1,
        setup(),
        [{ ...product, specifications: { Material: "Aluminum" } }],
        [image],
        [logo]
      )
    ).toThrow(/specifications changed/);
    const priceSetup = setup();
    priceSetup.products[0].includePrice = true;
    expect(() =>
      resolveBuilderInputs(
        1,
        priceSetup,
        [{ ...product, price: null }],
        [image],
        [logo]
      )
    ).toThrow(/price and currency/);
  });

  it("carries styling, exact copy, product facts and logo rules into both master and adapted prompts", () => {
    const selection = {
      ...setup(),
      theme: "weekend" as const,
      basePrompt:
        "Use an editorial product-ad composition with confident whitespace and premium lighting.",
      themePrompt:
        "Use warm weekend sunlight, relaxed energy, and a welcoming lifestyle setting.",
      mood: "dark" as const,
      artStyle: "cinematic" as const,
      shot: "lifestyle" as const,
      placement: "right" as const,
      extraDirection: "Warm window light",
    };
    const resolved = resolveBuilderInputs(
      1,
      selection,
      [product],
      [image],
      [logo]
    );
    const prompt = buildCreativePrompt({
      setup: selection,
      brand,
      products: resolved.products,
      formatId: "story_9_16",
      hasLogo: true,
      adaptMaster: true,
    });
    for (const required of [
      "FIRST reference is the master",
      "1080 by 1920",
      CREATIVE_THEMES.weekend.name,
      selection.basePrompt,
      selection.themePrompt,
      "MANDATORY MOOD — Dark",
      "MANDATORY ART STYLE — Cinematic",
      "immediately recognizable",
      "visibly unmistakable",
      "Do not silently revert to a generic studio-ad aesthetic",
      "no people, hands, faces, silhouettes, or human figures",
      "right",
      "Warm window light",
      "12 W",
      "Aluminum",
      "featuredSpecifications",
      selection.copy.headline,
      "supplied logo",
      "Never mix facts",
    ])
      expect(prompt).toContain(required);
  });
});

describe("customer-facing model privacy", () => {
  it("redacts model metadata recursively without mutating the stored audit record", () => {
    const stored = {
      imageModel: "private-id",
      variantCount: 3,
      nested: [{ provider: "private", imageModel: "private", width: 1080 }],
    };
    expect(publicActivityPayload(stored)).toEqual({
      variantCount: 3,
      nested: [{ width: 1080 }],
    });
    expect(stored.imageModel).toBe("private-id");
  });
  it("turns internal model availability errors into neutral customer guidance", () => {
    expect(
      categorizeGenerationError(
        "Required GPT image model gpt-image-2.5-sunburst is unavailable"
      ).userMessage
    ).not.toMatch(/GPT|Sunburst|OpenAI|model/i);
  });
});

it("allows an approved service without a product image and carries service facts into its prompt", () => {
  const service = {
    ...product,
    recordType: "service" as const,
    serviceDetails: {
      pricing: "quote",
      area: "Wichita",
      duration: "",
      delivery: "onsite",
      packages: "",
      cta: "Get a quote",
    },
  };
  const configuration = {
    ...setup(),
    products: [
      {
        productId: 11,
        imageId: null,
        featuredSpecKeys: [],
        includePrice: false,
      },
    ],
  };
  expect(creativeSetupSchema.safeParse(configuration).success).toBe(true);
  const resolved = resolveBuilderInputs(
    1,
    configuration,
    [service],
    [],
    [logo]
  );
  expect(resolved.products[0].image).toBeNull();
  expect(resolved.products[0].serviceDetails).toMatchObject({
    pricing: "quote",
    area: "Wichita",
  });
  expect(() =>
    resolveBuilderInputs(
      1,
      configuration,
      [{ ...service, recordType: "standalone" }],
      [],
      [logo]
    )
  ).toThrow();
});
