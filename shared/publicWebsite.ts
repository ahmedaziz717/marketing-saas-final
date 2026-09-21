import { z } from "zod";

/** Platform identity, never an individual customer's workspace identity. */
export const websiteProfileSchema = z.object({
  operatorName: z.string().trim().max(180).default(""),
  supportEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  privacyEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  businessAddress: z.string().trim().max(500).default(""),
  operatorWebsite: z
    .union([
      z.url().refine(v => {
        try {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }, "Use an HTTPS URL without credentials"),
      z.literal(""),
    ])
    .default(""),
  disclosuresApproved: z.boolean().default(false),
});
export type WebsiteProfile = z.infer<typeof websiteProfileSchema>;
export const emptyWebsiteProfile = websiteProfileSchema.parse({});
export const websiteRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  topic: z.enum(["access", "demo", "support", "privacy", "deletion"]),
  workspace: z.string().trim().max(200).default(""),
  message: z.string().trim().min(10).max(4000),
  acknowledgement: z.literal("yes"),
  website: z.string().max(200).default(""),
  formToken: z.string().max(180),
});
export const REQUEST_STATES = [
  "received",
  "under_review",
  "awaiting_verification",
  "closed",
] as const;
export const PUBLIC_PATHS = [
  "/",
  "/product",
  "/product/create",
  "/product/activate",
  "/product/measure",
  "/product/optimize",
  "/integrations",
  "/pricing",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/security",
] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];
export const PILLARS = [
  {
    id: "create",
    number: "01",
    name: "Create",
    headline: "Make your next great campaign.",
    description:
      "Bring your products, brand and creative ideas into one place. Generate images, compare variations, and send only the versions you choose for approval.",
    status: "Available in preview",
    items: [
      "AI image and ad creative",
      "Brand and product source assets",
      "Saved work and version reviews",
      "Image, video and UGC uploads",
    ],
    next: "Video creation, email design, landing pages, and blog content are planned.",
  },
  {
    id: "activate",
    number: "02",
    name: "Activate",
    headline: "Give approved work a destination.",
    description:
      "Bring social and paid activity into a shared publishing workflow. Choose a channel, prepare your message and plan beyond this week without losing the final approval.",
    status: "Connection required",
    items: [
      "Facebook-first social workspace",
      "Meta advertising workspace",
      "Weekly, monthly and list calendars",
      "Separate asset and publishing approvals",
    ],
    next: "External delivery needs Meta authorization and live delivery enabled. New Meta image ads are created paused in existing ad sets. More channels and email delivery are planned.",
  },
  {
    id: "measure",
    number: "03",
    name: "Measure",
    headline: "See the work. Understand the results.",
    description:
      "Review organic and paid performance in a shared reporting area, then narrow the view by channel, account and date. Keep platform-reported results in context.",
    status: "Connection required",
    items: [
      "Overview, advertising and social reports",
      "Date ranges and period comparisons",
      "Campaign and channel breakdowns",
      "Account-level currency context",
    ],
    next: "Reports depend on authorized data and provider availability. Cross-channel attribution and incrementality are planned, not currently included.",
  },
  {
    id: "optimize",
    number: "04",
    name: "Optimize",
    headline: "Build toward better decisions.",
    description:
      "The next chapter connects measurement to action: recommendations, budget planning, experiments and an AI agent, with explicit controls for the team.",
    status: "On the roadmap",
    items: [
      "Performance recommendations",
      "Budget optimization",
      "Experiments and incrementality",
      "Approval-controlled AI agent",
    ],
    next: "These optimization tools are planned. No launch date, automated action, or performance result is promised.",
  },
] as const;
export const FAQ = [
  [
    "What can I use today?",
    "The preview includes image creation, saved work, uploads, asset reviews, product catalogs, and publishing plans. Facebook and Meta reporting/delivery also require a configured platform integration, customer authorization and the relevant permissions. Video generation, email and page builders, attribution and optimization are on the roadmap.",
  ],
  [
    "Do customers need developer apps or API keys for Meta?",
    "No. The intended customer flow is Connect with Meta, authorize access, and select your own Page or ad account. Frame supplies the platform integration. Public Meta onboarding is pending platform configuration and review; a working test account does not establish approval for all customers.",
  ],
  [
    "Does approving an image publish it?",
    "No. Asset approval makes that version available to use. A post or ad has its own caption, destination, schedule and final approval. Connecting an account is not permission to publish or spend.",
  ],
  [
    "Can I schedule more than one week ahead?",
    "Yes. Weekly is the default calendar view, not a scheduling limit. Plan future weeks and months. A planning slot is not a scheduled post, and a test schedule does not become live just because live delivery is later enabled.",
  ],
  [
    "Are the prices final?",
    "Not yet. Launch, Growth and Scale prices are proposed monthly USD prices. Checkout and automatic billing are not active; allowances, credit costs, overages and final terms will be confirmed before any purchase.",
  ],
  [
    "Can I disconnect an integration or request deletion?",
    "Yes. Manage connections in Settings > Integrations, and use the public data-deletion request page for information held by Frame. Disconnecting, removing Meta access, and deleting stored data are different actions. A request does not automatically delete a shared workspace.",
  ],
] as const;
