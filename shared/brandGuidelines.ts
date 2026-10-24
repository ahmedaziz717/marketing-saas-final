import { z } from "zod";

export const BRAND_VOICE_MAX_LENGTH = 30_000;
export const BRAND_PDF_MAX_BYTES = 8 * 1024 * 1024;
export const BRAND_PDF_MAX_PAGES = 40;
export const BRAND_PDF_MAX_TEXT = 100_000;
export const brandVoiceSchema = z
  .string()
  .max(
    BRAND_VOICE_MAX_LENGTH,
    "Brand voice can contain up to 30,000 characters. Shorten the text before saving."
  );
export const brandPdfInput = z.object({
  organizationId: z.number().int().positive(),
  name: z.string().min(1).max(180),
  mimeType: z.literal("application/pdf"),
  base64: z
    .string()
    .min(8)
    .max(Math.ceil(BRAND_PDF_MAX_BYTES / 3) * 4),
});
