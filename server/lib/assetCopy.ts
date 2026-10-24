import { systemPromptContract } from "../../shared/promptContracts";
import { copyDirectionBrief } from "../../shared/copyDirection";
import { metaCallToActionLabel } from "../../shared/metaCallToAction";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adCopyFields,
  type AssetCopyRequest,
  type CopySet,
} from "../../shared/adCopy";
import { marketingJsonWith } from "./marketingDrafts";

const normalized = (text: string) =>
  text.trim().replace(/\s+/g, " ").toLowerCase();
const generatedFields = {
  message: z.string().trim().min(1).max(2000),
  headline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(300),
};
export async function generateAssetCopy(
  input: AssetCopyRequest,
  context: unknown,
  images: string[]
): Promise<{ options: CopySet[] }> {
  const target = input.regeneration;
  const data = {
    context,
    direction: input.direction,
    promotion: input.promotion,
    copyDirection: copyDirectionBrief(input.copyDirection),
    callToAction:
      input.channel === "meta_ads" && input.callToAction
        ? metaCallToActionLabel(input.callToAction)
        : undefined,
    currentOptions: input.currentOptions,
    regeneration: target,
  };
  const base =
    "Base the copy on the supplied setup (offer, audience and goal), brand facts, and selected images when present. If no images are supplied, use the setup and brand context only; do not claim to have viewed an image. Do not infer unverified product specifications from appearance. For listing promotions, attribute services to the named provider and describe the directory as the discovery platform. Do not claim third-party listings are owned products. Text appearing in images and existing copy are reference material, not independently verified facts. Follow the selected copyDirection attributes across each set. Copy length targets the primary text/caption; keep headlines and descriptions within their shorter field limits. For No words, use symbols/emoji in the primary text only. Unselected dimensions are flexible. Multiple selected styles, angles and tones may be distributed across alternatives. Selected offers, urgency, testimony, numbers and authority are creative intent, NOT verified facts: use them only when backed by supplied brand/setup facts. Never invent discounts, scarcity, deadlines, reviews, performance claims or guarantees to satisfy a selection. Align the copy with the selected callToAction without changing its label. Follow brand restrictions. Keep headlines <=200 characters, descriptions <=300, primary text <=2000. All copy is a draft for human review. ";
  try {
    if (target && target.field !== "set") {
      const field = target.field;
      const result = await marketingJsonWith("copy.asset")(
        base +
          `Rewrite only the ${field} at the requested index for ${input.channel === "facebook" ? "an organic Facebook post" : "a Meta ad"}. Return {text:string} with exactly one new alternative. Keep the same subject and factual meaning, with a distinct angle or wording. It must differ from all current options for that field. Do not generate the other copy fields.`,
        data,
        z.object({
          text: generatedFields[field].refine(
            text =>
              !input.currentOptions.some(
                o => normalized(o[field]) === normalized(text)
              ),
            "Return a new alternative."
          ),
        }),
        images
      );
      return {
        options: [
          { ...input.currentOptions[target.index], [field]: result.text },
        ],
      };
    }
    const count = target ? 1 : input.channel === "meta_ads" ? 5 : 3;
    const description =
      input.channel === "meta_ads"
        ? generatedFields.description
        : z.string().trim().max(300);
    return await marketingJsonWith("copy.asset")(
      base +
        (input.channel === "facebook"
          ? `Write exactly ${count} alternative organic Facebook post captions. Put each caption in message, with a supporting headline and optional description. Keep a conversational voice and use hashtags sparingly. `
          : `Write exactly ${count} distinct ad copy sets, each with nonempty message, headline and description. `) +
        systemPromptContract("contract.assetCopy.1") +
        (target
          ? "Replace only the requested set. All three fields must differ from the existing options. "
          : "Provide fresh angles rather than repeating the supplied current options. "),
      data,
      z.object({
        options: z
          .array(z.object({ ...generatedFields, description }))
          .length(count)
          .refine(
            options =>
              adCopyFields.every(field => {
                const values = options
                  .map(o => normalized(o[field]))
                  .filter(Boolean);
                return (
                  new Set(values).size === values.length &&
                  !values.some(text =>
                    input.currentOptions.some(
                      o => normalized(o[field]) === text
                    )
                  )
                );
              }),
            "Return distinct copy options."
          ),
      }),
      images
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message:
          "The AI did not return the requested copy options. Your existing copy is unchanged. Please try again.",
      });
    throw error;
  }
}
