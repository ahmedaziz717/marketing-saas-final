import { z } from "zod";

export const videoActionAssumptionsSchema = z.object({
  duration: z.union([z.literal("default"), z.number().int().min(1).max(120)]),
  resolution: z.string().min(1).max(20),
  aspectRatio: z.string().min(1).max(20),
  sound: z.enum(["default", "on", "off"]),
  sourceSeconds: z.number().int().min(1).max(120),
});
export type VideoActionAssumptions = z.infer<
  typeof videoActionAssumptionsSchema
>;
export const defaultVideoActionAssumptions: VideoActionAssumptions = {
  duration: "default",
  resolution: "default",
  aspectRatio: "default",
  sound: "default",
  sourceSeconds: 5,
};
