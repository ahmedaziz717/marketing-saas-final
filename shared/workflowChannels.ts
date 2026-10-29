import {
  workflowNodes,
  type WorkflowFamily,
  type WorkflowNodeType,
} from "./creativeWorkflow";

export { connectionChannelDefinitions as workflowChannels } from "./channels";
import type { ConnectionChannel } from "./channels";
export type WorkflowChannel = ConnectionChannel;

export function workflowNodeChannels(
  type: WorkflowNodeType
): WorkflowChannel[] {
  const meta = workflowNodes[type];
  return meta.channels ?? (meta.channel ? [meta.channel] : []);
}

/** Registry metadata governs discovery; account access is also checked on the server. */
export function availableWorkflowNode(
  type: WorkflowNodeType,
  connections: readonly string[],
  family: WorkflowFamily | "all"
) {
  const meta = workflowNodes[type];
  const channels = workflowNodeChannels(type);
  if (
    meta.hidden ||
    (channels.length && !channels.some(c => connections.includes(c)))
  )
    return false;
  if (family === "all") return true;
  if (meta.families) return meta.families.includes(family);
  if (
    ["meta_performance", "meta_copy_performance"].includes(type) &&
    family === "optimize"
  )
    return true;
  if (
    !meta.family &&
    ["Inputs", "Apps", "Control", "Utilities"].includes(meta.group)
  )
    return true;
  return (meta.family ?? "create") === family;
}
