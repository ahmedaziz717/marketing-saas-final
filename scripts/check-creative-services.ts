import "dotenv/config";
import { listImageModels } from "../server/_core/imageGeneration";
import { listLLMModels } from "../server/_core/llm";
import {
  requireLatestGptImageModel,
  requireLatestGptTextModel,
} from "../server/lib/models";

// Run in the existing Manus environment. Never print credentials or whole service responses.
const checks = await Promise.allSettled([
  listImageModels().then(result => requireLatestGptImageModel(result.models)),
  listLLMModels().then(result => requireLatestGptTextModel(result.data)),
]);
checks.forEach((result, index) => {
  const name = index === 0 ? "Image generation" : "Copy generation";
  console.log(
    name +
      ": " +
      (result.status === "fulfilled"
        ? "configured engine available"
        : "not verified; check the Manus service configuration and advertised model availability")
  );
});
if (checks.some(result => result.status === "rejected")) process.exitCode = 1;
