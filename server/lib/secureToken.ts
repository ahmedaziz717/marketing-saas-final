import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { ENV } from "../_core/env";

function encryptionKey(override?: string) {
  const secret =
    override ||
    process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET ||
    ENV.cookieSecret;
  if (!secret) throw new Error("Server encryption secret is unavailable");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(token: string, key?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptToken(
  input: { ciphertext: string; iv: string; tag: string },
  key?: string
) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(key),
    Buffer.from(input.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function catalogEncryptionKey() {
  const key = process.env.CATALOG_TOKEN_ENCRYPTION_SECRET;
  if (!key)
    throw new Error(
      "Store connections need server encryption setup. Contact your administrator."
    );
  return key;
}
