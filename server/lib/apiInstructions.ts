import { systemPromptContract } from "../../shared/promptContracts";
import sharp from "sharp";
import { apiCatalogRows } from "./apiCatalog";
import {
  apiCatalogMappingSchema,
  type ApiInstructionFile,
} from "../../shared/apiCatalog";
import { invokeLLM, listLLMModels, type MessageContent } from "../_core/llm";
import { requireLatestGptTextModel } from "./models";
import { detectAssetMime } from "./assetLibrary";

export async function instructionContent(
  files: ApiInstructionFile[]
): Promise<MessageContent[]> {
  const content: MessageContent[] = [];
  let total = 0;
  for (const file of files) {
    const bytes = Buffer.from(file.base64, "base64");
    total += bytes.length;
    if (
      !bytes.length ||
      bytes.length > 4 * 1024 * 1024 ||
      total > 6 * 1024 * 1024
    )
      throw new Error("Use at most 3 files, 4 MB each and 6 MB combined.");
    if (file.mimeType.startsWith("image/")) {
      if (detectAssetMime(bytes) !== file.mimeType)
        throw new Error(
          "The instruction image contents do not match its file type."
        );
      const image = await sharp(bytes, { limitInputPixels: 16_000_000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      content.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${image.toString("base64")}` },
      });
    } else if (file.mimeType === "application/pdf") {
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
        throw new Error("Choose a valid PDF instruction document.");
      // Pass data only to the document reader. No local PDF rendering, scripts, URLs or embedded attachments are executed.
      content.push({
        type: "file",
        file: {
          filename: "api-instructions.pdf",
          file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
        },
      });
    } else {
      if (bytes.length > 100_000 || bytes.includes(0))
        throw new Error("Text instructions must be UTF-8 text under 100 KB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      content.push({
        type: "text",
        text: JSON.stringify({ instructionDocument: file.name, text }),
      });
    }
  }
  return content;
}
function shape(value: unknown, depth = 0): unknown {
  if (depth > 8) return "…";
  if (Array.isArray(value))
    return value.length ? [shape(value[0], depth + 1)] : [];
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 60)
        .map(([key, entry]) => [key, shape(entry, depth + 1)])
    );
  return value === null ? "null" : typeof value;
}
function sampleValues(value: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(value))
    return value.slice(0, 2).map(v => sampleValues(v, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !/password|secret|token|authorization|api.?key/i.test(key)
        )
        .slice(0, 40)
        .map(([k, v]) => [k, sampleValues(v, depth + 1)])
    );
  return typeof value === "string" ? value.slice(0, 250) : value;
}
export async function suggestApiMapping(
  data: unknown,
  notes: string,
  files: ApiInstructionFile[]
) {
  const attachments = await instructionContent(files);
  let samples: unknown = [];
  try {
    samples = sampleValues(apiCatalogRows(data).slice(0, 2));
  } catch {
    /* Structure and instructions can identify a custom root. */
  }
  const model = requireLatestGptTextModel((await listLLMModels()).data);
  const result = await invokeLLM({
    promptTemplateId: "catalog.api",
    model,
    maxTokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPromptContract("contract.apiInstructions.1"),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              responseStructure: shape(data),
              sampleProducts: samples,
              notes,
            }),
          },
          ...attachments,
        ],
      },
    ],
  });
  const text = result.choices[0]?.message?.content;
  return apiCatalogMappingSchema.parse(
    JSON.parse(typeof text === "string" ? text : "{}")
  );
}
