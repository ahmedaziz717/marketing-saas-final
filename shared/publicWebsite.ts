import { z } from "zod";

export const PUBLIC_CONTACT_EMAIL = "ahmed.aziz@cybertron.com";

/** Platform identity, never an individual customer's workspace identity. */
export const websiteProfileSchema = z.object({
  operatorName: z.string().trim().max(180).default(""),
  supportEmail: z
    .union([z.email().max(254), z.literal("")])
    .default(PUBLIC_CONTACT_EMAIL),
  privacyEmail: z
    .union([z.email().max(254), z.literal("")])
    .default(PUBLIC_CONTACT_EMAIL),
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
    headline: "Turn your ideas into standout creative.",
    description:
      "Start with your products and brand. Let AI help with images and copy, compare variations and choose the work that represents your business.",
    items: [
      "AI images and copy assistance",
      "Brand and product source assets",
      "Saved work and version reviews",
      "Image, video and UGC uploads",
    ],
    next: "Keep your brand, product information and approved source assets together as you create.",
  },
  {
    id: "activate",
    number: "02",
    name: "Activate",
    headline: "Bring your campaigns together.",
    description:
      "Keep content, channels and schedules in one workflow. Plan ahead, prepare your campaigns and give your team the final say over what goes live.",
    items: [
      "Facebook publishing workspace",
      "Meta advertising workspace",
      "Weekly, monthly and list calendars",
      "Separate asset and publishing approvals",
    ],
    next: "Choose your destination and approve the content before delivery. Meta image ads are created paused in existing ad sets for your review.",
  },
  {
    id: "measure",
    number: "03",
    name: "Measure",
    headline: "Understand how your marketing performs.",
    description:
      "Bring advertising and social results into clear reports. Compare periods, explore campaigns and see where to focus your attention without building reports from scratch.",
    items: [
      "Overview, advertising and social reports",
      "Date ranges and period comparisons",
      "Campaign and channel breakdowns",
      "Account-level currency context",
    ],
    next: "Reports reflect the data available from your authorized accounts. Review platform-attributed results in the context of your business.",
  },
  {
    id: "optimize",
    number: "04",
    name: "Optimize",
    headline: "Make the next campaign better.",
    description:
      "Turn what you learn into your next creative decision. Review campaign results, refine your brief and build new variations with your team in control.",
    items: [
      "Review campaign learnings",
      "Refine creative variations",
      "Compare and approve versions",
      "Inform the next brief",
    ],
    next: "Your team makes the optimization decisions, using reports, creative versions and approvals to guide the next campaign.",
  },
] as const;
export const FAQ = [
  [
    "Do I need an agency or a large marketing team?",
    "No. EvokeLoop is built for self-service, whether you're a business owner or a lean team. Bring creative, campaign preparation and reporting into one workspace, with AI to help with images and copy. You can involve your own specialists whenever you choose.",
  ],
  [
    "Do I need deep marketing experience?",
    "You can start with your business goals, products and brand. Connected workflows help you create, review, schedule and measure your work. The platform brings AI and practical marketing experience to the process; you bring the knowledge of your customers and decide what to do next.",
  ],
  [
    "What can I do with EvokeLoop?",
    "Create branded images, organize product and service information, review creative work, and plan your publishing calendar. Connect eligible Facebook Pages and Meta ad accounts for their supported publishing and reporting workflows, using the permissions you authorize.",
  ],
  [
    "Do customers need developer apps or API keys for Meta?",
    "Customers use EvokeLoop's Meta connection flow to authorize an eligible Page or ad account. EvokeLoop manages the app credentials. The account and actions available to you depend on Meta permissions and account eligibility.",
  ],
  [
    "Does approving an image publish it?",
    "No. Asset approval makes that version available to use. A post or ad has its own caption, destination, schedule and final approval. Connecting an account is not permission to publish or spend.",
  ],
  [
    "Can I schedule more than one week ahead?",
    "Yes. Plan future weeks and months using weekly, monthly or list views. Review each post's content, destination and final approval before scheduling delivery.",
  ],
  [
    "How do I choose a plan?",
    "Compare Launch, Growth and Scale on our Pricing page, or contact us about Enterprise. Our team will help you choose a plan and confirm pricing, features and usage allowances before purchase.",
  ],
  [
    "Can I disconnect an integration or request deletion?",
    "Yes. Manage connections in Settings > Integrations, and use the public data-deletion request page for information held by EvokeLoop. Disconnecting, removing Meta access, and deleting stored data are different actions. A request does not automatically delete a shared workspace.",
  ],
] as const;
