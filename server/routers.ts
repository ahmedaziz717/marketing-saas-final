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
import { channelsRouter, publishingRouter } from "./routers/channels";
import { billingRouter } from "./routers/billing";
import { authClient } from "./auth/supabase";

import { publicWebsiteAdminRouter } from "./routers/publicWebsite";

export const appRouter = router({
  system: systemRouter,
  publicWebsiteAdmin: publicWebsiteAdminRouter,
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
  billing: billingRouter,
  brand: brandRouter,
  briefs: briefsRouter,
  activity: activityRouter,
  creatives: creativesRouter,
  creativeBuilder: creativeBuilderRouter,
  assetLibrary: assetLibraryRouter,
  meta: metaRouter,
  channels: channelsRouter,
  publishing: publishingRouter,
  crawl: crawlRouter,
  catalog: catalogRouter,
  catalogSources: catalogSourcesRouter,
});

export type AppRouter = typeof appRouter;
