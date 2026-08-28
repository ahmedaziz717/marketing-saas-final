import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { workspaceRouter } from "./routers/workspace";
import { brandRouter } from "./routers/brand";
import { briefsRouter } from "./routers/briefs";
import { activityRouter } from "./routers/activity";
import { creativesRouter } from "./routers/creatives";
import { metaRouter } from "./routers/meta";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  workspace: workspaceRouter,
  brand: brandRouter,
  briefs: briefsRouter,
  activity: activityRouter,
  creatives: creativesRouter,
  meta: metaRouter,
});

export type AppRouter = typeof appRouter;
