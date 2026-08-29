import { draftSaveIssues, normalizeDestinationUrl } from "@shared/briefValidation";

export type BriefFormState = {
  name: string;
  destinationUrl: string;
  assetIds: number[];
  productIds: number[];
};

export function getBriefDraftUiState(form: BriefFormState, isSaving = false) {
  const issues = draftSaveIssues(form);
  return {
    issues,
    normalizedDestinationUrl: normalizeDestinationUrl(form.destinationUrl),
    saveDisabled: isSaving,
  };
}
