/** Presentation only: registry values/history and generation resolution stay intact. */
export type PromptGroup = "creative" | "visual" | "technical";
const essentials = new Set([
  "creative.base",
  "creative.copy",
  "video.direction",
  "publishing.copy",
  "copy.asset",
]);
export function promptGroup(id: string): PromptGroup {
  if (essentials.has(id)) return "creative";
  if (/^creative\.(theme|mood|style|shot)\./.test(id)) return "visual";
  return "technical";
}
