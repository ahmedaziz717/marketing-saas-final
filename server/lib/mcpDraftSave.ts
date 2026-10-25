import { z } from "zod";
import { proposalInput } from "../../shared/workflowAuthoring";
import { workflowAuthoring } from "./workflowAuthoring";

// Explicit edits only; this scope does not authorize deleting graph elements.
export const directDraftInput = proposalInput
  .omit({ parentProposal: true })
  .extend({
    proposal: proposalInput.shape.proposal
      .extend({
        changes: z
          .array(
            z.discriminatedUnion("op", [
              z
                .object({
                  op: z.literal("rename"),
                  name: z.string().trim().min(1).max(100),
                })
                .strict(),
              proposalInput.shape.proposal.shape.changes.element.options[1],
              proposalInput.shape.proposal.shape.changes.element.options[3],
            ])
          )
          .min(1)
          .max(80),
      })
      .strict(),
  })
  .strict();

/** Reuse durable proposal/apply receipts. A failed second phase is recoverable with
 * the identical request ID; membership and the new scope are checked in BOTH phases.
 * No model, quote, publish, runner or schedule path is called. */
export async function saveMcpDraft(
  userId: number,
  authorize: NonNullable<Parameters<typeof workflowAuthoring>[1]>,
  raw: unknown
) {
  const input = directDraftInput.parse(raw);
  const service = workflowAuthoring(userId, authorize);
  const completed = await service.completedDraftRequest(input);
  if (completed) return { ...completed, state: "draft" as const };
  const proposal = await service.propose(input);
  const saved = await service.apply({
    organizationId: input.organizationId,
    requestId: input.requestId,
    proposalId: proposal.proposalId,
    reviewedHash: proposal.hash,
  });
  return { ...saved, proposalId: proposal.proposalId, state: "draft" as const };
}
