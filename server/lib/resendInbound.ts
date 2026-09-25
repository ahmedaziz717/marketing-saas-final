import express, { type Express, type ErrorRequestHandler } from "express";
import { Resend } from "resend";
import { and, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { inboundPrivacyEmails } from "../../drizzle/websiteSchema";
import { getDb } from "../db";

export const RESEND_INBOUND_PATH = "/api/webhooks/resend/inbound";
const forwardingAddresses = new Set([
  "privacy@evokeloop.com",
  "support@evokeloop.com",
]);
const leaseMs = 10 * 60_000;
const retryWindowMs = 23 * 60 * 60_000;
const eventSchema = z.object({
  type: z.literal("email.received"),
  data: z.object({
    email_id: z.uuid(),
    from: z.string().max(1000),
    to: z.array(z.string().max(1000)).max(100),
    received_for: z.array(z.string().max(1000)).max(100).optional(),
  }),
});
function mailbox(value: string) {
  return (value.match(/<([^<>]+)>$/)?.[1] || value).trim().toLowerCase();
}
function configuration() {
  const key = process.env.RESEND_RECEIVING_API_KEY?.trim();
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const to = process.env.CONTACT_NOTIFICATION_EMAIL?.trim();
  const from = process.env.CONTACT_EMAIL_FROM?.trim();
  const issues: string[] = [];
  if (!key) issues.push("RESEND_RECEIVING_API_KEY");
  if (!secret) issues.push("RESEND_WEBHOOK_SECRET");
  if (
    !to ||
    !z.email().safeParse(to).success ||
    to.toLowerCase().endsWith("@evokeloop.com")
  )
    issues.push("CONTACT_NOTIFICATION_EMAIL");
  if (
    !from ||
    !z.email().safeParse(mailbox(from)).success ||
    /[\r\n]/.test(from)
  )
    issues.push("CONTACT_EMAIL_FROM");
  return {
    issues,
    config: issues.length
      ? null
      : { key: key!, secret: secret!, to: to!, from: from! },
  };
}
const config = () => configuration().config;

export function registerResendInbound(app: Express) {
  // This exact signed route precedes the JSON parser and browser-origin guard.
  // Browser routes retain their existing CSRF protection.
  app.get(RESEND_INBOUND_PATH, (_req, res) => {
    res.set("Cache-Control", "no-store").json({
      endpoint: "resend-inbound",
      method: "POST",
      configured: Boolean(config()),
      invalidOrMissing: configuration().issues,
    });
  });
  app.post(
    RESEND_INBOUND_PATH,
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const cfg = config();
      if (!cfg) {
        res.status(503).json({ error: "Receiving is not configured" });
        return;
      }
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "JSON body required" });
        return;
      }
      const resend = new Resend(cfg.key);
      let verified: unknown;
      try {
        verified = resend.webhooks.verify({
          payload: req.body.toString("utf8"),
          headers: {
            id: req.get("svix-id") || "",
            timestamp: req.get("svix-timestamp") || "",
            signature: req.get("svix-signature") || "",
          },
          webhookSecret: cfg.secret,
        });
      } catch {
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
      if ((verified as { type?: string })?.type !== "email.received") {
        res.json({ ignored: true });
        return;
      }
      const parsed = eventSchema.safeParse(verified);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid event" });
        return;
      }
      const event = parsed.data.data;
      // SMTP envelope recipients take precedence over user-controlled To headers.
      const recipients = event.received_for?.length
        ? event.received_for
        : event.to;
      const matchedAddresses = [...new Set(recipients.map(mailbox))].filter(
        address => forwardingAddresses.has(address)
      );
      if (!matchedAddresses.length) {
        res.json({ ignored: true });
        return;
      }
      let db: Awaited<ReturnType<typeof getDb>>;
      let lease: number | undefined;
      const now = Date.now();
      const id = event.email_id;
      try {
        db = await getDb();
        if (!db) throw new Error("Database unavailable");
        // Snapshot destination and introductory text: retries must send identical data.
        await db
          .insert(inboundPrivacyEmails)
          .values({
            id,
            sender: cfg.from,
            recipient: cfg.to,
            intro: `A message was sent to ${matchedAddresses.join(", ")}.\nOriginal sender: ${event.from.replace(/[\r\n]/g, " ")}\n\nOpen the attached original email to read and reply to the sender. Its attachments are preserved inside it.\nPlease respond within two business days.`,
            createdAtMs: now,
          })
          .onConflictDoNothing();
        const [saved] = await db
          .select()
          .from(inboundPrivacyEmails)
          .where(eq(inboundPrivacyEmails.id, id));
        if (saved.state === "sent") {
          res.json({ received: true });
          return;
        }
        if (
          saved.firstAttemptAtMs &&
          now - saved.firstAttemptAtMs >= retryWindowMs
        ) {
          console.warn("Inbound email forwarding needs manual review", {
            emailId: id,
            code: "retry_window_expired",
          });
          res.status(503).json({ error: "Forwarding requires review" });
          return;
        }
        lease = now + leaseMs;
        const [claimed] = await db
          .update(inboundPrivacyEmails)
          .set({
            leaseUntilMs: lease,
            firstAttemptAtMs: sql`coalesce(${inboundPrivacyEmails.firstAttemptAtMs}, ${now})`,
          })
          .where(
            and(
              eq(inboundPrivacyEmails.id, id),
              eq(inboundPrivacyEmails.state, "pending"),
              lte(inboundPrivacyEmails.leaseUntilMs, now)
            )
          )
          .returning();
        if (!claimed) {
          res.status(503).json({ error: "Forwarding in progress; retry" });
          return;
        }
        const { data, error } = await resend.emails.receiving.forward(
          {
            emailId: id,
            from: claimed.sender,
            to: claimed.recipient,
            passthrough: false,
            text: claimed.intro,
          },
          { idempotencyKey: `evokeloop-privacy/${id}` }
        );
        if (error || !data?.id)
          throw new Error("Provider did not accept forwarding");
        await db
          .update(inboundPrivacyEmails)
          .set({
            state: "sent",
            providerId: data.id,
            sentAtMs: Date.now(),
            leaseUntilMs: 0,
          })
          .where(
            and(
              eq(inboundPrivacyEmails.id, id),
              eq(inboundPrivacyEmails.leaseUntilMs, lease)
            )
          );
        res.json({ received: true });
      } catch {
        // Returning non-2xx lets Resend retry. Never acknowledge an unsent email.
        if (lease) {
          try {
            const recoveryDb = await getDb();
            await recoveryDb
              ?.update(inboundPrivacyEmails)
              .set({ leaseUntilMs: 0 })
              .where(
                and(
                  eq(inboundPrivacyEmails.id, id),
                  eq(inboundPrivacyEmails.leaseUntilMs, lease)
                )
              );
          } catch {
            /* lease expires if the database is temporarily unavailable */
          }
        }
        console.warn("Inbound email forwarding deferred", { emailId: id });
        res.status(503).json({ error: "Forwarding temporarily unavailable" });
      }
    }
  );
  const parseError: ErrorRequestHandler = (_err, _req, res, _next) => {
    res
      .status(400)
      .set("Cache-Control", "no-store")
      .json({ error: "Invalid webhook body" });
  };
  app.use(RESEND_INBOUND_PATH, parseError);
}
