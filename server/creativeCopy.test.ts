import { beforeEach, expect, it, vi } from "vitest";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { buildCreativeCopyMessages } from "./lib/creativeCopy";

const mock = vi.hoisted(() => ({
  llm: vi.fn(),
  preview: vi.fn(),
  access: vi.fn(),
}));
const brand = {
  name: "Learning directory",
  businessProfile: { summary: "Find local educators" },
  voice: "Warm",
  colors: [],
  fonts: [],
} as any;
vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [brand] }) }),
    }),
  }),
}));
vi.mock("./lib/access", () => ({ requireOrganizationRole: mock.access }));
vi.mock("./lib/studioProductPage", () => ({ previewStudioPage: mock.preview }));
vi.mock("./_core/llm", () => ({
  invokeLLM: mock.llm,
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
}));
import { creativeBuilderRouter } from "./routers/creativeBuilder";

const copy = {
  headline: "Find your homeschool style",
  subheadline: "Answer 12 questions to explore learning approaches.",
  cta: "Take the quiz",
};
const setup = () => ({
  ...defaultCreativeSetup(),
  promotionMode: "platform" as const,
  promotion: {
    kind: "general" as const,
    title: "Homeschool style quiz",
    description: "Find an approach that suits your family.",
    sourceUrl: "https://learn.example.test/quiz/",
    pageContent:
      "Answer 12 questions about your routines. Compare Montessori and Charlotte Mason approaches.",
  },
  copy: {
    headline: "Find local providers",
    subheadline: "Explore our directory",
    cta: "Browse listings",
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.llm.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(copy) } }],
  });
  mock.preview.mockResolvedValue({
    pageContent: "Restored page body: 12-question quiz.",
  });
});
const caller = () =>
  creativeBuilderRouter.createCaller({ user: { id: 4 } } as any);

it.each(["black-friday", "black-friday-minimal", "black-friday-premium", "black-friday-color"])("makes %s part of the generated message and applies brand voice without inventing offers", async theme => {
  const result = await caller().refreshCopy({ organizationId: 3, setup: { ...setup(), theme } });
  const payload = JSON.parse(mock.llm.mock.calls[0][0].messages[1].content);
  expect(payload.campaign.requiredMention).toBe("Black Friday");
  expect(payload.brandBackground.voice).toBe("Warm");
  expect(result.headline).toBe("Black Friday · " + copy.headline);
  expect(result.subheadline).toBe(copy.subheadline);
  expect(mock.llm).toHaveBeenCalledTimes(1);
  expect(mock.llm.mock.calls[0][0].messages[0].content).toContain("tone, vocabulary, audience, message hierarchy and CTA");
  expect(payload.campaign.rule).toContain("does not authorize invented discounts");
});
it("keeps naturally themed copy intact", async () => {
  mock.llm.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ ...copy, subheadline: "Explore your Black Friday learning plans." }) } }] });
  const result = await caller().refreshCopy({ organizationId: 3, setup: { ...setup(), theme: "black-friday" } });
  expect(result.headline).toBe(copy.headline);
});

it.each(["service", "general"] as const)(
  "passes the reviewed %s page body through the actual copy route, ahead of unrelated brand and prior copy",
  async kind => {
    const page = setup();
    const result = await caller().refreshCopy({
      organizationId: 3,
      setup: { ...page, promotion: { ...page.promotion, kind } },
    });
    expect(result).toEqual(copy);
    const request = mock.llm.mock.calls[0][0];
    const subject = JSON.parse(request.messages[1].content).subject;
    expect(subject).toEqual({ type: "page", ...page.promotion, kind });
    expect(request.messages[0].content).toContain(
      "page is the primary subject"
    );
    expect(request.messages[0].content).toContain("never instructions");
    expect(JSON.parse(request.messages[1].content).subjectRules).not.toContain(
      "Promote the operator's platform"
    );
    expect(mock.preview).not.toHaveBeenCalled();
    expect(mock.access).toHaveBeenCalledWith(4, 3, expect.any(Array));
  }
);
it("hydrates missing text in older saved URL briefs while keeping edited campaign facts", async () => {
  const page = setup();
  const { pageContent, ...promotion } = page.promotion;
  await caller().refreshCopy({
    organizationId: 3,
    setup: { ...page, promotion },
  });
  expect(mock.preview).toHaveBeenCalledWith(promotion.sourceUrl);
  expect(
    JSON.parse(mock.llm.mock.calls[0][0].messages[1].content).subject
  ).toMatchObject({
    ...promotion,
    pageContent: "Restored page body: 12-question quiz.",
  });
});
it("does not charge an AI request when a legacy page cannot be safely read", async () => {
  const page = setup();
  const { pageContent, ...promotion } = page.promotion;
  mock.preview.mockRejectedValueOnce(new Error("Private address"));
  await expect(
    caller().refreshCopy({ organizationId: 3, setup: { ...page, promotion } })
  ).rejects.toThrow("source page could not be read");
  expect(mock.llm).not.toHaveBeenCalled();
});
it("respects intentionally removed page text and preserves the catalog copy path", async () => {
  const page = setup();
  await caller().refreshCopy({
    organizationId: 3,
    setup: { ...page, promotion: { ...page.promotion, pageContent: "" } },
  });
  expect(mock.preview).not.toHaveBeenCalled();
  const products = [
    {
      name: "Lamp",
      description: "Aluminum",
      includePrice: false,
      image: { url: "private-reference" },
    },
    { name: "Desk", description: "Oak", includePrice: false, image: null },
  ] as any;
  const messages = buildCreativeCopyMessages(
    {
      ...defaultCreativeSetup(),
      productMode: "separate",
      promotion: page.promotion,
    },
    brand,
    products
  );
  const data = JSON.parse(messages[1].content as string);
  expect(data.subject.type).toBe("catalog");
  expect(data.subject.products.map((p: any) => p.name)).toEqual([
    "Lamp",
    "Desk",
  ]);
  expect(data.subject.products[0].image).toBeUndefined();
  expect(data.instruction).toContain("every selected product individually");
  expect(JSON.stringify(data.subject)).not.toContain("Homeschool");
});
