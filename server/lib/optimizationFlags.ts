import { TRPCError } from "@trpc/server";
export function optimizationEnabled(organizationId: number) {
  return (
    process.env.OPTIMIZATION_INTELLIGENCE_ENABLED === "true" &&
    (process.env.OPTIMIZATION_TENANT_IDS ?? "")
      .split(",")
      .map(s => s.trim())
      .includes(String(organizationId))
  );
}
export function requireOptimization(organizationId: number) {
  if (!optimizationEnabled(organizationId))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Optimization intelligence is not enabled for this workspace yet.",
    });
}
