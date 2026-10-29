import { dateInZone, localScheduleToUtc, moveDate } from "./channels";
import type { WorkflowNode, WorkflowGraph } from "./creativeWorkflow";
export type TriggerConfig = NonNullable<WorkflowNode["config"]["trigger"]>;
/** Inspect the expanded, pinned graph so nested calls cannot feed their own event. */
export function triggerGraphProblem(
  config: TriggerConfig,
  graph: WorkflowGraph
) {
  if (config.kind !== "event") return null;
  if (
    config.event === "history_synced" &&
    graph.nodes.some(n => n.type === "meta_history")
  )
    return "A history-synced trigger must analyze the imported history without fetching it again. Remove Fetch Meta history to prevent a repeating event loop.";
  if (
    config.event === "publication_delivered" &&
    graph.nodes.some(n =>
      ["deliver_publication", "meta_activate"].includes(n.type)
    )
  )
    return "A publication-delivered trigger can measure and prepare drafts, but cannot deliver another publication. Use a manual or scheduled workflow for delivery to prevent a repeating event loop.";
  return null;
}
/** Account-local weekly schedule. Nonexistent DST times move to the next valid hour. */
export function nextWeeklyTrigger(config: TriggerConfig, after: number) {
  const date = dateInZone(after, config.timezone).slice(0, 10);
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = moveDate(date, offset);
    if (new Date(candidate + "T12:00:00Z").getUTCDay() !== config.weekday)
      continue;
    for (let hour = config.hour; hour < 24; hour++) {
      try {
        const time = localScheduleToUtc(
          `${candidate}T${String(hour).padStart(2, "0")}:00`,
          config.timezone
        );
        if (time > after) return time;
        break;
      } catch {
        /* DST gap or ambiguity: choose a later unambiguous hour. */
      }
    }
  }
  throw new Error(
    "Unable to determine the next schedule. Check timezone and hour."
  );
}
