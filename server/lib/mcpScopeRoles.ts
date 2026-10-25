import type { OrganizationRole } from "../../drizzle/schema";
import { workflowRoles } from "../../shared/creativeWorkflow";

/** A mixed grant remains eligible only while every granted capability is allowed. */
export function mcpScopeRoles(scope = ""): OrganizationRole[] {
  return scope
    .split(" ")
    .some(s => s === "brand:configure" || s === "catalog:configure")
    ? ["owner", "admin"]
    : [...workflowRoles];
}
