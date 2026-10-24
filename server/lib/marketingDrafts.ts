import { systemPromptContract } from "../../shared/promptContracts";
import { z } from "zod";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { requireLatestGptTextModel } from "./models";
import { safeFetchText, extractPageEvidence, sameSite } from "./websiteCrawler";
import { suggestedBusinessProfileSchema } from "../../shared/businessProfile";
import { catalogEntrySchema } from "../../shared/catalog";
export async function marketingJson<T>(
  instruction: string,
  data: unknown,
  schema: z.ZodType<T>,
  images: string[] = [],
  promptTemplateId = "marketing.general"
): Promise<T> {
  const model = requireLatestGptTextModel((await listLLMModels()).data);
  const response = await invokeLLM({
    promptTemplateId,
    model,
    messages: [
      {
        role: "system",
        content:
          instruction + systemPromptContract("contract.marketingDrafts.1"),
      },
      {
        role: "user",
        content: [
          { type: "text", text: JSON.stringify(data) },
          ...images.map(url => ({
            type: "image_url" as const,
            image_url: { url, detail: "auto" as const },
          })),
        ],
      },
    ],
    response_format: { type: "json_object" },
  });
  const text = response.choices[0]?.message?.content;
  return schema.parse(JSON.parse(typeof text === "string" ? text : "{}"));
}
export function marketingJsonWith(promptTemplateId: string) {
  return <T>(
    instruction: string,
    data: unknown,
    schema: z.ZodType<T>,
    images: string[] = []
  ) => marketingJson(instruction, data, schema, images, promptTemplateId);
}
export async function websiteEvidence(url: string) {
  const response = await safeFetchText(url);
  if (response.status >= 400)
    throw new Error(
      "Website could not be read. Check the URL or enter your information manually."
    );
  return extractPageEvidence(response.text, response.finalUrl);
}
export async function suggestProfile(url: string) {
  const page = await websiteEvidence(url);
  return marketingJsonWith("brand.profile")(
    systemPromptContract("contract.marketingDrafts.2"),
    { url: page.url, text: page.text.slice(0, 14000) },
    suggestedBusinessProfileSchema
  );
}
export async function discoverOfferings(url: string, profile: unknown) {
  const home = await websiteEvidence(url);
  const pages = [home];
  const links = home.internalLinks
    .filter(
      link =>
        sameSite(link, home.url) &&
        /\/(pricing|plans|packages|membership|subscriptions?)(\/|$|\?)/i.test(
          new URL(link).pathname
        )
    )
    .slice(0, 3);
  for (const link of links) {
    if (link === home.url) continue;
    try {
      pages.push(await websiteEvidence(link));
    } catch {}
  }
  const evidence = pages.map(p => ({
    url: p.url,
    text: p.text.slice(0, 12000),
  }));
  const result = await marketingJsonWith("catalog.offerings")(
    systemPromptContract("contract.marketingDrafts.3"),
    { profile, pages: evidence },
    z.object({
      offerings: z
        .array(
          z.object({
            name: z.string().min(1).max(300),
            description: z.string().max(10000),
            productUrl: z.string().url(),
            price: z.string().max(80),
            currency: z.string().max(16),
            offeringType: z.enum([
              "platform",
              "subscription",
              "membership",
              "free_offer",
            ]),
            audience: z.string().max(2000),
            billingPeriod: z.enum(["none", "monthly", "annual", "other"]),
            trial: z.string().max(1000),
            benefits: z.string().max(4000),
            evidence: z.string().min(5).max(1000),
          })
        )
        .max(12),
    })
  );
  return result.offerings.flatMap(o => {
    const page = evidence.find(p => p.url === o.productUrl);
    if (
      !page ||
      !page.text.includes(o.evidence) ||
      !page.text.toLowerCase().includes(o.name.toLowerCase())
    )
      return [];
    const supported = (value: string) =>
      !value || page.text.toLowerCase().includes(value.toLowerCase());
    return [
      catalogEntrySchema.parse({
        name: o.name,
        description: o.description,
        productUrl: o.productUrl,
        recordType: "service",
        price: supported(o.price) ? o.price : "",
        currency: supported(o.currency) ? o.currency : "",
        serviceDetails: {
          offeringType: o.offeringType,
          ownership: "own",
          audience: o.audience,
          billingPeriod: o.billingPeriod,
          trial: supported(o.trial) ? o.trial : "",
          benefits: o.benefits,
          pricing: ["subscription", "membership"].includes(o.offeringType)
            ? "recurring"
            : "quote",
        },
        specifications: { "Source evidence": o.evidence },
      }),
    ];
  });
}
