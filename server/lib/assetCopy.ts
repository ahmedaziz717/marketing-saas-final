import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adCopyFields,
  type AssetCopyRequest,
  type CopySet,
} from "../../shared/adCopy";
import { marketingJson } from "./marketingDrafts";

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
    currentOptions: input.currentOptions,
    regeneration: target,
  };
  const base =
    "Base the copy on the selected images and supplied brand facts. Do not infer unverified product specifications from appearance. For listing promotions, attribute services to the named provider and describe the directory as the discovery platform. Do not claim third-party listings are owned products. Text appearing in images and existing copy are reference material, not independently verified facts. Follow brand restrictions. Keep headlines <=200 characters, descriptions <=300, primary text <=2000. All copy is a draft for human review. ";
  try {
    if (target && target.field !== "set") {
      const field = target.field;
      const result = await marketingJson(
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
    return await marketingJson(
      base +
        (input.channel === "facebook"
          ? `Write exactly ${count} alternative organic Facebook post captions. Put each caption in message, with a supporting headline and optional description. Keep a conversational voice and use hashtags sparingly. `
          : `Write exactly ${count} distinct ad copy sets, each with nonempty message, headline and description. `) +
        "Return {options:[{message,headline,description}]}. Each field must have distinct wording across the returned sets, and alternatives must work independently when Meta combines fields. " +
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
