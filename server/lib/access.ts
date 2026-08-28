import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { organizationMemberships, organizations, type OrganizationRole } from "../../drizzle/schema";
import { getDb } from "../db";

export function membershipAuthorization(input: {
  membership: { userId: number; organizationId: number; status: string; role: OrganizationRole } | null | undefined;
  userId: number;
  organizationId: number;
  allowedRoles?: OrganizationRole[];
}) {
  const membership = input.membership;
  if (!membership || membership.userId !== input.userId || membership.organizationId !== input.organizationId || membership.status !== "active") {
    return { allowed: false, reason: "tenant" } as const;
  }
  if (input.allowedRoles && !input.allowedRoles.includes(membership.role)) {
    return { allowed: false, reason: "role" } as const;
  }
  return { allowed: true, reason: null } as const;
}

export async function requireOrganizationRole(userId: number, organizationId: number, roles?: OrganizationRole[]) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const rows = await db
    .select({ membership: organizationMemberships, organization: organizations })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(
      eq(organizationMemberships.userId, userId),
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.status, "active"),
    ))
    .limit(1);

  const row = rows[0];
  const authorization = membershipAuthorization({ membership: row?.membership, userId, organizationId, allowedRoles: roles });
  if (!authorization.allowed && authorization.reason === "tenant") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace" });
  if (!authorization.allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your workspace role does not permit this action" });
  }
  return row!;
}
