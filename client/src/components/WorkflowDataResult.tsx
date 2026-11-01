import { CopyEvidenceResult } from "./CopyEvidenceResult";
import { OptimizationResult } from "./OptimizationResult";

export function isWorkflowReport(data: Record<string, unknown>) {
  return (
    data.source === "live_meta_copy_analysis" ||
    (data.schemaVersion === 1 && data.requiresHumanApproval === true)
  );
}

/** Apps and the workflow canvas must display the same saved report. */
export function WorkflowDataResult({
  data,
}: {
  data: Record<string, unknown>;
}) {
  if (data.source === "live_meta_copy_analysis") {
    return <CopyEvidenceResult data={data} />;
  }
  if (data.schemaVersion === 1 && data.requiresHumanApproval === true) {
    return <OptimizationResult data={data} />;
  }
  return <pre className="wf-evidence">{JSON.stringify(data, null, 2)}</pre>;
}
