import { describe, expect, it } from "vitest";
import { canExecutePublish, generationBlockReason, stableHash } from "./lib/policy";

describe("generation approval policy", () => {
  it("allows generation only from an approved brief, active brand kit, and approved assets", () => {
    expect(generationBlockReason({ briefStatus: "approved", brandKitStatus: "active", assetStatuses: ["approved", "approved"] })).toBeNull();
    expect(generationBlockReason({ briefStatus: "draft", brandKitStatus: "active", assetStatuses: ["approved"] })).toMatch(/brief/i);
    expect(generationBlockReason({ briefStatus: "approved", brandKitStatus: "draft", assetStatuses: ["approved"] })).toMatch(/brand kit/i);
    expect(generationBlockReason({ briefStatus: "approved", brandKitStatus: "active", assetStatuses: ["pending"] })).toMatch(/asset/i);
    expect(generationBlockReason({ briefStatus: "approved", brandKitStatus: "active", assetStatuses: [] })).toMatch(/asset/i);
  });
});

describe("publish execution policy", () => {
  const approvedPayload = { name: "Launch A", destinationUrl: "https://example.com", variant: { id: 9 } };
  const approvedHash = stableHash(approvedPayload);

  it("requires an approved request, approved creative, live connection, and exact approved hash", () => {
    expect(canExecutePublish({ requestStatus: "approved", creativeStatus: "approved", payloadHash: approvedHash, approvedHash, connectionStatus: "connected" })).toBe(true);
    expect(canExecutePublish({ requestStatus: "awaiting_approval", creativeStatus: "approved", payloadHash: approvedHash, approvedHash, connectionStatus: "connected" })).toBe(false);
    expect(canExecutePublish({ requestStatus: "approved", creativeStatus: "rejected", payloadHash: approvedHash, approvedHash, connectionStatus: "connected" })).toBe(false);
    expect(canExecutePublish({ requestStatus: "approved", creativeStatus: "approved", payloadHash: stableHash({ ...approvedPayload, name: "Changed" }), approvedHash, connectionStatus: "connected" })).toBe(false);
    expect(canExecutePublish({ requestStatus: "approved", creativeStatus: "approved", payloadHash: approvedHash, approvedHash, connectionStatus: "disconnected" })).toBe(false);
  });
});
