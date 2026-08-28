import { describe, expect, it } from "vitest";
import { verifyActivityChain } from "./lib/activity";
import { stableHash } from "./lib/policy";

function event(input: { id: number; previousHash: string | null; action: string }) {
  const hashInput = {
    organizationId: 7,
    actorUserId: 11,
    action: input.action,
    entityType: "campaign_brief",
    entityId: "42",
    outcome: "success" as const,
    payload: null,
    correlationId: `correlation-${input.id}`,
    previousHash: input.previousHash,
    createdAtMs: 1_700_000_000_000 + input.id,
  };
  return { id: input.id, ...hashInput, eventHash: stableHash(hashInput) };
}

describe("tamper-evident activity chain", () => {
  it("verifies an intact append-only chain independent of display order", () => {
    const first = event({ id: 1, previousHash: null, action: "brief.approved" });
    const second = event({ id: 2, previousHash: first.eventHash, action: "creative_generation.requested" });
    expect(verifyActivityChain([second, first])).toBe(true);
  });

  it("detects edits and deletions", () => {
    const first = event({ id: 1, previousHash: null, action: "brief.approved" });
    const second = event({ id: 2, previousHash: first.eventHash, action: "publish_request.approved" });
    expect(verifyActivityChain([{ ...first, action: "brief.rejected" }, second])).toBe(false);
    expect(verifyActivityChain([second])).toBe(false);
  });
});

