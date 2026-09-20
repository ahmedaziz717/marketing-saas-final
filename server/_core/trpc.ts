import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertLibraryConsumer, hasLibraryPolicy } from "../lib/assetApproval";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser).use(async opts => {
  // Only old generation/publishing/review routes need this compatibility boundary.
  // It executes for both HTTP requests and server-side createCaller invocations.
  if (hasLibraryPolicy(opts.path)) {
    await assertLibraryConsumer(opts.path, await opts.getRawInput(), opts.ctx.user.id);
  }
  return opts.next();
});

export const adminProcedure = t.procedure.use(t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
}));
