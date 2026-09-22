export type Article = {
  title: string;
  eyebrow: string;
  intro: string;
  sections: { title: string; paragraphs: string[] }[];
};
export const ARTICLES: Record<string, Article> = {
  "/privacy": {
    title: "Your data. A clear explanation.",
    eyebrow: "Privacy notice",
    intro:
      "How EvokeLoop handles account information, creative assets, connected marketing data and requests from you. Updated September 22, 2026.",
    sections: [
      {
        title: "Who this notice covers",
        paragraphs: [
          "This notice covers the EvokeLoop public website and marketing workspace. For support, business enquiries or questions about your information, use the Contact page or the contact details published with this notice.",
          "For account administration, security and website enquiries, EvokeLoop handles information to operate its service. For marketing information a business connects to its workspace, EvokeLoop acts on that business's instructions. That business is also responsible for the permissions, rights and notices needed for its own customers and team members.",
        ],
      },
      {
        title: "Information we receive",
        paragraphs: [
          "Account and workspace information includes names, email addresses, sign-in identifiers, team roles, invitations and organization settings. Creative information includes uploaded images and videos, UGC, logos, product data, brand guidelines, prompts, generated outputs, captions, drafts and review comments.",
          "When you authorize a Meta connection, EvokeLoop receives the account identity and authorization needed to discover and use the Pages or advertising accounts you select. Depending on permissions, this can include Page and account IDs and names, Page tasks, posts and aggregate engagement, campaigns, ad sets, ads, currency, time zone, spend, clicks and platform-reported conversions. Encrypted access credentials and connection metadata are stored separately for each workspace.",
          "Website forms collect your name, email, request category, optional workspace reference and message. A private request reference allows you to check the status. Servers also process technical connection information, such as IP addresses and request details, for hosting, security and abuse prevention. Avoid submitting passwords, tokens, payment card details or unnecessary sensitive information.",
        ],
      },
      {
        title: "How information is used",
        paragraphs: [
          "We use information to sign you in, organize your workspace, import authorized product information, generate requested creative work, preserve versions, manage reviews, schedule approved content, execute authorized delivery and display marketing reports. We also use it to answer enquiries, handle privacy requests, troubleshoot errors and record security and approval activity.",
          "Connecting an account does not publish a post, activate an ad or authorize a budget change. Our Meta workflow supports Facebook Page posts and paused image ads in existing ad sets when required access and live delivery are enabled. We do not use the integration to read personal messages, retrieve lead-form submissions, or manage Meta catalogs.",
        ],
      },
      {
        title: "AI processing and service providers",
        paragraphs: [
          "When you deliberately use AI generation or copy assistance, the content needed for that task, such as prompts, selected images, product facts and brand instructions, is sent to the configured AI provider. The current implementation uses OpenAI for this processing. Do not include information you lack permission to share. Generated content may be inaccurate and needs human review.",
          "EvokeLoop uses Render for application hosting and Supabase for account authentication, database and asset storage. Authentication email is handled by the configured email service. The public website and signed-in application load the Manrope typeface from Google Fonts, which receives the technical request information needed to deliver the font files. No advertising or analytics script is added to the public website by this font delivery.",
          "Meta receives the API calls and approved content needed for the connection or publishing action you request. Authorized workspace members can access workspace information according to their roles; platform administrators can access data as needed for support, security and operation. Information may also be disclosed when legally required or necessary to protect the service. Vendor contractual terms and deployment settings govern their processing; this notice does not promise that all providers have zero retention.",
        ],
      },
      {
        title: "Meta data and customer separation",
        paragraphs: [
          "Meta access is authorized by each customer for their own workspace. Credentials are encrypted on the server and are not returned in ordinary connection responses. EvokeLoop does not sell Meta Platform Data or make a customer's account data available as a cross-customer data product.",
          "Reports are based on the data the provider makes available. Platform-attributed conversions are not represented as independently deduplicated sales, and unique reach is not added across channels as though it were unique people. EvokeLoop does not claim Meta certification, partnership or completed review merely because a connection interface exists.",
        ],
      },
      {
        title: "Cookies, storage and security",
        paragraphs: [
          "The public pages do not load advertising pixels or optional analytics scripts. The application uses session cookies for sign-in, a short-lived cookie for the Meta authorization flow, and local browser storage for interface preferences such as navigation and theme. Server logs and form abuse controls still process technical information even when no marketing cookie is set.",
          "Implemented protections include workspace access checks, role-restricted approval actions, server-side credential encryption, private asset storage and checks against changed approvals. Public enquiries and deletion requests are accessible only to platform administrators, not ordinary workspace owners. No service can guarantee absolute security; see the Security page for the current scope rather than an unsupported certification claim.",
        ],
      },
      {
        title: "Retention, deletion and your choices",
        paragraphs: [
          "Working assets, account records and activity history remain available while needed for the workspace and service. Disconnecting a Meta connection removes its stored credential in EvokeLoop and invalidates affected queued approvals, but does not automatically erase prior drafts, publications or audit records. OAuth selection sessions expire and are cleaned up as the connection flow runs.",
          "You may request access, correction or deletion through the public Contact or Data deletion page without an EvokeLoop login. We need to verify identity and, for shared business data, authority before acting. A request receipt confirms receipt, not completed deletion. The platform team reviews and fulfills verified requests.",
          "Deletion can require removing eligible active records and stored assets, restricting further use and coordinating with service providers. Limited records may need to remain for legal obligations, security or disputes; backup copies may persist until their applicable retention cycle expires. The team will explain relevant exceptions and timing when handling a verified request, within applicable legal requirements.",
          "For data your employer or another business controls, identify the workspace or contact that business as well. Available privacy rights vary by location and may include access, correction, deletion and objection or restriction. Contact us to exercise a right or ask about a decision. You do not have to delete your Facebook account to make an EvokeLoop request.",
        ],
      },
      {
        title: "Service location, audience and updates",
        paragraphs: [
          "EvokeLoop is a business marketing service, not a product directed to children. Do not upload sensitive personal information or children's data that is unnecessary to your task. Hosting and service providers may process information outside your location, including in the United States.",
          "We update this notice when the service, data use or providers materially change. The published update date identifies the version; important changes may also be communicated through the application or account contact.",
        ],
      },
    ],
  },
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
          "The Privacy notice explains current data handling. Use Settings > Integrations to disconnect an authorized account. Use the Data deletion page to request removal of data held by EvokeLoop. Disconnecting or closing a workspace does not itself delete posts or campaigns already held by Meta, or cancel activity configured directly in an external account.",
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
          "A workspace owner or administrator can open Settings > Integrations, choose the connected account and select Disconnect. This removes the stored connection credential in EvokeLoop and invalidates affected queued approvals. You can also remove EvokeLoop's access through Meta's business-integration or app-access controls where it is listed.",
          "Disconnection is not the same as deletion. It does not automatically remove historical reports, creative assets, publishing records or audit information from EvokeLoop. You do not need to delete your Facebook account.",
        ],
      },
      {
        title: "2. Submit a deletion request",
        paragraphs: [
          "Use the form below, or email the published privacy contact in the Business information panel. Give the email associated with your request, an optional workspace or Page/account reference, and what you want removed: contact information, Meta-connected data, your individual account, or an entire workspace. You can submit a request even if you can no longer sign in.",
          "Do not send passwords, access tokens, verification codes, payment information or unnecessary identity documents. The form saves your request to the platform team's private inbox and gives you a private status link. It does not immediately delete data or send an automatic confirmation email.",
        ],
      },
      {
        title: "3. Verification and fulfillment",
        paragraphs: [
          "The platform team reviews the request and may contact your supplied email to verify identity or business authority. We distinguish your own information from other users' information in a shared workspace. Once verified, eligible data can be removed or anonymized and applicable providers instructed as needed.",
          "Keep your status link and contact reference. The team will explain the scope handled, any information it must retain and the applicable response timing. A status of Received, Under review or Closed alone is not proof that every requested record has been erased; completion and exceptions must be communicated by the team.",
        ],
      },
      {
        title: "What an EvokeLoop deletion does not do",
        paragraphs: [
          "A request to EvokeLoop does not delete your Facebook Page, Meta account, published posts, or ads already created on Meta. Manage or remove that external content directly in Meta. Disconnecting EvokeLoop also does not pause a campaign that is already running on an external platform.",
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
