import { and, eq } from "drizzle-orm";
import { organizationMemberships, users } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { sdk } from "../server/_core/sdk";
import { getDb } from "../server/db";

const organizationId = 1;
const publishedOrigin = "https://creativesaas-hwumesby.manus.space";
const db = await getDb();
if (!db) throw new Error("Database unavailable");
const member = (await db.select({ openId: users.openId, name: users.name })
  .from(organizationMemberships)
  .innerJoin(users, eq(users.id, organizationMemberships.userId))
  .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.status, "active")))
  .limit(1))[0];
if (!member) throw new Error("Active workspace member unavailable");

const token = await sdk.createSessionToken(member.openId, { name: member.name || "Frame member", expiresInMs: 5 * 60 * 1000 });

for (const procedure of ["creativeBuilder.options", "creatives.overview"]) {
  const input = encodeURIComponent(JSON.stringify({ json: { organizationId } }));
  const response = await fetch(`${publishedOrigin}/api/trpc/${procedure}?input=${input}`, {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
    redirect: "manual",
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const ok = response.status === 200 && body !== null && !("error" in body);
  console.log(JSON.stringify({ procedure, status: response.status, ok }));
  if (!ok) process.exitCode = 1;
}

const page = await fetch(`${publishedOrigin}/app/creatives`, { headers: { Cookie: `${COOKIE_NAME}=${token}` }, redirect: "manual" });
console.log(JSON.stringify({ page: "/app/creatives", status: page.status, contentType: page.headers.get("content-type"), ok: page.status === 200 }));
