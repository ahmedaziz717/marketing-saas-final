import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { insightRuns, type InsightRunRow } from "../../drizzle/insightsSchema";
import { getDb } from "../db";
import { requireOrganizationRole } from "./access";
import {
  insightRecipients,
  reportById,
  reportEditors,
  type InsightsDatabase,
} from "./insights";
import { insightPdf } from "./insightPdf";
import { siteOrigins } from "./siteOrigins";

function emailConfig() {
  const key =
    process.env.REPORT_RESEND_API_KEY || process.env.CONTACT_RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM || process.env.CONTACT_EMAIL_FROM;
  const app = siteOrigins().app;
  const address = from?.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/)?.[1] || from;
  return key &&
    from &&
    !/[\r\n]/.test(from) &&
    z.email().safeParse(address).success &&
    app
    ? { key, from, app }
    : null;
}
export const insightEmailConfigured = () => !!emailConfig();
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
export async function insightEmailBody(run: InsightRunRow, app: string) {
  if (!run.deliveryPayload)
    throw new Error("Email recipients are not prepared.");
  const link = `${app}/app/analytics/studio?id=${run.reportId}&run=${run.id}`;
  const status =
    run.status === "failed"
      ? "needs attention"
      : run.status === "partial"
        ? "ready with partial data"
        : "ready";
  const period = run.result
    ? `${run.result.range.since} to ${run.result.range.until}`
    : "See run details";
  const findings = run.result?.findings ?? [
    run.error || "The report did not complete.",
  ];
  const intro = `${run.config.name} is ${status}.`;
  return {
    from: run.deliveryPayload.from,
    to: run.deliveryPayload.recipients.map(r => r.email),
    subject: `[EvokeLoop] ${run.config.name} · ${status}`,
    text: [
      intro,
      period,
      "",
      ...findings,
      "",
      `View report: ${link}`,
      "Sign in with your workspace account to open the report.",
    ].join("\n"),
    html: `<div style="background:#f0f5f7;padding:28px;font-family:Arial,sans-serif;color:#17283d"><div style="max-width:600px;margin:auto;background:white;padding:30px;border-top:5px solid #087e83;border-radius:12px"><p style="font-size:12px;letter-spacing:2px;color:#087e83">EVOKELOOP / INSIGHTS STUDIO</p><h1 style="font-size:24px;line-height:1.3">${escape(intro)}</h1><p style="color:#5d6d7d">${escape(period)}</p>${findings.map(f => `<p style="font-size:14px;line-height:1.6">${escape(f)}</p>`).join("")}<p style="margin:28px 0"><a href="${escape(link)}" style="padding:13px 20px;background:#087e83;color:white;text-decoration:none;border-radius:8px">Open report</a></p><p style="font-size:12px;color:#5d6d7d">Sign in with your workspace account. ${run.status === "partial" ? "Some data is unavailable; check the source notes before using this report." : "Source notes and attribution details are included in the report."}</p></div></div>`,
    ...(run.result && run.config.delivery.attachPdf
      ? {
          attachments: [
            {
              filename: "evokeloop-insights.pdf",
              content: (await insightPdf(run)).toString("base64"),
            },
          ],
        }
      : {}),
  };
}
export async function deliverNextInsight(
  db: InsightsDatabase,
  now = Date.now()
) {
  const config = emailConfig();
  if (!config) {
    // Make a missing deployment setting visible instead of leaving an endless spinner.
    await db
      .update(insightRuns)
      .set({
        deliveryState: "failed",
        deliveryError:
          "Email delivery is not configured. Your report is available in Results.",
      })
      .where(
        and(
          eq(insightRuns.deliveryState, "pending"),
          lte(insightRuns.deliveryNextAtMs, now)
        )
      );
    return false;
  }
  const lease = randomUUID();
  const run = await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(insightRuns)
      .where(
        and(
          inArray(insightRuns.deliveryState, ["pending", "sending"]),
          lte(insightRuns.deliveryNextAtMs, now),
          lte(insightRuns.deliveryLeaseUntilMs, now)
        )
      )
      .orderBy(asc(insightRuns.createdAtMs))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    const [claimed] = await tx
      .update(insightRuns)
      .set({
        deliveryState: "sending",
        deliveryLeaseId: lease,
        deliveryLeaseUntilMs: now + 120000,
        deliveryAttempts: sql`${insightRuns.deliveryAttempts} + 1`,
        deliveryFirstAtMs: sql`coalesce(${insightRuns.deliveryFirstAtMs}, ${now})`,
      })
      .where(eq(insightRuns.id, row.id))
      .returning();
    return claimed;
  });
  if (!run) return false;
  const owned = and(
    eq(insightRuns.id, run.id),
    eq(insightRuns.deliveryLeaseId, lease)
  );
  const failure = async (message: string, permanent = false) => {
    const terminal =
      permanent ||
      run.deliveryAttempts >= 8 ||
      now - run.deliveryFirstAtMs! >= 23 * 3600000;
    await db
      .update(insightRuns)
      .set({
        deliveryState: terminal ? "failed" : "pending",
        deliveryError: message,
        deliveryLeaseId: null,
        deliveryLeaseUntilMs: 0,
        deliveryNextAtMs:
          now + Math.min(3600000, 60000 * 2 ** (run.deliveryAttempts - 1)),
      })
      .where(owned);
  };
  if (now - run.deliveryFirstAtMs! >= 23 * 3600000) {
    await failure(
      "Email retry window expired. Run the report again to send a new notification.",
      true
    );
    return true;
  }
  try {
    await requireOrganizationRole(run.actorUserId, run.organizationId, [
      ...reportEditors,
    ]);
    await reportById(db, run.organizationId, run.reportId);
    const active = (await insightRecipients(db, run.organizationId)).filter(
      r => r.email && z.email().safeParse(r.email).success
    );
    if (!run.deliveryPayload) {
      const recipients = active
        .filter(r => run.config.delivery.recipientUserIds.includes(r.userId))
        .map(r => ({ userId: r.userId, email: r.email! }));
      if (recipients.length !== run.config.delivery.recipientUserIds.length) {
        await failure(
          "A recipient no longer has workspace access or a valid email. Review recipients and run again.",
          true
        );
        return true;
      }
      run.deliveryPayload = { recipients, from: config.from };
      await db
        .update(insightRuns)
        .set({ deliveryPayload: run.deliveryPayload })
        .where(owned);
    }
    if (
      !run.deliveryPayload.recipients.length ||
      run.deliveryPayload.recipients.some(
        r => !active.some(a => a.userId === r.userId && a.email === r.email)
      )
    ) {
      await failure(
        "Recipient access changed. Review recipients and run again.",
        true
      );
      return true;
    }
  } catch {
    await failure(
      "Workspace access changed. Review the report before sending it again.",
      true
    );
    return true;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `evokeloop-insight/${run.id}`,
      },
      body: JSON.stringify(await insightEmailBody(run, config.app)),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await failure(
        `Email provider returned ${response.status}.`,
        ![408, 409, 429].includes(response.status) && response.status < 500
      );
      return true;
    }
    const data = await response.json();
    if (typeof data?.id !== "string") {
      await failure("Email provider response could not be verified.");
      return true;
    }
    await db
      .update(insightRuns)
      .set({
        deliveryState: "sent",
        deliveredAtMs: Date.now(),
        deliveryError: null,
        deliveryLeaseId: null,
        deliveryLeaseUntilMs: 0,
      })
      .where(owned);
  } catch {
    await failure(
      "Email delivery could not be confirmed. A safe retry is scheduled."
    );
  }
  return true;
}
export function startInsightDelivery() {
  let active: Promise<unknown> | undefined;
  const tick = () => {
    if (!active)
      active = getDb()
        .then(db => db && deliverNextInsight(db))
        .catch(() => console.error("Report delivery iteration failed"))
        .finally(() => {
          active = undefined;
        });
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
