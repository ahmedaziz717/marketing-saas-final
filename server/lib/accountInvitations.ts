import { createHash } from "node:crypto";
import { siteOrigins } from "./siteOrigins";

/** Provider acceptance is not proof of inbox delivery. Never log the invitation URL. */
export async function sendAccountInvitation(
  email: string,
  name: string,
  invitePath: string
) {
  const key = process.env.CONTACT_RESEND_API_KEY;
  const from = process.env.CONTACT_EMAIL_FROM;
  if (!key || !from)
    return {
      status: "failed" as const,
      reason:
        "Email delivery is not configured. Copy the invitation link or configure the email sender.",
    };
  try {
    const url = new URL(invitePath, siteOrigins().app).href;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `account-invite/${createHash("sha256").update(invitePath).digest("hex")}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your EvokeLoop workspace invitation",
        text: `You've been invited to manage ${name} on EvokeLoop.\n\nAccept your invitation:\n${url}\n\nSign up or sign in using ${email}. This invitation expires in 7 days.\n\nIf you weren't expecting this invitation, you can ignore it.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      return {
        status: "failed" as const,
        reason: `Email provider rejected the request (${response.status}). Copy the invitation link or try sending again.`,
      };
    const payload = await response.json();
    if (!payload?.id) throw new Error("Missing provider receipt");
    return { status: "sent" as const, providerId: String(payload.id) };
  } catch {
    return {
      status: "failed" as const,
      reason:
        "Email delivery could not be confirmed. Copy the invitation link or try sending again.",
    };
  }
}
