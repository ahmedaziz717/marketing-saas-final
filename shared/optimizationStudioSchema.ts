import { z } from "zod";
import { optimizerKinds } from "./optimization";

export const experimentSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    source: z
      .object({ runId: z.string().uuid(), kind: z.enum(optimizerKinds) })
      .optional(),
    hypothesis: z.string().max(3000).default(""),
    control: z.string().max(2000).default(""),
    variant: z.string().max(2000).default(""),
    metric: z
      .enum(["purchase_cpa", "roas", "ctr", "conversion_rate"])
      .default("purchase_cpa"),
    decisionRule: z.string().max(2000).default(""),
    durationDays: z.number().int().min(7).max(90).default(14),
    status: z
      .enum(["draft", "ready", "in_progress", "concluded"])
      .default("draft"),
    outcome: z.string().max(4000).default(""),
    decision: z
      .enum(["undecided", "inconclusive", "keep_control", "adopt_variant"])
      .default("undecided"),
  })
  .superRefine((p, ctx) => {
    if (
      p.status !== "draft" &&
      [p.hypothesis, p.control, p.variant, p.decisionRule].some(v => !v.trim())
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Complete the hypothesis, control, variant and decision rule before marking a plan ready.",
      });
    if (
      p.status === "concluded" &&
      (!p.outcome.trim() || p.decision === "undecided")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Record an outcome and decision before concluding an experiment.",
      });
  });
export const optimizationStudioSchema = z
  .object({
    version: z.literal(1),
    objective: z.string().max(5000).default(""),
    experiments: z.array(experimentSchema).max(30).default([]),
  })
  .refine(
    s => new Set(s.experiments.map(e => e.id)).size === s.experiments.length,
    "Each experiment needs a unique ID."
  );
export type ExperimentPlan = z.infer<typeof experimentSchema>;
export type OptimizationStudio = z.infer<typeof optimizationStudioSchema>;
