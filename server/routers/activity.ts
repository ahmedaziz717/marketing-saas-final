import { z } from "zod";
import { listActivity, verifyActivityChain } from "../lib/activity";
import { requireOrganizationRole } from "../lib/access";
import { protectedProcedure, router } from "../_core/trpc";
import { publicActivityPayload } from "../lib/creativeBuilder";

export const activityRouter = router({
  list: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const events = await listActivity(input.organizationId);
    return { events: events.map(event => ({ ...event, payload: publicActivityPayload(event.payload) })), verified: verifyActivityChain(events) };
  }),
});
