import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { websiteRequests } from "../../drizzle/websiteSchema";
import { getDb } from "../db";
import { siteOrigins } from "./siteOrigins";

type ContactRequest = typeof websiteRequests.$inferSelect;
type NotificationConfig = {
  key: string;
  from: string;
  to: string;
  app: string;
};
const retryStates = ["pending", "retrying"];
const LEASE_MS = 60_000;
// Resend deduplicates for 24 hours. Stop uncertain retries before that expires.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const topicNames: Record<string, string> = {
  access: "Sales and plans",
  demo: "Product walkthrough",
  support: "Support",
  privacy: "Privacy request",
  deletion: "Data deletion request",
};

function notificationConfig(): NotificationConfig | null {
  const key = process.env.CONTACT_RESEND_API_KEY;
  const from = process.env.CONTACT_EMAIL_FROM;
  const to = process.env.CONTACT_NOTIFICATION_EMAIL || "ahmed.aziz@cybertron.com";
  const app = siteOrigins().app;
  const senderAddress = from?.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/)?.[1] || from;
  if (
    !key ||
    !from ||
    !app ||
    /[\r\n]/.test(from) ||
    !z.email().safeParse(senderAddress).success ||
    !z.email().safeParse(to).success
  )
    return null;
  return { key, from, to, app };
}
export const websiteEmailConfigured = () => Boolean(notificationConfig());

export function contactNotificationBody(
  request: ContactRequest,
  config: NotificationConfig
) {
  return {
    from: config.from,
    to: [config.to],
    reply_to: request.email,
    subject: `[EvokeLoop] ${topicNames[request.topic] || "Contact request"} · ${request.id.slice(0, 8)}`,
    // Plain text keeps visitor-supplied content out of HTML and email headers.
    text: [
      "New EvokeLoop contact request",
      "Please respond within two business days.",
      "",
      `Request: ${request.id}`,
      `Received: ${new Date(request.createdAtMs).toISOString()}`,
      `Topic: ${topicNames[request.topic] || request.topic}`,
      `Name: ${request.name}`,
      `Email: ${request.email}`,
      `Business/workspace: ${request.workspace || "Not supplied"}`,
      "",
      "Message:",
      request.message,
      "",
      `Manage this request: ${config.app}/app/platform/website`,
      "Reply to this email to contact the requester. Verify identity and authority before fulfilling a privacy request.",
    ].join("\n"),
  };
}

export async function deliverWebsiteRequest(id: string, now = Date.now()) {
  const config = notificationConfig();
  if (!config) return false;
  const db = await getDb();
  if (!db) return false;
  const lease = now + LEASE_MS;
  // A conditional update is the lease: concurrent processes cannot send the same row.
  const [request] = await db
    .update(websiteRequests)
    .set({
      emailLeaseUntilMs: lease,
      emailAttempts: sql`${websiteRequests.emailAttempts} + 1`,
      emailFirstAttemptAtMs: sql`coalesce(${websiteRequests.emailFirstAttemptAtMs}, ${now})`,
    })
    .where(
      and(
        eq(websiteRequests.id, id),
        inArray(websiteRequests.emailState, retryStates),
        lte(websiteRequests.emailNextAttemptAtMs, now),
        lte(websiteRequests.emailLeaseUntilMs, now)
      )
    )
    .returning();
  if (!request) return false;
  const owned = and(
    eq(websiteRequests.id, id),
    eq(websiteRequests.emailLeaseUntilMs, lease)
  );
  const recordFailure = async (code: string, permanent = false) => {
    const exhausted =
      permanent ||
      request.emailAttempts >= 10 ||
      now - request.emailFirstAttemptAtMs! >= RETRY_WINDOW_MS;
    await db
      .update(websiteRequests)
      .set({
        emailState: exhausted ? "needs_attention" : "retrying",
        emailNextAttemptAtMs:
          now + Math.min(60_000 * 2 ** (request.emailAttempts - 1), 3_600_000),
        emailLeaseUntilMs: 0,
        emailLastError: code,
      })
      .where(owned);
    console.warn("Contact email delivery deferred", {
      requestId: id,
      code,
      needsAttention: exhausted,
    });
    return false;
  };
  if (now - request.emailFirstAttemptAtMs! >= RETRY_WINDOW_MS)
    return recordFailure("idempotency_window_expired", true);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `evokeloop-contact/${id}`,
      },
      body: JSON.stringify(contactNotificationBody(request, config)),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return recordFailure("network_or_timeout");
  }
  if (!response.ok) {
    const retryable =
      [408, 409, 429].includes(response.status) || response.status >= 500;
    return recordFailure(`provider_http_${response.status}`, !retryable);
  }
  const payload = await response.json().catch(() => null);
  if (typeof payload?.id !== "string" || !payload.id || payload.id.length > 128)
    return recordFailure("provider_response_invalid");
  // If the DB write fails, the lease expires and the same provider key deduplicates the retry.
  await db
    .update(websiteRequests)
    .set({
      emailState: "sent",
      emailSentAtMs: Date.now(),
      emailProviderId: payload.id,
      emailLeaseUntilMs: 0,
      emailLastError: null,
    })
    .where(owned);
  return true;
}

export async function processWebsiteNotifications() {
  if (!websiteEmailConfigured()) return;
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  const pending = await db
    .select({ id: websiteRequests.id })
    .from(websiteRequests)
    .where(
      and(
        inArray(websiteRequests.emailState, retryStates),
        lte(websiteRequests.emailNextAttemptAtMs, now),
        lte(websiteRequests.emailLeaseUntilMs, now)
      )
    )
    .orderBy(asc(websiteRequests.createdAtMs))
    .limit(10);
  for (const request of pending) await deliverWebsiteRequest(request.id);
}

export function startWebsiteNotificationDelivery() {
  let active: Promise<void> | undefined;
  const tick = () => {
    if (active) return;
    active = processWebsiteNotifications()
      .catch(() => {
        console.error("Contact email delivery check failed");
      })
      .finally(() => {
        active = undefined;
      });
  };
  const timer = setInterval(tick, 30_000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
