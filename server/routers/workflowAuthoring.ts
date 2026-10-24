import { protectedProcedure, router } from "../_core/trpc";
import {
  applyInput,
  authoringScope,
  authoringTarget,
  chatInput,
  proposalInput,
  proposalReference,
} from "../../shared/workflowAuthoring";
import { workflowAuthoring } from "../lib/workflowAuthoring";

export const workflowAuthoringRouter = router({
  chatStatus: protectedProcedure
    .input(chatInput)
    .query(({ ctx, input }) =>
      workflowAuthoring(ctx.user.id).chatStatus(input)
    ),
  abandonChat: protectedProcedure
    .input(chatInput)
    .mutation(({ ctx, input }) =>
      workflowAuthoring(ctx.user.id).abandonChat(input)
    ),
  discover: protectedProcedure
    .input(authoringScope)
    .query(({ ctx, input }) => workflowAuthoring(ctx.user.id).discover(input)),
  read: protectedProcedure
    .input(authoringTarget)
    .query(({ ctx, input }) => workflowAuthoring(ctx.user.id).read(input)),
  readApp: protectedProcedure
    .input(authoringTarget)
    .query(({ ctx, input }) => workflowAuthoring(ctx.user.id).readApp(input)),
  propose: protectedProcedure
    .input(proposalInput)
    .mutation(({ ctx, input }) =>
      workflowAuthoring(ctx.user.id).propose(input)
    ),
  chat: protectedProcedure
    .input(chatInput)
    .mutation(({ ctx, input }) => workflowAuthoring(ctx.user.id).chat(input)),
  preview: protectedProcedure
    .input(proposalReference)
    .query(({ ctx, input }) => workflowAuthoring(ctx.user.id).preview(input)),
  applyDraft: protectedProcedure
    .input(applyInput)
    .mutation(({ ctx, input }) => workflowAuthoring(ctx.user.id).apply(input)),
});
