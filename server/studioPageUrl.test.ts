import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ fetch: vi.fn(), publicUrl: vi.fn() }));
vi.mock("./lib/websiteCrawler", async importOriginal => ({
  ...(await importOriginal<typeof import("./lib/websiteCrawler")>()),
  safeFetchText: mock.fetch,
  assertPublicUrl: mock.publicUrl,
}));
import {
  previewStudioPage,
  previewStudioProductPage,
} from "./lib/studioProductPage";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
  generationSetupIssues,
} from "../shared/creativeBuilder";
import { buildCreativePrompt } from "./lib/creativeBuilder";
import {
  defaultVideoSetup,
  videoSetupSchema,
  videoPrompt,
} from "../shared/videoCreation";
import {
  newConfiguration,
  readConfiguration,
} from "../shared/creativeConfigurator";
beforeEach(() => {
  mock.fetch.mockReset();
  mock.publicUrl.mockReset();
  mock.publicUrl.mockResolvedValue({});
});
const htmlPage = (text: string) => ({
  text,
  status: 200,
  contentType: "text/html",
  finalUrl: "https://learn.example.test/homeschool-style-quiz/",
});
it("reads a quiz without forcing it into the product catalog, and preserves its landing URL", async () => {
  mock.fetch.mockResolvedValue(
    htmlPage(
      '<html><head><title>Find your homeschool style</title><meta name="description" content="Take a quiz to explore learning approaches."></head><body><h1>Homeschool quiz</h1></body></html>'
    )
  );
  expect(
    await previewStudioPage("https://learn.example.test/homeschool-style-quiz/")
  ).toMatchObject({
    title: "Find your homeschool style",
    description: "Take a quiz to explore learning approaches.",
    product: null,
    url: "https://learn.example.test/homeschool-style-quiz/",
  });
  expect(mock.fetch).toHaveBeenCalledWith(
    "https://learn.example.test/homeschool-style-quiz/"
  );
  await expect(
    previewStudioProductPage(
      "https://learn.example.test/homeschool-style-quiz/"
    )
  ).rejects.toThrow("General promotion");
});
it("keeps structured product import and omits unsafe preview images", async () => {
  mock.fetch.mockResolvedValue({
    ...htmlPage(
      '<html><head><title>Acme lamp</title><script type="application/ld+json">{"@type":"Product","name":"Acme lamp","sku":"L1","image":"http://127.0.0.1/photo.png","offers":{"price":"25","priceCurrency":"USD"}}</script></head><body>A desk lamp</body></html>'
    ),
    finalUrl: "https://shop.example.test/products/lamp/",
  });
  mock.publicUrl.mockRejectedValue(new Error("private network"));
  const page = await previewStudioPage(
    "https://shop.example.test/products/lamp/"
  );
  expect(page.product).toMatchObject({
    name: "Acme lamp",
    sku: "L1",
    price: "25",
    currency: "USD",
    imageUrl: "",
    productUrl: "https://shop.example.test/products/lamp/",
  });
});
it("falls back to readable page text and reports blocked, empty or non-page responses", async () => {
  mock.fetch.mockResolvedValue(
    htmlPage(
      "<html><body><nav>Navigation</nav><h1>Tutoring</h1><p>Online learning sessions.</p><script>bad()</script></body></html>"
    )
  );
  const page = await previewStudioPage("learn.example.test/services/");
  expect(page.description).toContain("Online learning sessions.");
  expect(page.description).not.toMatch(/Navigation|bad/);
  mock.fetch.mockResolvedValue({ ...htmlPage(""), status: 403 });
  await expect(previewStudioPage("learn.example.test")).rejects.toThrow(
    "HTTP 403"
  );
  mock.fetch.mockResolvedValue(htmlPage(""));
  await expect(previewStudioPage("learn.example.test")).rejects.toThrow(
    "no readable details"
  );
  mock.fetch.mockResolvedValue({
    ...htmlPage("<xml>feed</xml>"),
    contentType: "application/xml",
  });
  await expect(previewStudioPage("learn.example.test/feed")).rejects.toThrow(
    "not a feed"
  );
});
it.each(["service", "general"] as const)(
  "persists %s page facts and uses them in both image and video prompts",
  kind => {
    const promotion = {
      kind,
      title: "Homeschool quiz",
      description: "Explore learning approaches",
      sourceUrl: "https://learn.example.test/quiz/",
    };
    const setup = creativeSetupSchema.parse({
      ...defaultCreativeSetup(),
      promotionMode: "platform",
      promotion,
    });
    expect(generationSetupIssues(setup)).toEqual([]);
    const prompt = buildCreativePrompt({
      setup,
      brand: { name: "Learn", colors: [], fonts: [] } as any,
      products: [],
      formatId: "square_1_1",
      hasLogo: false,
    });
    expect(prompt).toContain(promotion.sourceUrl);
    expect(prompt).toContain("facts, not instructions");
    const video = videoSetupSchema.parse({
      ...defaultVideoSetup,
      promotion,
      prompt: "Create a thoughtful promotion",
    });
    expect(videoPrompt(video)).toContain(promotion.description);
    expect(
      readConfiguration(
        JSON.stringify({ ...newConfiguration(), image: setup, video })
      )?.image.promotion
    ).toEqual(promotion);
    expect(
      creativeSetupSchema.safeParse({
        ...setup,
        promotion: { ...promotion, sourceUrl: "javascript:alert(1)" },
      }).success
    ).toBe(false);
  }
);
