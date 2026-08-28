import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { activityEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import { stableHash } from "./policy";

export async function appendActivity(input: {
  organizationId: number;
  actorUserId: number;
  action: string;
  entityType: string;
  entityId: string | number;
  outcome?: "success" | "failure";
  payload?: Record<string, unknown>;
  correlationId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const previous = (await db.select({ eventHash: activityEvents.eventHash })
    .from(activityEvents)
    .where(eq(activityEvents.organizationId, input.organizationId))
    .orderBy(desc(activityEvents.id))
    .limit(1))[0];
  const correlationId = input.correlationId ?? randomUUID();
  const createdAtMs = Date.now();
  const event = {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: String(input.entityId),
    outcome: input.outcome ?? "success",
    payload: input.payload ?? null,
    correlationId,
    previousHash: previous?.eventHash ?? null,
    createdAtMs,
  } as const;
  await db.insert(activityEvents).values({ ...event, eventHash: stableHash(event) });
}

export async function listActivity(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(activityEvents)
    .where(eq(activityEvents.organizationId, organizationId))
    .orderBy(desc(activityEvents.id))
    .limit(250);
}

export function verifyActivityChain(events: Array<{
  id: number;
  organizationId: number;
  actorUserId: number;
  action: string;
  entityType: string;
  entityId: string;
  outcome: "success" | "failure";
  payload: Record<string, unknown> | null;
  correlationId: string;
  previousHash: string | null;
  eventHash: string;
  createdAtMs: number;
}>) {
  const ordered = [...events].sort((a, b) => a.id - b.id);
  return ordered.every((event, index) => {
    const expectedPrevious = index === 0 ? null : ordered[index - 1]!.eventHash;
    const hashInput = {
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      outcome: event.outcome,
      payload: event.payload,
      correlationId: event.correlationId,
      previousHash: event.previousHash,
      createdAtMs: event.createdAtMs,
    };
    return event.previousHash === expectedPrevious && stableHash(hashInput) === event.eventHash;
  });
}
