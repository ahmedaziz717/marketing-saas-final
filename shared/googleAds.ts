import { z } from "zod";

export const googleCustomerIdSchema = z.string().regex(/^\d{10}$/);
export const googleAccountSchema = z.object({
  id: googleCustomerIdSchema,
  name: z.string(),
  currency: z.string(),
  timezone: z.string(),
  testAccount: z.boolean(),
  loginCustomerId: googleCustomerIdSchema.optional(),
});
export type GoogleAdsAccount = z.infer<typeof googleAccountSchema>;
export const googleConnectionErrors: Record<string, string> = {
  reporting:
    "Google Ads reporting setup is incomplete. Contact your administrator.",
  state:
    "This Google connection request could not be verified. Start again from this workspace.",
  expired: "Your Google connection request expired. Please connect again.",
  declined:
    "Google access was cancelled. You can try again whenever you are ready.",
  scope:
    "Google Ads access was not granted. Connect again and approve access to Google Ads.",
  offline:
    "Google did not grant ongoing access. Connect again and approve the permission request.",
  access:
    "EvokeLoop's Google Ads API access is not ready for this account. Contact support.",
  permission:
    "Google did not allow access to this Ads account. Check your Google Ads account permissions.",
  quota: "Google is temporarily limiting requests. Please try again later.",
  connection: "Google could not complete the connection. Please try again.",
};

export function formatGoogleCustomerId(id: string) {
  return /^\d{10}$/.test(id)
    ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
    : id;
}

export function googleConnectionMessage(reason: string) {
  return Object.prototype.hasOwnProperty.call(googleConnectionErrors, reason)
    ? googleConnectionErrors[reason]!
    : googleConnectionErrors.connection!;
}
