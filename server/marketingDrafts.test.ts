import { it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), llm: vi.fn() }));
vi.mock("./lib/websiteCrawler", async original => ({
  ...(await original<typeof import("./lib/websiteCrawler")>()),
  safeFetchText: (...args: any[]) => mocks.fetch(...args),
}));
vi.mock("./_core/llm", () => ({
  listLLMModels: async () => ({ data: [] }),
  invokeLLM: (...args: any[]) => mocks.llm(...args),
}));
vi.mock("./lib/models", () => ({
  requireLatestGptTextModel: () => "test-model",
}));
import { websiteEvidence, discoverOfferings } from "./lib/marketingDrafts";
it("reads real page evidence and rejects off-site and unsupported offering sources", async () => {
  mocks.fetch.mockResolvedValue({
    status: 200,
    finalUrl: "https://example.test/",
    text: '<html><title>Learning Directory</title><body><h1>Provider plan</h1><p>Provider plan USD 20 monthly</p><a href="/provider/external">Other tutor</a></body></html>',
  });
  expect((await websiteEvidence("https://example.test")).title).toBe(
    "Learning Directory"
  );
  const valid = {
    name: "Provider plan",
    description: "A listing plan",
    productUrl: "https://example.test/",
    price: "20",
    currency: "USD",
    offeringType: "subscription",
    audience: "Providers",
    billingPeriod: "monthly",
    trial: "Invented 30 days",
    benefits: "Listing",
    evidence: "Provider plan USD 20 monthly",
  };
  mocks.llm.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            offerings: [
              valid,
              {
                ...valid,
                name: "Other tutor",
                productUrl: "https://thirdparty.test/",
              },
              { ...valid, name: "Invented plan" },
            ],
          }),
        },
      },
    ],
  });
  const result = await discoverOfferings("https://example.test", {});
  expect(result).toHaveLength(1);
  expect(result[0].serviceDetails?.trial).toBe("");
  expect(result[0].serviceDetails?.ownership).toBe("own");
  expect(result[0].price).toBe("20");
  expect(mocks.fetch.mock.calls.every(c => !c[0].includes("/provider/"))).toBe(
    true
  );
});
