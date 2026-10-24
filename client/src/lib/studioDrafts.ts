import { z } from "zod";
/** Incomplete form fields are valid drafts, but wrong types, unknown variants and
 * oversized values are not. Submission still uses the original strict schema. */
export function draftShapeSchema<T>(schema: z.ZodType<T>): z.ZodType<T> {
  const unfinished = (issues: readonly z.core.$ZodIssue[]): boolean =>
    issues.every(
      issue =>
        ["too_small", "invalid_format", "custom"].includes(issue.code) ||
        (issue.code === "invalid_union" && issue.errors.some(unfinished))
    );
  return z.unknown().transform((value, ctx) => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    if (unfinished(parsed.error.issues)) return value as T;
    ctx.addIssue({ code: "custom", message: "Invalid saved draft shape" });
    return z.NEVER;
  }) as z.ZodType<T>;
}
export function studioDraftKey(
  userId: number | undefined,
  organizationId: number | null | undefined,
  studio: string,
  entity = "new"
) {
  return userId && organizationId
    ? `evokeloop:studio-draft:v1:${userId}:${organizationId}:${studio}:${encodeURIComponent(entity)}`
    : null;
}
export function readStudioDraft<T>(
  key: string | null,
  parse: (raw: string) => T | null
): T | null {
  if (!key) return null;
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw && raw.length <= 500_000 ? parse(raw) : null;
  } catch {
    return null;
  }
}
export function writeStudioDraft(key: string | null, value: unknown): boolean {
  if (!key) return false;
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = JSON.stringify(value);
    if (raw.length > 500_000) return false;
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
export function removeStudioDraft(key: string | null) {
  if (key)
    try {
      localStorage.removeItem(key);
    } catch {}
}
