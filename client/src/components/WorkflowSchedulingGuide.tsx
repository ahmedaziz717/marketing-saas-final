import {
  workflowAncestors,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowSteps,
} from "@shared/creativeWorkflow";
import { schedulingSettingsSchema } from "@shared/optimization";
import { copyComparisonSchema } from "@shared/copyEvidence";

export function schedulingGuide(node: WorkflowNode, graph: WorkflowGraph) {
  if (
    node.type === "app_input" &&
    node.config.field?.kind === "performance_data"
  )
    return {
      summary: [
        "Connected account + dates",
        node.config.field.locked
          ? "Uses your saved selection"
          : "User chooses when running",
      ],
      purpose:
        "Collect the connected ad account and reporting period. Select Run workflow to fill these in, or set defaults in this field.",
      input:
        "A user's selection, or live performance supplied by a parent workflow.",
      output:
        "Account selection and an inclusive date range. Connect the output dot to Account & dates on a live Meta fetch step.",
    };
  if (node.type === "meta_copy_performance")
    return {
      summary: [
        "Individual ads + actual copy",
        "Fresh performance for selected dates",
        "Read-only · no historical import",
      ],
      purpose:
        "Read ad-level Meta results, then join each ad ID to its current creative text. This includes ads that are paused now but delivered during the selected dates. At most 100 ads are inspected; incomplete coverage is disclosed.",
      input:
        "Connect the Account & date range field. A Start trigger does not supply ad performance.",
      output:
        "Actual headlines, primary text and descriptions, matched performance, source IDs, and coverage warnings. Text embedded inside images and individual dynamic-creative variant results are not inferred.",
    };
  if (node.type === "compare_copy_styles") {
    const settings = copyComparisonSchema.parse(
      node.config.copyComparison ?? {}
    );
    return {
      summary: [
        settings.objective === "cpa"
          ? "Compare purchase CPA"
          : "Compare purchase ROAS",
        `${settings.minimumImpressions} impressions + ${settings.minimumPurchases} purchases per style`,
        "Explicit text rules · inspect source ads",
      ],
      purpose:
        "Group single-variant ads using existing educational, direct and reassuring text rules, then compare aggregate purchase efficiency. Change the objective and eligibility thresholds below. This is descriptive evidence, not a causal test or an AI-generated opinion.",
      input:
        "Connect Fetch Meta ad copy & results to Ad copy & results. Account totals and weekday/hour reports do not contain the required creative text.",
      output:
        "Separate headline, primary-text and description comparisons, source ads, rule matches, missing-data warnings and limitations. No unsupported confidence percentage or winning dynamic variant is invented.",
    };
  }
  if (
    node.type === "output" &&
    graph.nodes.some(
      n =>
        n.type === "compare_copy_styles" &&
        workflowAncestors(graph, node.id).has(n.id)
    )
  )
    return {
      summary: [
        "Copy comparisons + source ads",
        "Coverage + interpretation limits",
        "Open the report after running",
      ],
      purpose:
        "Present the connected copy analysis and retain it in run history. Save workflow keeps this draft editable. This workflow does not generate or publish ads.",
      input: "Connect Compare copy styles to Results.",
      output:
        "A readable evidence report with actual ad text, metrics, selected account and dates, and comparison settings.",
    };
  if (node.type === "meta_performance")
    return {
      summary: [
        node.config.metaPerformance?.includeHourly === false
          ? "Daily performance"
          : "Daily + hourly performance",
        "Account & dates from connected input",
        "Purchases, revenue, spend + traffic",
      ],
      purpose:
        "Read fresh account-level Meta Insights for the selected dates. Dates and hours use the ad account's timezone. Conversions use account attribution and impression-date reporting.",
      input:
        "Connect an Account & date range field. When a parent supplies live Meta evidence, that evidence is reused and its workspace account is checked.",
      output:
        "Weekday and hourly totals, source dates, account, currency and coverage warnings. Daily totals validate hourly conversions. Missing conversions stay unavailable.",
    };
  if (
    node.type === "optimize_dimension" &&
    node.config.optimizer?.kind === "weekday_time"
  ) {
    const s = schedulingSettingsSchema.parse(
      node.config.optimizer.scheduling ?? {}
    );
    return {
      summary: [
        s.comparison === "both"
          ? "Weekdays + hours · compared separately"
          : s.comparison === "weekday"
            ? "Weekday comparison"
            : "Hourly comparison",
        "Objective: lowest purchase CPA",
        `Propose a test at ${+(s.testProbability * 100).toFixed(1)}% probability`,
      ],
      purpose:
        "Compare purchase efficiency using the connected live performance. Change the comparison and test-readiness rules below. The statistical calculation is a reusable engine; no AI prompt is required.",
      input:
        "Connect the data output of Fetch live Meta performance to Evidence. Historical evidence in legacy Apps uses its original analysis contract.",
      output:
        "Confidence per comparison, CPA uncertainty intervals, evidence tables, limitations and potential controlled tests. No combined weekday/hour winner is inferred.",
    };
  }
  if (
    node.type === "output" &&
    graph.nodes.some(
      n =>
        workflowAncestors(graph, node.id).has(n.id) &&
        n.config.optimizer?.kind === "weekday_time"
    )
  )
    return {
      summary: [
        "Summary + evidence tables",
        "Confidence + proposed tests",
        "Open the report after running",
      ],
      purpose:
        "Present the connected scheduling analysis and retain it in run history. Save workflow keeps this editable; publish as an App only when you want to share a version.",
      input: "Connect Analyze scheduling to Results.",
      output:
        "A report you can inspect after running, including selected settings, source dates and attribution limits.",
    };
  return null;
}

export function WorkflowSchedulingGuide({
  node,
  graph,
  steps,
  stale,
}: {
  node: WorkflowNode;
  graph: WorkflowGraph;
  steps?: WorkflowSteps;
  stale?: boolean;
}) {
  const guide = schedulingGuide(node, graph);
  if (!guide) return null;
  const incoming = graph.edges.filter(e => e.target === node.id);
  const supplied = incoming.flatMap(e =>
    (steps?.[e.source]?.outputs ?? []).map(value => ({
      from: graph.nodes.find(n => n.id === e.source)?.title ?? e.source,
      value,
    }))
  );
  const produced = steps?.[node.id]?.outputs ?? [];
  return (
    <section className="wf-step-guide" aria-label="Step guide">
      <p>{guide.purpose}</p>
      <dl>
        <dt>Receives</dt>
        <dd>{guide.input}</dd>
        <dt>Produces</dt>
        <dd>{guide.output}</dd>
      </dl>
      {incoming.length > 0 && (
        <p>
          <strong>Connected from:</strong>{" "}
          {incoming
            .map(e => graph.nodes.find(n => n.id === e.source)?.title)
            .join(", ")}
        </p>
      )}
      {supplied.length > 0 || produced.length > 0 ? (
        <details>
          <summary>
            {stale
              ? "Previous run data (settings changed)"
              : "Inspect data passed between steps"}
          </summary>
          <p>This is the saved run's data, not a new Meta request.</p>
          {supplied.map((item, i) => (
            <div key={i}>
              <strong>Input from {item.from}</strong>
              <pre>{JSON.stringify(item.value, null, 2)}</pre>
            </div>
          ))}
          {!!produced.length && (
            <div>
              <strong>Output from this step</strong>
              <pre>{JSON.stringify(produced, null, 2)}</pre>
            </div>
          )}
        </details>
      ) : (
        <p className="wf-setting-help">
          Run the workflow to inspect the actual input and output here.
        </p>
      )}
    </section>
  );
}
