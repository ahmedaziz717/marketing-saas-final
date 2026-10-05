import {
  bigint,
  index,
  integer,
  json,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema, organizations, users } from "./schema";
import type { WorkflowGraph, WorkflowSteps } from "../shared/creativeWorkflow";
import type { VideoReference } from "../shared/videoCreation";

export const creativeWorkflows = appSchema
  .table(
    "creative_workflows",
    {
      id: varchar("id", { length: 36 }).primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      actorUserId: integer("actorUserId")
        .notNull()
        .references(() => users.id),
      name: text("name").notNull(),
      graph: json("graph").$type<WorkflowGraph>().notNull(),
      revision: integer("revision").notNull().default(1),
      archived: integer("archived").notNull().default(0),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => [
      index("creative_workflows_org_updated").on(
        t.organizationId,
        t.updatedAtMs
      ),
    ]
  )
  .enableRLS();

export const creativeWorkflowRuns = appSchema
  .table(
    "creative_workflow_runs",
    {
      id: varchar("id", { length: 36 }).primaryKey(),
      workflowId: varchar("workflowId", { length: 36 })
        .notNull()
        .references(() => creativeWorkflows.id),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      actorUserId: integer("actorUserId")
        .notNull()
        .references(() => users.id),
      graph: json("graph").$type<WorkflowGraph>().notNull(),
      steps: json("steps").$type<WorkflowSteps>().notNull(),
      references: json("references")
        .$type<VideoReference[]>()
        .notNull()
        .default([]),
      creditsByNode: json("creditsByNode")
        .$type<Record<string, number>>()
        .notNull(),
      status: text("status")
        .$type<"queued" | "running" | "completed" | "failed" | "stopped">()
        .notNull()
        .default("queued"),
      stopRequested: integer("stopRequested").notNull().default(0),
      error: text("error"),
      leaseOwner: text("leaseOwner"),
      leaseUntilMs: bigint("leaseUntilMs", { mode: "number" })
        .notNull()
        .default(0),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => [
      index("creative_workflow_runs_org_time").on(
        t.organizationId,
        t.createdAtMs
      ),
      index("creative_workflow_runs_queue").on(t.status, t.leaseUntilMs),
    ]
  )
  .enableRLS();
