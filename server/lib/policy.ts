import { createHash } from "node:crypto";

export function stableHash(value: unknown) {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]));
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export function generationBlockReason(input: {
  briefStatus: string;
  brandKitStatus: string;
  assetStatuses: string[];
}) {
  if (input.briefStatus !== "approved") return "The campaign brief must be approved before generation.";
  if (input.brandKitStatus !== "active") return "The brand kit must be active before generation.";
  if (input.assetStatuses.length === 0) return "At least one approved brand asset is required.";
  if (input.assetStatuses.some(status => status !== "approved")) return "Every selected brand asset must be approved.";
  return null;
}

export function canExecutePublish(input: {
  requestStatus: string;
  creativeStatus: string;
  payloadHash: string;
  approvedHash: string | null;
  connectionStatus: string;
}) {
  return input.requestStatus === "approved"
    && input.creativeStatus === "approved"
    && input.connectionStatus === "connected"
    && input.approvedHash !== null
    && input.payloadHash === input.approvedHash;
}

