import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import { websiteProfile, websiteRequests } from "../../drizzle/websiteSchema";
import {
  emptyWebsiteProfile,
  websiteProfileSchema,
} from "../../shared/publicWebsite";
import { getDb } from "../db";
const ephemeralSecret = randomBytes(32).toString("hex");
const key = () =>
  process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET || ephemeralSecret;
const sign = (value: string) =>
  createHmac("sha256", key())
    .update("frame-public-form:" + value)
    .digest("hex");
export const formReceiptToken = (token: string) =>
  createHmac("sha256", key())
    .update("frame-public-receipt:" + token)
    .digest("hex");
export const receiptHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function makeFormToken(now = Date.now()) {
  const value = `${now}.${randomBytes(12).toString("hex")}`;
  return `${value}.${sign(value)}`;
}
export function validFormToken(token: string, now = Date.now()) {
  if (!/^\d{13}\.[a-f0-9]{24}\.[a-f0-9]{64}$/.test(token)) return false;
  const [time, nonce, mac] = token.split(".");
  const age = now - Number(time);
  return (
    age >= 1500 &&
    age < 2 * 60 * 60 * 1000 &&
    timingSafeEqual(
      Buffer.from(mac, "hex"),
      Buffer.from(sign(`${time}.${nonce}`), "hex")
    )
  );
}
export async function readWebsiteProfile() {
  try {
    const db = await getDb();
    const row = db
      ? (
          await db
            .select()
            .from(websiteProfile)
            .where(eq(websiteProfile.id, "public"))
            .limit(1)
        )[0]
      : null;
    const parsed = websiteProfileSchema.safeParse(
      row?.profile ?? emptyWebsiteProfile
    );
    return {
      profile: parsed.success ? parsed.data : emptyWebsiteProfile,
      revision: row?.revision ?? 0,
      available: !!db,
    };
  } catch {
    return { profile: emptyWebsiteProfile, revision: 0, available: false };
  }
}
export async function requestReceipt(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await getDb();
  if (!db) throw new Error("Request service unavailable");
  const row = (
    await db
      .select({
        state: websiteRequests.state,
        createdAtMs: websiteRequests.createdAtMs,
        updatedAtMs: websiteRequests.updatedAtMs,
      })
      .from(websiteRequests)
      .where(eq(websiteRequests.receiptHash, receiptHash(token)))
      .limit(1)
  )[0];
  return row ?? null;
}
