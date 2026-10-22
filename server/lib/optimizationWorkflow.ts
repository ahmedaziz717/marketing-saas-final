import { TAXONOMY_VERSION } from "../../shared/optimization";
import { tagLiveCopyEvidence } from "./copyClassificationStore";
import {
  liveSchedulingReport,
  schedulingRecommendation,
} from "./liveMetaScheduling";
import { presetRange } from "../../shared/reportDates";
import { performanceInputSchema } from "../../shared/workflowInputs";
import { getConnection } from "./channelConnections";
import { getOptimizationConnection } from "./optimizationConnections";
import { optimizerLibrary } from "../../shared/optimizerLibrary";
import { and, eq } from "drizzle-orm";
import { optimizationSyncs } from "../../drizzle/optimizationSchema";
import { publications } from "../../drizzle/channelSchema";
import {
  analysisQuerySchema,
  optimizerSchema,
} from "../../shared/optimization";
import type {
  WorkflowNode,
  WorkflowStep,
  WorkflowValue,
} from "../../shared/creativeWorkflow";
import type { LibraryDatabase } from "./assetLibrary";
import type { CreativeWorkflowRun } from "./creativeWorkflows";
import { requireOptimization } from "./optimizationFlags";
import { queueHistory } from "./optimizationIngestion";
import { analyzeHistory, classifyHistoryBatch } from "./optimizationAnalysis";
import { optimizeEvidence } from "./optimizerService";
import { liveMetaCopyReport, compareLiveCopy } from "./liveMetaCopy";
import { copyEvidenceSchema } from "../../shared/copyEvidence";
export async function optimizationStep(
  db: LibraryDatabase,
  run: CreativeWorkflowRun,
  node: WorkflowNode,
  input: WorkflowValue[]
): Promise<WorkflowStep | null> {
  const complete = (
    name: string,
    data: Record<string, unknown>
  ): WorkflowStep => ({
    status: "completed",
    outputs: [{ type: "data", name, data }],
    finishedAtMs: Date.now(),
  });
  if (node.type === "app_input" && node.config.performanceRequest) {
    requireOptimization(run.organizationId);
    const legacyFetch = run.graph.edges.some(
      e =>
        e.source === node.id &&
        run.graph.nodes.some(
          n =>
            n.id === e.target &&
            n.type === "optimize_dimension" &&
            n.config.optimizer?.kind === "weekday_time"
        )
    );
    if (!legacyFetch)
      return complete("Meta account and date selection", {
        source: "meta_performance_request",
        ...node.config.performanceRequest,
      });
    // Compatibility for already-running snapshots and pinned legacy Apps only.
    const c = await getConnection(
      db,
      run.organizationId,
      node.config.performanceRequest.connectionId,
      "meta_ads"
    );
    const data = await liveSchedulingReport(
      c,
      node.config.performanceRequest.range
    );
    return {
      status: "completed",
      outputs: [
        { type: "data", name: "Live Meta scheduling performance", data },
      ],
      finishedAtMs: Date.now(),
    };
  }
  if (node.type === "meta_copy_performance") {
    requireOptimization(run.organizationId);
    const value =
      input.length === 1 && input[0].type === "data" ? input[0].data : null;
    if (value?.source !== "meta_performance_request")
      throw new Error(
        "Connect an Account & date range field to Fetch Meta ad copy & results. Trigger metadata and account totals are not ad-level evidence."
      );
    const request = performanceInputSchema.parse(value);
    const c = await getConnection(
      db,
      run.organizationId,
      request.connectionId,
      "meta_ads"
    );
    if (c.status !== "connected")
      throw new Error(
        "Reconnect the selected Meta ad account before fetching ads."
      );
    return complete(
      "Live Meta ad copy & results",
      await liveMetaCopyReport(c, request.range)
    );
  }
  if (node.type === "compare_copy_styles") {
    requireOptimization(run.organizationId);
    const value =
      input.length === 1 && input[0].type === "data" ? input[0].data : null;
    const parsed = copyEvidenceSchema.safeParse(value);
    if (!parsed.success)
      throw new Error(
        "Connect Fetch Meta ad copy & results to Compare copy styles. This step requires individual ads, actual copy, and their matching performance."
      );
    const c = await getConnection(
      db,
      run.organizationId,
      parsed.data.connectionId,
      "meta_ads"
    );
    if (c.accountId.replace(/^act_/, "") !== parsed.data.accountId)
      throw new Error("Evidence does not match the connected account.");
    return complete(
      "Copy evidence report",
      compareLiveCopy(
        await tagLiveCopyEvidence(db, run.organizationId, parsed.data),
        node.config.copyComparison
      )
    );
  }
  if (node.type === "meta_performance") {
    requireOptimization(run.organizationId);
    const data =
      input.length === 1 && input[0].type === "data" ? input[0].data : null;
    if (
      !data ||
      !["meta_performance_request", "live_meta_scheduling"].includes(
        String(data.source)
      )
    )
      throw new Error(
        "Connect an Account & date range field to Fetch live Meta performance. Imported history is not a live account/date request."
      );
    const request = performanceInputSchema.parse(data);
    const connection = await getConnection(
      db,
      run.organizationId,
      request.connectionId,
      "meta_ads"
    );
    if (connection.status !== "connected")
      throw new Error(
        "Reconnect the selected Meta ad account before fetching performance."
      );
    if (data.source === "live_meta_scheduling")
      return complete("Supplied live Meta performance", data);
    return complete(
      "Live Meta scheduling performance",
      await liveSchedulingReport(
        connection,
        request.range,
        node.config.metaPerformance
      )
    );
  }
  if (
    ![
      "start_trigger",
      "meta_history",
      "classify_history",
      "analyze_history",
      "optimize_dimension",
    ].includes(node.type)
  )
    return null;
  requireOptimization(run.organizationId);
  const step = run.steps[node.id];
  if (node.type === "start_trigger")
    return complete("Trigger", {
      kind: node.config.trigger?.kind ?? "manual",
      runId: run.id,
      startedAtMs: run.createdAtMs,
    });
  if (node.type === "meta_history") {
    if (!step.historyJobId) {
      const job = await queueHistory(
        db,
        run.organizationId,
        run.actorUserId,
        node.config.connectionId!,
        node.config.incremental ?? true
      );
      return {
        ...step,
        status: "waiting",
        historyJobId: job.id,
        waitingFor: job.status === "paused" ? "paused_history" : undefined,
        waitingReason: "Importing Meta history; checkpoints survive restarts.",
      };
    }
    const [job] = await db
      .select()
      .from(optimizationSyncs)
      .where(
        and(
          eq(optimizationSyncs.id, step.historyJobId),
          eq(optimizationSyncs.organizationId, run.organizationId),
          eq(optimizationSyncs.connectionId, node.config.connectionId!)
        )
      );
    if (!job) throw new Error("History job is unavailable in this workspace.");
    if (job.status === "failed")
      throw new Error(
        job.error ??
          "History import failed. Resume from Optimization intelligence."
      );
    if (job.status !== "completed")
      return {
        ...step,
        status: "waiting",
        waitingFor: job.status === "paused" ? "paused_history" : undefined,
        waitingReason: `${job.status === "paused" ? "History import paused" : "History"}: ${job.checkpoint.completedTasks}/${job.tasks.length} slices.${job.status === "paused" ? " Resume it from Optimization intelligence when ready." : ""}`,
      };
    return complete("Imported Meta history", {
      connectionId: job.connectionId,
      range: { since: job.since, until: job.until },
      warnings: job.checkpoint.warnings,
      updatedAtMs: job.updatedAtMs,
    });
  }
  if (node.type === "classify_history") {
    const batch = await classifyHistoryBatch(
      db,
      run.organizationId,
      node.config.connectionId!,
      step.classificationCursor ?? ""
    );
    if (batch.next)
      return {
        ...step,
        status: "waiting",
        classificationCursor: batch.next,
        progress: batch.progress,
        waitingReason: `${batch.progress.completed.toLocaleString("en-US")} of ${batch.progress.total.toLocaleString("en-US")} imported ads classified. Reviewed edits are preserved.`,
      };
    return {
      ...complete("Classified advertising history", {
        connectionId: node.config.connectionId,
        taxonomyVersion: TAXONOMY_VERSION,
        completedAtMs: Date.now(),
      }),
      progress: batch.progress,
      waitingReason: undefined,
    };
  }
  if (node.type === "analyze_history") {
    const query = analysisQuerySchema.parse(
      node.config.analysis ?? {
        range: {
          since: "2026-01-01",
          until: new Date().toISOString().slice(0, 10),
        },
        dimensions: ["messaging_style"],
      }
    );
    if (node.config.datePreset && node.config.datePreset !== "custom") {
      const c = await getOptimizationConnection(
        db,
        run.organizationId,
        node.config.connectionId!
      );
      query.range = presetRange(
        node.config.datePreset,
        Date.now(),
        c.details.timezone ?? "UTC"
      );
    }
    if (node.config.measurePublishedOnly) {
      const references = input.filter(v => v.type === "publication");
      if (!references.length)
        throw new Error(
          "Connect the delivered publication to measure its outcomes."
        );
      const ids: string[] = [];
      for (const reference of references) {
        if (reference.type !== "publication") continue;
        const [publication] = await db
          .select()
          .from(publications)
          .where(
            and(
              eq(publications.id, reference.id),
              eq(publications.organizationId, run.organizationId),
              eq(publications.connectionId, node.config.connectionId!)
            )
          );
        if (
          !publication ||
          publication.state !== "published" ||
          !publication.externalId ||
          !/^\d+$/.test(publication.externalId)
        )
          throw new Error(
            "The selected publication does not have a confirmed Meta ad receipt."
          );
        ids.push(publication.externalId);
      }
      query.adIds = Array.from(new Set(ids));
    }
    const report = await analyzeHistory(
      db,
      run.organizationId,
      node.config.connectionId!,
      query
    );
    // Keep source IDs/provenance, without copying every classification into every nested step.
    const { sourceAds, ...evidence } = report;
    return complete("Dimension evidence", {
      ...evidence,
      sourceExplorer: "/app/optimize/intelligence",
    });
  }
  const evidence = input.find(v => v.type === "data");
  if (evidence?.type !== "data")
    throw new Error("Connect dimension evidence to the optimizer.");
  const config = optimizerSchema.parse(
    node.config.optimizer ?? { kind: "headline" }
  );
  const source = evidence.data;
  if (typeof source.connectionId === "string") {
    const account = await getOptimizationConnection(
      db,
      run.organizationId,
      source.connectionId
    );
    if (account.channel !== config.channel)
      throw new Error(
        "The optimizer channel does not match the evidence account. Choose the matching channel before running."
      );
  }
  if (source.source === "live_meta_scheduling") {
    if (config.kind !== "weekday_time")
      throw new Error(
        "Connect live scheduling data to a Scheduling optimizer."
      );
    return complete(
      "Scheduling analysis",
      schedulingRecommendation(source, config.scheduling)
    );
  }
  if (config.kind === "weekday_time" && config.scheduling)
    throw new Error(
      "These scheduling settings require live Meta performance. Connect Fetch live Meta performance to this analysis step."
    );
  const dimensionReports = [];
  if (typeof source.connectionId === "string" && source.query) {
    const base = analysisQuerySchema.parse(source.query);
    for (const dimension of optimizerLibrary[config.kind].dimensions) {
      const grain =
        dimension === "hour"
          ? "hourly"
          : dimension === "placement"
            ? "placement"
            : base.grain;
      const r = await analyzeHistory(
        db,
        run.organizationId,
        source.connectionId,
        { ...base, grain, dimensions: [dimension] }
      );
      const result = optimizeEvidence({
        schemaVersion: 1,
        ...config,
        evidence: r,
      });
      dimensionReports.push({
        dimension,
        ...result,
        evidence: {
          summary: r.summary,
          groups: r.groups.slice(0, 100),
          coverage: r.coverage,
          query: r.query,
        },
      });
    }
  }
  const result = optimizeEvidence({
    schemaVersion: 1,
    ...config,
    evidence: source,
  });
  return complete("Optimization recommendation", {
    ...result,
    dimensionReports,
  });
}
