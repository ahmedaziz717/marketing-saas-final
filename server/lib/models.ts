export const REQUIRED_TEXT_MODEL_ID = "gpt-5.5";
export const REQUIRED_IMAGE_MODEL_ID = "gpt-image-2.5-sunburst";

export function requireLatestGptTextModel(models: Array<{ id: string }>) {
  const model = models.find(candidate => candidate.id === REQUIRED_TEXT_MODEL_ID);
  if (!model) {
    throw new Error(`Required GPT text model ${REQUIRED_TEXT_MODEL_ID} is unavailable`);
  }
  return model.id;
}

export function requireLatestGptImageModel(models: Array<{ model?: string; id?: string }>) {
  const model = models.find(candidate => candidate.id === REQUIRED_IMAGE_MODEL_ID);
  if (!model?.model) {
    throw new Error(`Required GPT image model ${REQUIRED_IMAGE_MODEL_ID} is unavailable`);
  }
  return model.model;
}
