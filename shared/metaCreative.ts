import type { PublicationContent } from "./channels";
export function metaLinkData(content: PublicationContent, hashes: string[]) {
  const card = {
    link: content.link,
    name: content.headline,
    description: content.description,
    call_to_action: {
      type: content.callToAction,
      value: { link: content.link },
    },
  };
  if (hashes.length < 1 || hashes.length > 10 || hashes.some(h => !h))
    throw new Error("Missing approved ad images.");
  return hashes.length === 1
    ? { ...card, message: content.message, image_hash: hashes[0] }
    : {
        link: content.link,
        message: content.message,
        child_attachments: hashes.map(image_hash => ({ ...card, image_hash })),
        multi_share_optimized: false,
        multi_share_end_card: false,
      };
}
