import { z } from "zod";

export const workflowRunOverrideSchema = z
  .object({
    id: z.string().min(1).max(80),
    text: z.string().max(10000).optional(),
    value: z.string().max(10000).optional(),
    imageKey: z
      .string()
      .regex(/^(asset|creative|product_image):[1-9][0-9]*$/)
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      [input.text, input.value, input.imageKey].filter(v => v !== undefined)
        .length > 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Supply one value for each input.",
      });
  });
export const workflowRunOverridesSchema = z
  .array(workflowRunOverrideSchema)
  .max(40)
  .superRefine((inputs, ctx) => {
    const seen = new Set<string>();
    inputs.forEach((input, index) => {
      if (seen.has(input.id))
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Supply each input ID only once.",
        });
      seen.add(input.id);
    });
  });
export const workflowRunInputSchema = z
  .object({
    organizationId: z.number().int().positive(),
    id: z.string().uuid(),
    appVersionId: z.string().uuid().optional(),
    inputs: workflowRunOverridesSchema.optional(),
    revision: z.number().int().positive(),
    target: z.string().min(1).max(80).optional(),
  })
  .strict();
export type WorkflowRunInput = z.infer<typeof workflowRunInputSchema>;
