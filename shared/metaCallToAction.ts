import { z } from "zod";

/** Website link creatives supported by EL. Phone, messaging and app CTAs need
 * other destination payloads and are intentionally outside this capability set.
 * Meta reference, checked 2026-10-14:
 * https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-cli/ad-creatives.md/
 * Meta still validates objective / placement eligibility at delivery. */
export const metaWebsiteCallToActions = [
  {
    id: "LEARN_MORE",
    label: "Learn more",
    description: "Explore the offer on your website.",
  },
  {
    id: "SHOP_NOW",
    label: "Shop now",
    description: "Browse your products or collection.",
  },
  {
    id: "BUY_NOW",
    label: "Buy now",
    description: "Go to a product or purchase page.",
  },
  {
    id: "GET_OFFER",
    label: "Get offer",
    description: "See the details of your offer.",
  },
  { id: "SIGN_UP", label: "Sign up", description: "Register on your website." },
  {
    id: "SUBSCRIBE",
    label: "Subscribe",
    description: "Join a subscription or mailing list.",
  },
  {
    id: "CONTACT_US",
    label: "Contact us",
    description: "Visit your website contact page.",
  },
  {
    id: "GET_QUOTE",
    label: "Get quote",
    description: "Request pricing on your website.",
  },
  {
    id: "APPLY_NOW",
    label: "Apply now",
    description: "Open your website application.",
  },
  {
    id: "BOOK_TRAVEL",
    label: "Book travel",
    description: "Visit your travel booking page.",
  },
  {
    id: "DOWNLOAD",
    label: "Download",
    description: "Open a website download page.",
  },
  {
    id: "WATCH_MORE",
    label: "Watch more",
    description: "Watch content on your website.",
  },
  {
    id: "OPEN_LINK",
    label: "Open link",
    description: "Open the destination website.",
  },
  {
    id: "NO_BUTTON",
    label: "No button",
    description: "Use the linked creative without a CTA button.",
  },
] as const;
export const metaCallToActionSchema = z.enum(
  metaWebsiteCallToActions.map(option => option.id)
);
export type MetaCallToAction = z.infer<typeof metaCallToActionSchema>;
export function metaCallToActionLabel(value: MetaCallToAction) {
  return metaWebsiteCallToActions.find(option => option.id === value)!.label;
}
