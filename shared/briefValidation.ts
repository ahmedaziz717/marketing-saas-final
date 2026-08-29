export type BriefDraftInput = {
  name: string;
  audience: string;
  offer: string;
  creativeDirection: string;
  destinationUrl?: string | null;
  placements: string[];
  formats: string[];
  assetIds: number[];
};

export function normalizeDestinationUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function draftSaveIssues(input: Pick<BriefDraftInput, "name" | "destinationUrl">) {
  const issues: string[] = [];
  if (input.name.trim().length < 3) issues.push("Brief name must contain at least 3 characters");
  if (normalizeDestinationUrl(input.destinationUrl ?? "") === null) issues.push("Destination URL must be a valid web address");
  return issues;
}

export function briefSubmissionIssues(input: BriefDraftInput) {
  const issues = draftSaveIssues(input);
  if (input.audience.trim().length < 10) issues.push("Audience must contain at least 10 characters");
  if (input.offer.trim().length < 3) issues.push("Offer must contain at least 3 characters");
  if (input.creativeDirection.trim().length < 10) issues.push("Creative direction must contain at least 10 characters");
  if (!input.placements.length) issues.push("Select at least one placement");
  if (!input.formats.length) issues.push("Select at least one format");
  if (!input.assetIds.length) issues.push("Select at least one approved brand asset");
  return issues;
}
