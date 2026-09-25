import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { activityEvents, organizations } from "../../drizzle/schema";
import { getDb } from "../db";
import { stableHash } from "./policy";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ActivityDatabase = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function withOrganizationTransaction<T>(
  database: Database,
  organizationId: number,
  operation: (transaction: ActivityDatabase) => Promise<T>
) {
  return database.transaction(
    async transaction => {
      // Lock before child inserts acquire foreign-key locks, avoiding lock upgrades
      // between simultaneous saves. Read committed keeps the next audit hash current.
      await transaction
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1)
        .for("update");
      return operation(transaction);
    },
    { isolationLevel: "read committed" }
  );
}

export async function appendActivity(
  input: {
    organizationId: number;
    actorUserId: number;
    action: string;
    entityType: string;
    entityId: string | number;
    outcome?: "success" | "failure";
    payload?: Record<string, unknown>;
    correlationId?: string;
  },
  transaction?: ActivityDatabase
): Promise<void> {
  if (!transaction) {
    const database = await getDb();
    if (!database) throw new Error("Database unavailable");
    return withOrganizationTransaction(database, input.organizationId, tx =>
      appendActivity(input, tx)
    );
  }
  const db = transaction;
  // Caller-provided transactions are created by withOrganizationTransaction.
  const previous = (
    await db
      .select({ eventHash: activityEvents.eventHash })
      .from(activityEvents)
      .where(eq(activityEvents.organizationId, input.organizationId))
      .orderBy(desc(activityEvents.id))
      .limit(1)
  )[0];
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
  await db
    .insert(activityEvents)
    .values({ ...event, eventHash: stableHash(event) }).returning({ insertId: activityEvents.id });
}

export async function listActivity(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.organizationId, organizationId))
    .orderBy(desc(activityEvents.id))
    .limit(250);
}

export function verifyActivityChain(
  events: Array<{
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
  }>
) {
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
    return (
      event.previousHash === expectedPrevious &&
      stableHash(hashInput) === event.eventHash
    );
  });
}
