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
import { crawlRouter } from "./routers/crawl";
import { catalogSourcesRouter } from "./routers/catalogSources";
import { catalogRouter } from "./routers/catalog";
import { creativeBuilderRouter } from "./routers/creativeBuilder";
import { assetLibraryRouter } from "./routers/assetLibrary";
import { authClient } from "./auth/supabase";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await authClient(ctx.req, ctx.res).auth.signOut({ scope: "local" });
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
  creativeBuilder: creativeBuilderRouter,
  assetLibrary: assetLibraryRouter,
  meta: metaRouter,
  crawl: crawlRouter,
  catalog: catalogRouter,
  catalogSources: catalogSourcesRouter,
});

export type AppRouter = typeof appRouter;
