import { copyFields } from "./copyEvidence";

/** Extract only supplied creative text; never infer image text or dynamic variant results. */
export function creativeCopy(creative: Record<string, any>) {
  const story = creative.object_story_spec ?? {};
  const link = story.link_data ?? {};
  const video = story.video_data ?? {};
  const feed = creative.asset_feed_spec ?? {};
  const children = Array.isArray(link.child_attachments)
    ? link.child_attachments
    : [];
  const texts = (values: unknown[]) =>
    Array.from(
      new Set(
        values
          .filter((v): v is string => typeof v === "string" && !!v.trim())
          .map(v => v.trim())
      )
    );
  const feedTexts = (v: unknown) =>
    Array.isArray(v) ? v.map(i => i?.text) : [];
  const copy = {
    subheadline: [] as string[],
    headline: texts([
      creative.title,
      link.name,
      video.title,
      ...feedTexts(feed.titles),
      ...children.map((c: any) => c.name),
    ]),
    primary_text: texts([
      creative.body,
      link.message,
      video.message,
      story.photo_data?.message,
      ...feedTexts(feed.bodies),
    ]),
    description: texts([
      link.description,
      video.link_description,
      ...feedTexts(feed.descriptions),
      ...children.map((c: any) => c.description),
    ]),
  };
  const oversized = copyFields.some(
    f => copy[f].length > 20 || copy[f].some(t => t.length > 4000)
  );
  const ambiguous =
    children.length > 0 ||
    copyFields.some(f => copy[f].length > 1) ||
    oversized;
  for (const field of copyFields)
    copy[field] = copy[field].slice(0, 20).map(t => t.slice(0, 4000));
  return {
    copy,
    ambiguous,
    warning: oversized
      ? "Creative text exceeded the inspection limit; excluded from style comparisons."
      : ambiguous
        ? "Multiple variants or carousel cards: ad-level results cannot identify the winning individual text."
        : null,
  };
}
