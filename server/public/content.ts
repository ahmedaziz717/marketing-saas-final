import { PRIVACY_POLICY } from "./privacyPolicy";

export type Article = {
  title: string;
  eyebrow: string;
  intro: string;
  sections: {
    title: string;
    paragraphs: string[];
    links?: { label: string; href: string }[];
  }[];
};
export const ARTICLES: Record<string, Article> = {
  "/privacy": PRIVACY_POLICY,
  "/terms": {
    title: "Clear expectations. Shared control.",
    eyebrow: "Terms of service",
    intro:
      "Terms for using EvokeLoop's marketing workspace, connected accounts and creative tools. Updated September 22, 2026.",
    sections: [
      {
        title: "The service",
        paragraphs: [
          "EvokeLoop brings creative work, channel activation and reporting into one workspace. For questions about the service or these terms, use the Contact page or the business contact details published on this website.",
        ],
      },
      {
        title: "Accounts and authority",
        paragraphs: [
          "Use an accurate business identity and keep your sign-in credentials secure. Only connect a Page, advertising account, store or asset that you are authorized to use. Your workspace administrator controls membership and roles. A paid plan or workspace-owner role does not make you an administrator of the EvokeLoop platform.",
        ],
      },
      {
        title: "Your content and approvals",
        paragraphs: [
          "You retain your rights in material you provide and permit EvokeLoop and its service providers to process it to deliver the tasks you request. You are responsible for permissions, licenses, product claims, privacy notices and any model or creator releases needed for your content. AI outputs can be inaccurate or unsuitable; review them before use.",
          "Asset approval and final publishing approval are separate. Review the selected account, content, schedule and action before authorizing delivery. The current Meta ad workflow creates paused image ads in existing ad sets; review and activation occur separately. EvokeLoop does not promise campaign results or replace the platform's own policies.",
        ],
      },
      {
        title: "Acceptable use",
        paragraphs: [
          "Do not use EvokeLoop for fraud, unlawful content, harassment, infringement, unauthorized account access or attempts to bypass approval and security controls. Do not upload secrets, unnecessary sensitive personal information, or information you are not entitled to process. Access may be restricted where needed to protect users, providers or the service.",
        ],
      },
      {
        title: "Features, pricing and third parties",
        paragraphs: [
          "Contact our team to confirm your plan's price, features, usage allowances, credit costs and commercial terms before purchase. Advertising spend is separate from the workspace plan. Submitting an enquiry or discussing a plan does not authorize a charge.",
          "External functionality depends on customer consent, provider permissions, account eligibility and platform review. Provider changes, outages or revoked access may interrupt it. Keep copies of important work and check delivery results before retrying an uncertain publication.",
        ],
      },
      {
        title: "Privacy, disconnection and ending use",
        paragraphs: [
          "The Privacy notice explains current data handling. Use Settings > Integrations to disconnect an authorized account. Use the Data deletion page to request removal of data held by EvokeLoop. Disconnecting or closing a workspace does not itself delete content already held by an external provider or cancel activity configured directly in that account.",
          "Public enquiries go to EvokeLoop's platform inbox. The team may need to verify authority before deleting shared business records or changing access. Contact us for questions, a privacy request or help closing your account.",
        ],
      },
    ],
  },
  "/data-deletion": {
    title: "Request deletion of your data.",
    eyebrow: "Data deletion instructions",
    intro:
      "A public way to ask EvokeLoop to remove information it holds about you or a workspace you are authorized to manage. An EvokeLoop login is not required.",
    sections: [
      {
        title: "1. Stop future access when needed",
        paragraphs: [
          "A workspace owner or administrator can open Settings > Integrations, choose the connected account and select Disconnect. This removes the stored connection credential in EvokeLoop and invalidates affected queued approvals. You can also revoke EvokeLoop's access in the connected provider's account, app-access or business-integration controls, including those offered by Meta, Google, Microsoft and your commerce provider.",
          "Disconnection is not the same as deletion. It does not automatically remove historical reports, creative assets, publishing records or audit information from EvokeLoop. You do not need to delete your account with the external provider.",
        ],
      },
      {
        title: "2. Submit a deletion request",
        paragraphs: [
          "Use the form below, or email the published privacy contact in the Business information panel. Give the email associated with your request, an optional workspace or Page/account reference, and what you want removed: contact information, connected advertising, social or store data, your individual account, or an entire workspace. You can submit a request even if you can no longer sign in.",
          "Do not send passwords, access tokens, verification codes, payment information or unnecessary identity documents. The form saves your request to the platform team's restricted inbox and queues an email notification to our support team at ahmed.aziz@cybertron.com. We will contact you within two business days. That initial response is separate from verification and completion of deletion.",
        ],
      },
      {
        title: "3. Verification and fulfillment",
        paragraphs: [
          "The platform team reviews the request and may contact your supplied email to verify identity or business authority. We distinguish your own information from other users' information in a shared workspace. Once verified, eligible data can be removed or anonymized and applicable providers instructed as needed.",
          "The team will explain the scope handled, any information it must retain and the applicable legal response deadline. A thank-you message confirms receipt; the team will separately explain completion and any exceptions. If an appeal right applies, reply to our decision with “Privacy appeal” and your request reference.",
        ],
      },
      {
        title: "What an EvokeLoop deletion does not do",
        paragraphs: [
          "A request to EvokeLoop does not delete your accounts, stores, posts or campaigns held by Meta, Google, Microsoft, Shopify or another provider. Manage or remove that external content directly with the relevant provider. Disconnecting EvokeLoop also does not pause a campaign that is already running on an external platform.",
          "Limited legal, security or dispute records may need to be retained, and backups may persist until their retention cycle expires. The team will explain any applicable exceptions when handling your request.",
        ],
      },
    ],
  },
  "/security": {
    title: "Control is part of the workflow.",
    eyebrow: "Security & trust",
    intro:
      "The safeguards implemented in EvokeLoop, and the limits we want you to understand before connecting a business account.",
    sections: [
      {
        title: "Workspace access is checked on the server",
        paragraphs: [
          "Application operations check workspace membership and the role required for the action. Source approval, asset approval and final publication approval are separate decisions. Public website support requests have a separate platform-administrator inbox; a customer workspace owner cannot read another person's public enquiry.",
        ],
      },
      {
        title: "Credentials stay out of the creative workflow",
        paragraphs: [
          "Integration credentials are encrypted on the server. Private media uses an authenticated storage path. Customers authorize their own connected accounts through the provider flow rather than entering EvokeLoop's platform secret. Never send an access token or password through a support form.",
        ],
      },
      {
        title: "Reviews apply to the actual version",
        paragraphs: [
          "Changing creative or destination details invalidates the relevant approval. The publishing worker rechecks authorization and approved assets before delivery. Test schedules do not become live merely because live delivery is later enabled, and uncertain final delivery results are not retried blindly.",
        ],
      },
      {
        title: "Connected services and availability",
        paragraphs: [
          "Connected services depend on your account permissions, provider requirements and account eligibility. Revoked access, provider changes or outages can interrupt a connection. You can review and manage connections in Settings > Integrations. No system can guarantee absolute security or uninterrupted availability.",
        ],
      },
      {
        title: "Report a concern",
        paragraphs: [
          "Use Contact with the Support or Privacy topic. Describe the affected feature and how to reproduce the concern without including credentials or other people's data. The platform team reviews submitted requests. Do not test security issues against customer information or disrupt the service.",
        ],
      },
    ],
  },
};
