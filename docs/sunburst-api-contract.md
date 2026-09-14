# GPT Image 2.5 Sunburst API Contract

Verified on 2026-09-14 against the official OpenAI documentation and the project’s authenticated API access.

## Verified findings

The OpenAI Images API supports `gpt-image-2.5-sunburst` for both image generation and image editing. The image-edit endpoint is `POST https://api.openai.com/v1/images/edits`; it accepts up to 16 input images as file IDs, fully qualified URLs, or base64 data URLs. Sunburst supports arbitrary `WIDTHxHEIGHT` sizes within documented constraints, quality values including `medium`, and returns base64 image data.

The securely matched `OPENAI_API_KEY` successfully retrieved `GET https://api.openai.com/v1/models/gpt-image-2.5-sunburst`, confirming that this project’s OpenAI account has direct access to the required model.

Frame’s built-in image gateway returned only `gpt-image-2` (`MODEL_GPT_IMAGE_2`) and `gemini-2.5-flash-image-preview`; therefore the gateway catalog could not satisfy Frame’s strict Sunburst requirement. Creative Builder now uses the direct server-side OpenAI Images API for Sunburst while keeping credentials outside the browser and repository.

## Sources

1. [OpenAI Image Generation Guide](https://developers.openai.com/api/docs/guides/image-generation)
2. [OpenAI Create Image Edit API Reference](https://developers.openai.com/api/reference/resources/images/methods/edit/)
