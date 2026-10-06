import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publications } from "../../drizzle/channelSchema";
import { users } from "../../drizzle/schema";
import {
  workflowNodes,
  type WorkflowNode,
  type WorkflowStep,
  type WorkflowValue,
} from "../../shared/creativeWorkflow";
import {
  contentSchema,
  previousRange,
  rangeSchema,
} from "../../shared/channels";
import { presetRange } from "../../shared/reportDates";
import {
  compareEvidence,
  evaluateEvidence,
} from "../../shared/workflowPlatform";
import { metaChangeSchema } from "../../shared/metaManagement";
import { publishingRouter } from "../routers/channels";
import type { TrpcContext } from "../_core/context";
import { getConnection } from "./channelConnections";
import { adsReport, facebookReport } from "./channelReports";
import { readMetaObject, reviewMetaChange } from "./metaManagement";
import { readLibraryAsset, type LibraryDatabase } from "./assetLibrary";
import { liveDeliveryEnabled } from "./publications";
import { requireOrganizationRole } from "./access";
import { stableHash } from "./policy";
import type { CreativeWorkflowRun } from "./creativeWorkflows";

export function publicationWorkflowHash(
  item: typeof publications.$inferSelect
) {
  return stableHash({
    content: item.content,
    assetKey: item.assetKey,
    connectionId: item.connectionId,
    channel: item.channel,
    scheduledAtMs: item.scheduledAtMs,
    timezone: item.timezone,
  });
}
function publicationId(runId: string, nodeId: string) {
  const h = createHash("sha256").update(`${runId}:${nodeId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const complete = (outputs: WorkflowValue[]): WorkflowStep => ({
  status: "completed",
  outputs,
  finishedAtMs: Date.now(),
});
const waiting = (
  step: WorkflowStep,
  waitingReason: string,
  extra: Partial<WorkflowStep> = {}
): WorkflowStep => ({
  ...step,
  status: "waiting",
  waitingReason,
  startedAtMs: step.startedAtMs ?? Date.now(),
  ...extra,
});

export async function executeWorkflowBusinessStep(
  db: LibraryDatabase,
  run: CreativeWorkflowRun,
  node: WorkflowNode,
  input: WorkflowValue[]
): Promise<WorkflowStep | null> {
  const step = run.steps[node.id],
    now = Date.now();
  if (node.type === "app_output") return complete(input);
  if (node.type === "app_input")
    return complete([
      ...input,
      ...(node.config.text
        ? [{ type: "text" as const, text: node.config.text }]
        : []),
    ]);
  if (node.type === "review") {
    const hash = stableHash(input);
    if (step.approvedByUserId && step.reviewHash === hash)
      return complete(input);
    return waiting(
      step,
      "An authorized reviewer must approve these exact inputs.",
      {
        outputs: input,
        reviewHash: hash,
        approvedByUserId: undefined,
        approvedAtMs: undefined,
      }
    );
  }
  if (node.type === "wait") {
    const wakeAtMs =
      step.wakeAtMs ?? now + (node.config.waitMinutes ?? 60) * 60000;
    return now >= wakeAtMs
      ? complete(input)
      : waiting(step, `Waiting until ${new Date(wakeAtMs).toISOString()}.`, {
          wakeAtMs,
          outputs: input,
        });
  }
  if (node.type === "compare_metrics") {
    const values = (port: string) =>
      run.graph.edges
        .filter(e => e.target === node.id && e.port === port)
        .flatMap(e => run.steps[e.source]?.outputs ?? [])
        .find(v => v.type === "data");
    const current = values("current"),
      baseline = values("baseline");
    if (current?.type !== "data" || baseline?.type !== "data")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Connect current and baseline performance reports.",
      });
    try {
      return complete([
        {
          type: "data",
          name: "Period comparison",
          data: compareEvidence(current.data, baseline.data),
        },
      ]);
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: (error as Error).message,
      });
    }
  }
  if (node.type === "optimize_metric") {
    const evidence = input.find(v => v.type === "data");
    if (evidence?.type !== "data")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Connect a performance report to evaluate the objective.",
      });
    return complete([
      {
        type: "decision",
        name: "Objective evaluation",
        data: evaluateEvidence(evidence.data, node.config),
      },
    ]);
  }
  if (["meta_report", "facebook_report"].includes(node.type)) {
    const channel = node.type === "meta_report" ? "meta_ads" : "facebook";
    const c = await getConnection(
      db,
      run.organizationId,
      node.config.connectionId!,
      channel
    );
    const timezone =
      channel === "facebook" ? "UTC" : (c.details.timezone ?? "UTC");
    const selected =
      node.config.datePreset === "custom"
        ? rangeSchema.parse(node.config.range)
        : presetRange(node.config.datePreset ?? "30", now, timezone);
    const range = node.config.previousPeriod
      ? previousRange(selected)
      : selected;
    if (channel === "meta_ads") {
      const report = await adsReport(c, range);
      const campaign = node.config.campaignId
        ? report.campaigns.find(r => r.id === node.config.campaignId)
        : null;
      return complete([
        {
          type: "data",
          name: `${c.name} · Meta performance`,
          data: {
            channel,
            accountId: c.accountId,
            campaignId: node.config.campaignId || null,
            range,
            observedAtMs: now,
            currency: report.currency,
            timezone: report.timezone,
            attribution: report.attribution,
            metrics: node.config.campaignId ? (campaign ?? {}) : report.summary,
            incomplete:
              report.truncated || (!!node.config.campaignId && !campaign),
            report,
          },
        },
      ]);
    }
    const report = await facebookReport(c, range);
    return complete([
      {
        type: "data",
        name: `${c.name} · Facebook performance`,
        data: {
          channel,
          accountId: c.accountId,
          campaignId: null,
          range,
          observedAtMs: now,
          currency: null,
          timezone: "UTC",
          attribution: report.note,
          metrics: Object.fromEntries(
            report.series.map(s => [s.metric, s.total])
          ),
          incomplete: report.truncated || !!report.warnings.length,
          report,
        },
      },
    ]);
  }
  if (node.type === "meta_activate") {
    await requireOrganizationRole(run.actorUserId, run.organizationId, [
      "owner",
      "admin",
      "publisher",
    ]);
    if (step.outputs?.length && step.approvedByUserId)
      return complete(step.outputs);
    if (step.reviewData)
      return waiting(
        step,
        "Review this ad and explicitly confirm activation. Existing budgets and targeting apply."
      );
    const c = await getConnection(
      db,
      run.organizationId,
      node.config.connectionId!,
      "meta_ads"
    );
    const ad = await readMetaObject(c, "ad", node.config.adId!);
    const change = metaChangeSchema.parse({
      kind: "update_ad",
      objectId: node.config.adId,
      name: String(ad.name),
      status: "ACTIVE",
    });
    const review = await reviewMetaChange(c, run.actorUserId, change);
    return waiting(
      step,
      "Review this ad and explicitly confirm activation. Existing budgets and targeting apply.",
      {
        reviewData: {
          before: review.before,
          params: review.params,
          warnings: review.warnings,
          ticket: review.ticket,
          change,
        },
      }
    );
  }
  if (!["facebook_post", "meta_ad", "deliver_publication"].includes(node.type))
    return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, run.actorUserId));
  if (!user)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The workflow owner is unavailable.",
    });
  const caller = publishingRouter.createCaller({
    user,
    req: {},
    res: {},
  } as TrpcContext);
  if (node.type === "deliver_publication") {
    await requireOrganizationRole(run.actorUserId, run.organizationId, [
      "owner",
      "admin",
      "publisher",
    ]);
    const reference = input.find(v => v.type === "publication");
    if (reference?.type !== "publication")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Connect a publication before scheduling delivery.",
      });
    const item = await caller.get({
      organizationId: run.organizationId,
      id: reference.id,
    });
    if (reference.fingerprint !== publicationWorkflowHash(item))
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This publication was edited outside the workflow. Review and deliver it from Publishing, or run a new workflow.",
      });
    if (
      [
        "rejected",
        "changes_requested",
        "cancelled",
        "failed",
        "delivery_unknown",
      ].includes(item.state)
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "This publication needs attention. Open it in Publishing before continuing.",
      });
    if (item.state === "published")
      return complete([{ ...reference, revision: item.revision }]);
    if (["draft", "needs_review"].includes(item.state))
      return waiting(
        step,
        "Open the publication to approve its content and destination.",
        { publicationId: item.id, outputs: [reference] }
      );
    if (!liveDeliveryEnabled(item.channel))
      return waiting(
        step,
        "Live delivery is disabled. This publication will not be sent.",
        { publicationId: item.id, outputs: [reference] }
      );
    if (item.state === "approved")
      await caller.queue({
        organizationId: run.organizationId,
        id: item.id,
        revision: item.revision,
        confirm: true,
        mode: "live",
      });
    return waiting(
      step,
      item.scheduledAtMs && item.scheduledAtMs > now
        ? "Approved and scheduled. Waiting for the delivery receipt."
        : "Waiting for the publishing service to confirm delivery.",
      { publicationId: item.id, outputs: [reference] }
    );
  }
  const id = publicationId(run.id, node.id);
  let [item] = await db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.id, id),
        eq(publications.organizationId, run.organizationId)
      )
    );
  if (!item) {
    const images = input.filter(
      (v): v is Extract<WorkflowValue, { type: "image" | "video" }> =>
        v.type === "image"
    );
    if (images.length > 1)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose one image for this publication step.",
      });
    const image = images[0];
    if (image) {
      const asset = await readLibraryAsset(db, run.organizationId, image.key);
      if (asset.state !== "approved" || asset.purpose !== "finished")
        return waiting(
          step,
          "Approve this image as a finished asset in the Asset Library, then this step will continue.",
          { outputs: [image] }
        );
    }
    if (node.type === "meta_ad" && !image)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "The Meta ad step needs an approved image from its connected App or image step.",
      });
    const message = [
      ...input.filter(v => v.type === "text").map(v => v.text),
      node.config.text,
    ]
      .filter(Boolean)
      .join("\n\n");
    item = await caller.save({
      organizationId: run.organizationId,
      id,
      revision: 0,
      channel: node.type === "meta_ad" ? "meta_ads" : "facebook",
      connectionId: node.config.connectionId!,
      assetKey: image?.key ?? null,
      scheduledAtMs: node.config.scheduledAtMs ?? null,
      timezone: node.config.timezone ?? "UTC",
      content: contentSchema.parse({
        title: node.title,
        message,
        headline: node.config.headline ?? "",
        link: node.config.destinationUrl ?? "",
        adSetId: node.config.adSetId ?? "",
        metaCampaignId: node.config.campaignId,
      }),
    });
  }
  if (item.state === "draft") {
    await caller.submit({
      organizationId: run.organizationId,
      id,
      revision: item.revision,
    });
    item = await caller.get({ organizationId: run.organizationId, id });
  }
  return complete([
    {
      type: "publication",
      id: item.id,
      revision: item.revision,
      name: item.content.title,
      channel: item.channel,
      fingerprint: publicationWorkflowHash(item),
    },
  ]);
}
