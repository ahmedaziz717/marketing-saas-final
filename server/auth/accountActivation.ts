import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { platformAccounts, platformAudit } from "../../drizzle/platformSchema";
import { organizations, organizationMemberships } from "../../drizzle/schema";
import { libraryDatabase } from "../lib/assetLibrary";
import { withOrganizationTransaction } from "../lib/activity";
import { authClient, resolveAuthUser } from "./supabase";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function assertActiveInvitation(account: any, token: string) {
  if (!account || account.inviteHash !== hash(token))
    throw new Error(
      "This invitation has been replaced or already accepted. Open the latest invitation email."
    );
  if (!account.inviteExpiresAtMs || account.inviteExpiresAtMs <= Date.now())
    throw new Error("This invitation has expired. Ask EvokeLoop to resend it.");
}
export function invitationAuthAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Account activation is temporarily unavailable.");
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  ).auth.admin;
}
export function registerAccountActivation(app: Express, guard: RequestHandler) {
  // POST bodies keep bearer tokens out of API access logs; viewing never consumes a link.
  app.post("/api/auth/account-invite/details", guard, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const input = z.object({ token: tokenSchema }).safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({ error: "Invalid invitation link." });
    try {
      const db = await libraryDatabase();
      const [account] = await db
        .select()
        .from(platformAccounts)
        .where(eq(platformAccounts.inviteHash, hash(input.data.token)));
      assertActiveInvitation(account, input.data.token);
      const [workspace] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, account.organizationId));
      res.json({ email: account.ownerEmail, workspace: workspace.name });
    } catch (e) {
      res
        .status(400)
        .json({
          error:
            e instanceof Error && /invitation/.test(e.message)
              ? e.message
              : "Unable to load your invitation. Please try again.",
        });
    }
  });
  app.post("/api/auth/account-invite/activate", guard, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const input = z
      .object({ token: tokenSchema, password: z.string().min(12).max(128) })
      .safeParse(req.body);
    if (!input.success)
      return void res
        .status(400)
        .json({
          error: "Use a valid invitation and a password of 12–128 characters.",
        });
    try {
      const db = await libraryDatabase();
      const [initial] = await db
        .select()
        .from(platformAccounts)
        .where(eq(platformAccounts.inviteHash, hash(input.data.token)));
      assertActiveInvitation(initial, input.data.token);
      const result = await withOrganizationTransaction(
        db,
        initial.organizationId,
        async tx => {
          const [account] = await tx
            .select()
            .from(platformAccounts)
            .where(eq(platformAccounts.organizationId, initial.organizationId));
          assertActiveInvitation(account, input.data.token);
          const email = account.ownerEmail!.trim().toLowerCase();
          // A valid, unexpired email invitation proves control of this email address.
          // Never change a pre-existing identity's password or confirmation state.
          const created = await invitationAuthAdmin().createUser({
            email,
            password: input.data.password,
            email_confirm: true,
          });
          if (
            created.error &&
            !["email_exists", "user_already_exists"].includes(
              created.error.code || ""
            )
          )
            throw new Error(
              created.error.code === "weak_password"
                ? "Please choose a stronger password."
                : "Account activation is temporarily unavailable. Please try again."
            );
          const { data, error } = await authClient(
            req,
            res
          ).auth.signInWithPassword({ email, password: input.data.password });
          if (
            error ||
            !data.user?.email_confirmed_at ||
            data.user.email?.toLowerCase() !== email
          )
            throw new Error(
              created.error
                ? "This email already has an EvokeLoop login. Enter its existing password, or use password reset, then reopen this invitation."
                : "Your login was created, but sign-in could not finish. Retry with the same password."
            );
          const user = await resolveAuthUser(data.user);
          if (!user)
            throw new Error(
              "Unable to activate this account. Contact support."
            );
          await tx
            .insert(organizationMemberships)
            .values({
              organizationId: account.organizationId,
              userId: user.id,
              role: "owner",
              status: "active",
              createdAtMs: Date.now(),
            })
            .onConflictDoUpdate({
              target: [
                organizationMemberships.organizationId,
                organizationMemberships.userId,
              ],
              set: { role: "owner", status: "active" },
            });
          await tx
            .update(platformAccounts)
            .set({
              inviteHash: null,
              inviteExpiresAtMs: null,
              updatedAtMs: Date.now(),
            })
            .where(eq(platformAccounts.organizationId, account.organizationId));
          await tx
            .insert(platformAudit)
            .values({
              actorUserId: user.id,
              organizationId: account.organizationId,
              action: "account.invite_accepted",
              payload: { source: "owner_activation" },
              createdAtMs: Date.now(),
            });
          return {
            userId: user.id,
            organizationId: account.organizationId,
            redirectTo: "/app",
          };
        }
      );
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const safe =
        /^(This invitation|Please choose|Account activation|This email already|Your login was created|Unable to activate)/.test(
          message
        );
      res
        .status(400)
        .json({
          error: safe
            ? message
            : "Activation could not finish. Please try again with the same password.",
        });
    }
  });
}
