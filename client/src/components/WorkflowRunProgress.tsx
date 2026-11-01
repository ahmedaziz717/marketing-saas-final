import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  Clock3,
  Loader2,
  Pause,
  WifiOff,
} from "lucide-react";
import {
  workflowOrder,
  type WorkflowGraph,
  type WorkflowSteps,
} from "@shared/creativeWorkflow";
import { workflowRunActivity } from "@shared/workflowRunActivity";
import "@/styles/workflowRunProgress.css";

type ProgressRun = {
  id: string;
  graph: WorkflowGraph;
  steps: WorkflowSteps;
  status: string;
  createdAtMs: number;
  updatedAtMs?: number;
  stopRequested?: boolean;
};

export function runDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
    : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const done = (status?: string) => status === "completed" || status === "reused";

/** Progress reflects persisted work; the timer is never used to invent a percentage. */
export function WorkflowRunProgress({
  run,
  refreshError = false,
  refreshing = false,
  onRefresh,
}: {
  run: ProgressRun;
  refreshError?: boolean;
  refreshing?: boolean;
  onRefresh?: () => unknown;
}) {
  const [now, setNow] = useState(Date.now);
  const active = ["queued", "running"].includes(run.status);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, run.id]);

  const ordered = workflowOrder(run.graph).flatMap(id => {
    const node = run.graph.nodes.find(n => n.id === id);
    return node ? [node] : [];
  });
  const nodes = ordered.filter(
    n => !["start_trigger", "output"].includes(n.type)
  );
  const current = ordered.find(n => !done(run.steps[n.id]?.status));
  const step = current ? run.steps[current.id] : undefined;
  const progress = step?.progress;
  const completed = nodes.filter(n => done(run.steps[n.id]?.status)).length;
  const activity = workflowRunActivity(run);
  const lastUpdate = run.updatedAtMs ?? run.createdAtMs;
  const silentFor = Math.max(0, now - lastUpdate);
  const waiting = ["awaiting_approval", "paused_history"].includes(activity);
  const stale = active && !waiting && silentFor > 90_000;
  const disconnected = active && refreshError;
  const moving = active && !waiting && !stale && !disconnected;
  const retrying =
    !!step?.retryAttempts && !!step.wakeAtMs && step.wakeAtMs > now;
  const slowBatch =
    active && !!progress && now - progress.updatedAtMs > 180_000;
  const title = disconnected
    ? "Reconnecting to live progress"
    : stale
      ? "Waiting for a run update"
      : run.stopRequested && active
        ? "Stopping analysis"
        : activity === "awaiting_approval"
          ? "Waiting for your approval"
          : activity === "paused_history"
            ? "History import paused"
            : activity === "queued"
              ? "Analysis queued"
              : activity === "completed"
                ? "Analysis complete"
                : activity === "failed"
                  ? "Analysis needs attention"
                  : activity === "stopped"
                    ? "Analysis stopped"
                    : "Analysis in progress";
  const Icon = disconnected
    ? WifiOff
    : stale || run.status === "failed"
      ? AlertTriangle
      : waiting || run.status === "stopped"
        ? Pause
        : run.status === "completed"
          ? Check
          : run.status === "queued"
            ? Clock3
            : Loader2;
  const stage =
    current?.type === "start_trigger"
      ? "Preparing analysis"
      : current?.type === "output"
        ? "Saving your recommendations"
        : current?.title;
  const duration = (active ? now : lastUpdate) - run.createdAtMs;
  const countLabel = progress
    ? `${progress.completed.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")} ${progress.unit === "ads" ? "ads classified" : "import slices complete"}`
    : null;
  const stepNumber = current
    ? nodes.findIndex(n => n.id === current.id) + 1
    : 0;

  return (
    <section
      className="run-progress"
      aria-label="Analysis progress"
      data-attention={stale || disconnected || run.status === "failed"}
    >
      <header className="run-progress-header">
        <span
          className={`run-progress-symbol${moving && run.status === "running" ? " is-moving" : ""}`}
          aria-hidden="true"
        >
          <Icon size={24} />
        </span>
        <div className="run-progress-heading" role="status" aria-live="polite">
          <h3>{title}</h3>
          <p>
            {completed} of {nodes.length} steps complete
            {active && stepNumber > 0
              ? ` · Step ${stepNumber}: ${stage}`
              : active && stage
                ? ` · ${stage}`
                : ""}
          </p>
        </div>
        <div className="run-progress-time">
          <Clock3 size={14} aria-hidden="true" />
          <span>
            {active ? "Elapsed" : "Duration"}{" "}
            <strong>{runDuration(duration)}</strong>
          </span>
        </div>
      </header>

      {active && (
        <div className="run-progress-current">
          {countLabel && (
            <div
              className="run-progress-count"
              role="status"
              aria-live="polite"
            >
              <strong>{countLabel}</strong>
              {progress!.total > 0 && (
                <span>
                  {Math.min(
                    100,
                    Math.floor((progress!.completed / progress!.total) * 100)
                  )}
                  % of this step
                </span>
              )}
            </div>
          )}
          {progress && progress.total > 0 ? (
            <div
              className="run-progress-track"
              role="progressbar"
              aria-label={
                progress.unit === "ads" ? "Ads classified" : "Import slices"
              }
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={Math.min(progress.completed, progress.total)}
              aria-valuetext={countLabel ?? undefined}
            >
              <span
                style={{
                  width: `${Math.min(100, (progress.completed / progress.total) * 100)}%`,
                }}
              />
            </div>
          ) : moving && !retrying ? (
            <div
              className="run-progress-track is-indeterminate"
              aria-hidden="true"
            >
              <span />
            </div>
          ) : null}
          <p className="run-progress-explainer">
            {disconnected
              ? "Live updates are unavailable. The last saved progress is shown; reconnecting automatically."
              : stale
                ? `No run update for ${runDuration(silentFor)}. The run may be delayed or interrupted; we are checking for updates.`
                : run.stopRequested
                  ? "Finishing the current batch, then stopping. Completed work is saved."
                  : waiting
                    ? step?.waitingReason
                    : activity === "queued"
                      ? "Waiting for an available worker. Progress will appear here automatically."
                      : retrying
                        ? `The data provider asked us to wait. Retrying in ${runDuration(step!.wakeAtMs! - now)}.`
                        : slowBatch
                          ? `The worker is responding. The last completed batch was ${runDuration(now - progress!.updatedAtMs)} ago; this batch is taking longer.`
                          : current?.type === "classify_history"
                            ? "Reviewing all imported ads in batches. Recommendations will use your selected date range."
                            : (step?.waitingReason ??
                              "Processing your evidence and preparing recommendations.")}
          </p>
          <div className="run-progress-live">
            <span>
              <i data-live={moving} aria-hidden="true" />
              {disconnected
                ? "Live connection interrupted"
                : `Last run update ${silentFor < 5_000 ? "just now" : `${runDuration(silentFor)} ago`}`}
            </span>
            {(stale || disconnected) && onRefresh ? (
              <button
                type="button"
                onClick={() => onRefresh()}
                disabled={refreshing}
              >
                {refreshing ? "Checking…" : "Check now"}
              </button>
            ) : (
              <span>
                {waiting
                  ? "Your progress is saved. Resume when you are ready."
                  : "You can leave this page; the run continues in the background."}
              </span>
            )}
          </div>
        </div>
      )}

      <ol className="run-progress-steps" aria-label="Analysis steps">
        {nodes.map((node, i) => {
          const item = run.steps[node.id];
          const complete = done(item?.status);
          const isCurrent = active && node.id === current?.id;
          const failed = item?.status === "failed";
          const StepIcon = complete
            ? Check
            : failed
              ? AlertTriangle
              : isCurrent && moving && !retrying
                ? Loader2
                : isCurrent
                  ? Pause
                  : Circle;
          const label = complete
            ? "Complete"
            : failed
              ? "Needs attention"
              : isCurrent
                ? disconnected || stale
                  ? "Checking status"
                  : run.stopRequested
                    ? "Stopping"
                    : waiting
                      ? "Waiting"
                      : retrying
                        ? "Retry scheduled"
                        : "In progress"
                : run.status === "stopped" || run.status === "failed"
                  ? "Not run"
                  : "Up next";
          return (
            <li key={node.id} data-current={isCurrent} data-complete={complete}>
              <StepIcon
                className={
                  isCurrent && moving && !retrying ? "is-spinning" : ""
                }
                size={18}
                aria-hidden="true"
              />
              <span>
                <strong>
                  {i + 1}. {node.title}
                </strong>
                {item?.error && <small role="alert">{item.error}</small>}
              </span>
              <em>{label}</em>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
