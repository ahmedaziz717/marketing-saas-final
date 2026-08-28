import { describe, expect, it } from "vitest";
import { membershipAuthorization } from "./lib/access";

const membership = { userId: 11, organizationId: 7, status: "active", role: "creator" as const };

describe("organization authorization", () => {
  it("denies cross-tenant and cross-user access", () => {
    expect(membershipAuthorization({ membership, userId: 11, organizationId: 8 }).allowed).toBe(false);
    expect(membershipAuthorization({ membership, userId: 12, organizationId: 7 }).allowed).toBe(false);
    expect(membershipAuthorization({ membership: { ...membership, status: "suspended" }, userId: 11, organizationId: 7 }).allowed).toBe(false);
  });

  it("allows only roles explicitly permitted for a protected operation", () => {
    expect(membershipAuthorization({ membership, userId: 11, organizationId: 7, allowedRoles: ["creator", "admin"] }).allowed).toBe(true);
    expect(membershipAuthorization({ membership, userId: 11, organizationId: 7, allowedRoles: ["reviewer", "publisher"] })).toEqual({ allowed: false, reason: "role" });
  });
});

