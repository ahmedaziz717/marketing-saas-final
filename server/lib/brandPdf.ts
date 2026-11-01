import { Worker } from "node:worker_threads";
import { TRPCError } from "@trpc/server";
import {
  BRAND_PDF_MAX_BYTES,
  BRAND_PDF_MAX_PAGES,
  BRAND_PDF_MAX_TEXT,
} from "../../shared/brandGuidelines";

const active = new Set<number>();
const errors: Record<string, string> = {
  password: "This PDF is password protected. Upload an unlocked copy.",
  page_limit: "Choose a PDF with 40 pages or fewer.",
  text_limit:
    "This PDF contains too much text. Upload a shorter brand guideline document.",
  no_text:
    "No readable text was found. Upload a text-based PDF or paste your brand voice below; scanned pages are not supported yet.",
  invalid: "This PDF could not be read. Export a new PDF and try again.",
  timeout: "This PDF took too long to read. Try a smaller or simpler document.",
};
export function decodeBrandPdf(base64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a valid PDF file.",
    });
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > BRAND_PDF_MAX_BYTES)
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "PDFs must be 8 MB or smaller.",
    });
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The file does not contain a valid PDF.",
    });
  return bytes;
}
export async function extractBrandPdf(
  base64: string,
  organizationId: number
): Promise<{ text: string; pages: number }> {
  const bytes = decodeBrandPdf(base64);
  if (active.has(organizationId) || active.size >= 1)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "A PDF is already being read. Please try again shortly.",
    });
  active.add(organizationId);
  let worker: Worker | undefined;
  try {
    return await new Promise((resolve, reject) => {
      worker = new Worker(new URL("./brandPdfWorker.mjs", import.meta.url), {
        workerData: {
          bytes: new Uint8Array(bytes),
          maxPages: BRAND_PDF_MAX_PAGES,
          maxText: BRAND_PDF_MAX_TEXT,
        },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
        },
        stdout: true,
        stderr: true,
      });
      // Parser diagnostics must not echo document content into application logs.
      worker.stdout.resume();
      worker.stderr.resume();
      const fail = (code: string) =>
        reject(
          new TRPCError({
            code: "BAD_REQUEST",
            message: errors[code] ?? errors.invalid,
          })
        );
      const timeout = setTimeout(() => fail("timeout"), 20_000);
      const clear = () => clearTimeout(timeout);
      worker.once("message", result => {
        clear();
        if (result.error) fail(result.error);
        else if (
          typeof result.text === "string" &&
          result.text.length <= BRAND_PDF_MAX_TEXT &&
          Number.isInteger(result.pages)
        )
          resolve(result);
        else fail("invalid");
      });
      worker.once("error", () => {
        clear();
        fail("invalid");
      });
      worker.once("exit", () => {
        clear();
        fail("invalid");
      });
    });
  } finally {
    await worker?.terminate();
    active.delete(organizationId);
  }
}
