import type { Channel, PublicationContent } from "./channels";

export const SOCIAL_CAPTION_LIMIT = 5000;

function captionUrl(value: string) {
  let url = value.replace(/^[([{<]+/, "").replace(/[>.,!;]+$/, "");
  for (const [opening, closing] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]) {
    while (
      url.endsWith(closing) &&
      url.split(closing).length > url.split(opening).length
    )
      url = url.slice(0, -1);
  }
  return url;
}

export function appendCaptionLink(message: string, link: string) {
  const url = link.trim();
  if (!url) return message;
  const alreadyIncluded = message.split(/\s+/).some(word => {
    if (word === url) return true;
    const candidate = captionUrl(word);
    return (
      candidate === url ||
      candidate.replace(/\/$/, "") === url.replace(/\/$/, "")
    );
  });
  return alreadyIncluded
    ? message
    : [message.trimEnd(), url].filter(Boolean).join("\n\n");
}

/** Normalize only while editing/saving a draft, before approval is recorded. */
export function normalizeSocialPost(
  channel: Channel,
  assetKey: string | null | undefined,
  content: PublicationContent
): PublicationContent {
  if (channel !== "facebook" || !assetKey || !content.link.trim())
    return content;
  return {
    ...content,
    message: appendCaptionLink(content.message, content.link),
    link: "",
  };
}

export function socialPostTitle(
  content: PublicationContent,
  assetName?: string
) {
  if (content.title.trim() && content.title !== "Untitled post")
    return content.title;
  return (
    content.message.trim().split("\n")[0] ||
    assetName ||
    "Facebook post"
  ).slice(0, 180);
}

export function replaceSocialCaption(previous: string, replacement: string) {
  const links = previous.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  return links.reduce(
    (caption, link) => appendCaptionLink(caption, captionUrl(link)),
    replacement
  );
}
