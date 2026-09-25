import type { Article } from "./content";

export const PRIVACY_POLICY: Article = {
  title: "Privacy policy",
  eyebrow: "Your information. Your choices.",
  intro:
    "How EvokeLoop collects, uses, discloses and protects personal information across our website, marketing workspace and connected services. Effective September 24, 2026.",
  sections: [
    {
      title: "1. Scope and responsibility",
      paragraphs: [
        "This policy applies to evokeloop.com, app.evokeloop.com, our support communications and the EvokeLoop service. EvokeLoop is a division of Cybertron International, Inc., located at 4747 South Emporia Street, Wichita, KS 67216, United States. References to ‘EvokeLoop’, ‘we’ and ‘our’ mean Cybertron International, Inc., the operator of the service. Contact our privacy team at privacy@evokeloop.com or through our Contact page.",
        "We determine how information is used for our own account administration, website, security and business enquiries. When a customer connects marketing accounts, imports a catalog or supplies content about other people, we process that information on the customer's instructions to provide the service. The customer determines its campaigns and purposes and is responsible for its own notices, consent, permissions and applicable data-processing agreement. Contact that business about its activities; we will help route requests that concern information we process for it.",
        "This policy applies across enabled integrations, including advertising, social media, commerce and email services. Naming a provider does not mean every integration, permission or feature is available to every customer. We access an external account only through an enabled feature and the authorization you or your organization provides.",
      ],
    },
    {
      title: "2. Information we collect and its sources",
      paragraphs: [
        "Account and business information: names, work email addresses, authentication identifiers, business or workspace names, team membership, roles, invitations and settings. We receive this from you, your workspace administrator and our authentication provider. Passwords are handled by our authentication service; we do not need your external platform password to connect an account.",
        "Content and catalog information: prompts, brand instructions, product names, descriptions, prices, specifications, product URLs, images, videos, logos, captions, drafts, generated outputs, approval decisions and comments. You provide this directly or instruct us to import it from an authorized store, file or website. Content can contain personal information about its creators or depicted people.",
        "Connected-account information: provider and account identifiers, account or Page names, granted permissions, connection status, authorization credentials, selected destinations, campaign or publication records and performance metrics made available by the provider. We receive only the data used by the integration you enable, subject to your account access and provider permissions.",
        "Enquiry information: your name, email address, request category, optional business or workspace reference, message and our response or verification records. You provide this through forms, email or support conversations. Do not submit passwords, access tokens, financial account details, government identifiers or unnecessary sensitive information.",
        "Plan and commercial enquiries: your selected plan preview, business contact details, requested services and related correspondence. The current service has no active online checkout or payment-processor integration and does not collect payment-card numbers, card security codes or bank-account credentials through a billing feature. Selecting a plan preview does not create a paid subscription or charge you. Do not include payment credentials in a contact form or email. Before introducing online billing, we will identify the payment provider and explain the payment information it receives and the transaction or billing records EvokeLoop receives.",
        "Technical information: IP addresses, browser and device request information, timestamps, visited endpoints, error and security logs, session identifiers and interface preferences. This is generated when your browser or a connected service interacts with our infrastructure. We do not request precise device location or use uploaded images to identify people through biometric recognition.",
      ],
    },
    {
      title: "3. How we use information",
      paragraphs: [
        "We use account information to authenticate users, administer workspaces and enforce access permissions. We use content and catalog information to perform requested imports, creative generation, editing, storage and review. We use connected-account information to manage authorized connections, carry out approved publishing or advertising actions and show reports. A connection by itself does not authorize an unapproved publication or budget change.",
        "We use plan preferences and commercial enquiries to discuss service options and maintain the commercial records you provide. Current usage counters support product visibility; they are not an active payment collection system.",
        "We use enquiry information to answer questions, arrange requested demonstrations, provide support and handle privacy requests. Contact submissions are stored in our restricted platform inbox and routed to our designated support email. Submitting a form does not subscribe you to promotional email.",
        "We use technical and activity information to operate and troubleshoot the service, prevent abuse, investigate security issues, enforce our terms and document approvals. We may also process information as necessary to meet legal obligations, resolve disputes and protect rights. We do not use customer information to make eligibility decisions about employment, lending, housing, insurance or similarly significant matters.",
      ],
    },
    {
      title: "4. Advertising and social platform connections",
      paragraphs: [
        "Meta, Facebook and Instagram: an enabled connection may provide the identity and permissions needed to discover selected Pages or advertising accounts, their IDs and names, Page tasks, posts, campaign and ad details, spend, clicks and platform-reported engagement or conversions. The current Facebook workflow does not retrieve private messages or lead-form submissions. We do not sell Meta Platform Data or use one customer's connected data as a product for other customers.",
        "Google Ads and Microsoft Advertising (Bing): when an integration is enabled and authorized, its purposes are the account, campaign and reporting functions shown in the product. Relevant information can include selected account IDs, campaign settings, ads, budgets and provider-reported performance. We do not obtain access merely because a provider is listed on our website. Permissions and available data are shown in the applicable connection flow.",
        "Other social and email platforms: data access is limited to the enabled function and permissions you grant. A connection must not be used to bypass a person's consent or unsubscribe choice. New access to contacts, individual recipients, private messages or other materially different personal information requires an appropriate feature disclosure and authorization before collection.",
        "The external provider processes information under its own terms and privacy policy. You can revoke access through that provider's account controls and disconnect available connections in EvokeLoop's Integrations area. Revocation stops authorized future access; it does not itself erase records previously imported or content already published on another platform.",
      ],
    },
    {
      title: "5. Google API data and Limited Use",
      paragraphs: [
        "EvokeLoop complies with the Google API Services User Data Policy, including applicable Limited Use requirements, when receiving information from Google APIs.",
        "Google data subject to Limited Use is used for the prominently disclosed, authorized features. We do not sell it, use it for advertising targeting, credit decisions or unrelated purposes, or use it to train general-purpose AI models. Transfers and human access are limited to the circumstances permitted by Google's policy, such as providing the authorized feature with consent, investigating security issues or complying with law. More restrictive Google product or scope rules also apply.",
      ],
      links: [
        {
          label: "Google API Services User Data Policy",
          href: "https://developers.google.com/terms/api-services-user-data-policy",
        },
        {
          label: "Manage connections to your Google Account",
          href: "https://myaccount.google.com/connections",
        },
      ],
    },
    {
      title: "6. Shopify and other commerce platforms",
      paragraphs: [
        "Our current Shopify, BigCommerce and WooCommerce catalog connectors import product information, including descriptions, variants, prices, images and store or product identifiers, using credentials supplied by an authorized workspace administrator. These catalog features do not request customer, order, payment-card or checkout records.",
        "If a future feature needs protected customer information, we will disclose the data and purpose, obtain required permissions and provider approval, and apply the applicable merchant instructions, consent choices and deletion requirements before enabling that access. We do not sell merchant or customer data or use it to contact a merchant's customers for our own marketing.",
        "A shopper with a request about a merchant's store should contact that merchant. You may also contact us to identify information EvokeLoop holds on the merchant's behalf. We will coordinate with the merchant as appropriate and handle applicable verified requests and provider privacy instructions.",
      ],
    },
    {
      title: "7. AI-assisted features",
      paragraphs: [
        "When you request AI generation or copy assistance, the inputs needed for that task—such as your prompt, selected images, product facts and brand instructions—are sent to our configured AI service, currently OpenAI. The resulting content is returned to your workspace. Only provide material you are authorized to process in this way; remove unnecessary personal or sensitive information first.",
        "EvokeLoop does not train or operate a general-purpose AI model using customer content or connected-platform personal information. We use the provider's business API to carry out requested tasks, subject to its applicable data-use and retention terms. This is not a promise of zero provider retention. Connected data subject to restrictions on AI use remains subject to those restrictions. Generated content requires human review before use.",
      ],
    },
    {
      title: "8. Who receives information",
      paragraphs: [
        "Service providers receive information needed to perform their functions: Render hosts the application; Supabase provides authentication, database and asset storage; OpenAI processes requested AI tasks; and Resend handles configured authentication and support emails, receives messages sent to our privacy address and forwards them to our designated restricted support mailbox. These messages may include attachments supplied by the sender. Our support mailbox also receives contact-form notifications. These providers' processing is governed by the applicable service terms and agreements.",
        "Authorized workspace members can access workspace information according to their roles. Selected advertising, social, commerce or email providers receive the API requests and content necessary for your authorized actions. Platform personnel may access information for necessary support, security and operation, subject to applicable platform-specific restrictions.",
        "We may disclose information where legally required, to protect rights or investigate abuse, to professional advisers subject to appropriate confidentiality, or in a business transaction with safeguards and any required notice or consent. Platform restrictions, including Google's restrictions on transfers, continue to apply. We do not make customer workspace data available to unrelated customers.",
      ],
    },
    {
      title: "9. Cookies, tracking and privacy signals",
      paragraphs: [
        "We use necessary authentication and security cookies and local browser storage for preferences such as theme and navigation. Disabling these can prevent sign-in or affect functionality. Our public pages currently do not load advertising pixels or optional analytics scripts. Google Fonts supplies the Manrope font and receives technical request information, such as your IP address, when your browser requests its files.",
        "We do not sell personal information, share it for cross-context behavioral advertising, or use visitors' activity for targeted advertising. Accordingly, there is no such activity to disable when we receive a Global Privacy Control signal. We do not change essential service processing in response to a browser's Do Not Track setting. If these practices change, we will provide the required notice, consent and opt-out controls before introducing the change.",
        "An authorized customer's campaign on an external platform is governed by that customer's choices and the platform's controls. Connecting an advertising account does not install a tracking pixel on the EvokeLoop website or authorize us to disregard a privacy preference.",
      ],
    },
    {
      title: "10. Retention and deletion",
      paragraphs: [
        "We retain account and workspace records while needed to provide the service, maintain authorized access and resolve account matters. Content, catalog and reporting records are retained while needed for the customer's workspace and instructions. We retain support and privacy correspondence while needed to address the request, document its handling and meet applicable obligations. Security and activity records are retained according to their operational purpose and applicable legal requirements. Retention depends on the type of record, ongoing service need, customer instructions, applicable provider restrictions and any legal hold; we do not promise one universal deletion period.",
        "Disconnecting supported integrations removes their stored authorization credentials and stops future synchronization or access. It does not automatically remove historical assets, reports, publications or audit records. You can separately request deletion of eligible data through our Contact or Data deletion page, including when you cannot sign in.",
        "Verified deletion can require removing or de-identifying active records and files and coordinating with relevant service providers. We may retain limited information for legal obligations, security, dispute handling or other permitted exceptions and explain applicable limitations. Backups may remain until their normal replacement or deletion cycle, with access restricted. Content already published on a third-party platform must also be managed through that platform.",
      ],
    },
    {
      title: "11. U.S. state privacy rights",
      paragraphs: [
        "Depending on where you live, the information involved and whether a law applies, you may have rights to confirm processing, access or obtain a portable copy of information, correct inaccuracies, request deletion, and obtain information about disclosures. You may also have rights to opt out of sale, targeted advertising or certain consequential profiling, or to limit particular uses of sensitive personal information. We do not engage in the sale, cross-context advertising sharing or consequential profiling described above. We use account credentials for authentication and security, not to infer sensitive characteristics.",
        "California residents: the categories described in section 2 include identifiers, business or professional information, internet or network activity, commercial workspace or campaign records, and visual or other content you provide. Account access credentials may be sensitive personal information. Sources, purposes, recipient categories and retention criteria for our current practices are explained in sections 2–10. You may request applicable information about our collection and disclosures during the preceding 12 months or another period required by law. We do not collect every statutory category simply because it appears in a law, and we do not knowingly sell or share the personal information of anyone under 16.",
        "We will not unlawfully discriminate or retaliate against you for exercising privacy rights. Rights and exceptions differ across states, and some laws treat employment or business-contact information differently. If we process information for a customer, we may refer the request to that customer or assist it in responding.",
      ],
    },
    {
      title: "12. Requests, verification and appeals",
      paragraphs: [
        "Email privacy@evokeloop.com or use the Contact page and select Privacy question or request or Data deletion request. State your request, the email associated with the information and, if relevant, the workspace or provider. You do not need to create an EvokeLoop account. We will contact you within two business days; this initial response is separate from the time needed to verify and fulfill a privacy request.",
        "We verify identity and authority in proportion to the request and use verification information for that purpose. An authorized agent may submit a request; we may ask for proof of authorization and verification permitted by law. Do not send passwords, access tokens or identity documents through the public form. We will explain any necessary secure verification steps.",
        "We respond within the applicable legal deadline. For covered California access, correction and deletion requests, that is generally 45 calendar days, with a permitted extension explained within the initial period. Other requests and jurisdictions may have different or shorter deadlines. We will explain a denial or an applicable exception rather than treating a receipt as completed fulfillment.",
        "Where an appeal right applies, reply to our decision or email the same address with ‘Privacy appeal’ and the request reference. We will review the decision and respond within the applicable period, with reasons and information about contacting your state attorney general or other regulator if the appeal is denied. You may also contact your regulator directly. Ask us for an accessible alternative format if you need one.",
      ],
      links: [
        { label: "Submit a privacy request", href: "/contact?topic=privacy" },
        { label: "Data deletion instructions", href: "/data-deletion" },
        {
          label: "Email the privacy team",
          href: "mailto:privacy@evokeloop.com",
        },
      ],
    },
    {
      title: "13. Security and service locations",
      paragraphs: [
        "We use HTTPS, server-side authorization and workspace access controls, encrypted integration credentials and private asset storage. Public contact requests are restricted to platform administrators. No transmission or storage system is perfectly secure. We will assess security incidents and provide notifications when required by applicable law.",
        "The service and its providers may process information in the United States and other locations where they operate. Privacy laws can differ from those in your location. Where a transfer requires particular safeguards, the applicable agreements and transfer requirements govern that processing. This policy does not assert a certification, regulatory approval or specific transfer mechanism that has not been established.",
      ],
    },
    {
      title: "14. European Economic Area and United Kingdom",
      paragraphs: [
        "This section applies where the EU GDPR or UK GDPR governs our processing. For our own account, website and business-administration activities, we act as a controller. For personal information processed on a customer's instructions within its workspace, we act as a processor; that customer determines its lawful basis and responds to requests, with our assistance where required.",
        "Our controller purposes and legal bases are: providing a service or taking requested pre-contract steps where necessary for a contract with you; legitimate interests in administering business accounts, supporting customer organizations, responding to enquiries and keeping the service secure, subject to your rights and interests; and compliance with applicable legal obligations, including required records and privacy requests. Where your employer is the customer, we do not treat its contract as a contract with you. If a feature requires consent, we request it separately before the relevant processing. An integration authorization is not blanket consent to unrelated uses.",
        "Subject to applicable conditions, you can request access, correction, erasure, restriction and data portability. Where processing relies on consent, you may withdraw it at any time through the relevant control or by emailing privacy@evokeloop.com, without affecting earlier lawful processing. Required account and security information is needed to provide access; withholding it may prevent us from providing the requested service. Optional enquiries and content are voluntary.",
        "Your right to object: you may object to processing based on legitimate interests for reasons relating to your situation. You may object to direct marketing at any time. Contact privacy@evokeloop.com to exercise these rights. We do not make solely automated decisions about individuals that produce legal or similarly significant effects.",
        "We respond to applicable rights requests without undue delay and normally within one month. Where the law permits an extension for complexity or number of requests, we explain it within the initial period. You may complain to your competent EEA supervisory authority, including where you live or work or where an alleged infringement occurred, or to the UK Information Commissioner's Office. You do not need to contact us first.",
        "International transfers: our U.S.-based service and the providers described in section 8 can involve processing outside the EEA or UK. A restricted transfer requires an applicable adequacy decision or appropriate safeguards, such as the European Commission's standard contractual clauses and, for UK transfers, an applicable UK addendum or International Data Transfer Agreement, with any required assessment and supplementary measures. The mechanism depends on the recipient and transfer; this notice does not claim that every provider is certified or that a particular agreement has been signed. Contact privacy@evokeloop.com for information about the safeguards applicable to your data and how to obtain a copy, subject to necessary redactions. Agreeing to this policy does not itself authorize a restricted transfer.",
      ],
      links: [
        {
          label: "Find an EEA supervisory authority",
          href: "https://www.edpb.europa.eu/about-edpb/about-edpb/members_en",
        },
        {
          label: "Complain to the UK ICO",
          href: "https://ico.org.uk/make-a-complaint/",
        },
        { label: "Submit a privacy request", href: "/contact?topic=privacy" },
      ],
    },
    {
      title: "15. Children and restricted information",
      paragraphs: [
        "EvokeLoop is a business service intended for adults acting for themselves or an authorized organization. It is not directed to children under 13, and we do not knowingly collect their personal information. Contact our privacy team if you believe a child has provided information so we can investigate and remove it as appropriate.",
        "Do not use the service to submit unnecessary health information, financial account data, government identifiers, precise location data, biometric identifiers, children's information or other sensitive records. Do not use generated content or connected information for unlawful profiling, discrimination or surveillance.",
      ],
    },
    {
      title: "16. Changes and contacting us",
      paragraphs: [
        "We review this policy and update the effective date when it changes. Material changes will receive any additional notice or consent required before the new use begins. A new purpose or expanded integration is not authorized merely by updating this page.",
        "For privacy, support, an appeal or an accessible copy of this policy, contact privacy@evokeloop.com. You may also use the public Contact form. We will contact you within two business days after receiving an enquiry.",
      ],
    },
  ],
};
