import { z } from "zod";
export const learningOriginSchema = z.object({
  id: z.string().uuid(),
  sourceAdIds: z.array(z.string().max(100)).max(100),
  createdAtMs: z.number(),
  kind: z.string().max(80),
  hypothesis: z.string().max(8000),
});
export const learningHandoffSchema = learningOriginSchema.extend({
  organizationId: z.number().int().positive(),
});
export type LearningOrigin = z.infer<typeof learningOriginSchema>;
