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

// Placement customization chooses an image within one single-image ad.
// It does not change the ad set's enabled placements or create a carousel.
export function metaPlacementFeed(
  content: PublicationContent,
  hashes: Record<string, string>
) {
  const assets = content.placementAssetKeys;
  if (!assets?.square || !assets.portrait || !assets.story)
    throw new Error("Choose all three placement images.");
  const label = (name: string) => ({ name: `evokeloop_${name}` });
  return {
    ad_formats: ["SINGLE_IMAGE"],
    optimization_type: "PLACEMENT",
    images: (["square", "portrait", "story"] as const).map(slot => {
      const hash = hashes[assets[slot]!];
      if (!hash) throw new Error("Missing approved placement image.");
      return { hash, adlabels: [label(slot)] };
    }),
    bodies: [{ text: content.message }],
    titles: [{ text: content.headline }],
    descriptions: [{ text: content.description || " " }],
    link_urls: [{ website_url: content.link }],
    call_to_action_types: [content.callToAction],
    asset_customization_rules: [
      {
        customization_spec: {
          publisher_platforms: ["facebook", "instagram"],
          facebook_positions: ["story", "facebook_reels"],
          instagram_positions: ["story", "reels"],
        },
        image_label: label("story"),
      },
      {
        customization_spec: {
          publisher_platforms: ["instagram"],
          instagram_positions: ["stream"],
        },
        image_label: label("portrait"),
      },
      {
        customization_spec: {},
        image_label: label("square"),
      },
    ],
  };
}

export function hasTextVariants(content: PublicationContent) {
  return (
    !!content.textVariants &&
    Object.values(content.textVariants).some(values => values.length > 0)
  );
}
export function metaTextFeed(content: PublicationContent) {
  if (
    !hasTextVariants(content) ||
    content.placementAssetKeys ||
    content.carouselAssetKeys?.length
  )
    throw new Error("Multiple text options require a single-image ad.");
  const texts = (first: string, rest: string[]) =>
    Array.from(new Set([first, ...rest].filter(t => t.trim()))).map(text => ({
      text,
    }));
  return {
    optimization_type: "DEGREES_OF_FREEDOM",
    bodies: texts(content.message, content.textVariants!.messages),
    titles: texts(content.headline, content.textVariants!.headlines),
    descriptions: texts(content.description, content.textVariants!.descriptions)
      .length
      ? texts(content.description, content.textVariants!.descriptions)
      : [{ text: " " }],
    link_urls: [{ website_url: content.link }],
    call_to_action_types: [content.callToAction],
  };
}
