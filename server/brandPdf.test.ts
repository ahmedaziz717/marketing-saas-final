import { expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { decodeBrandPdf, extractBrandPdf } from "./lib/brandPdf";
import {
  brandVoiceSchema,
  brandPdfInput,
  BRAND_PDF_MAX_BYTES,
} from "../shared/brandGuidelines";
function pdf(
  text: string,
  options: PDFKit.PDFDocumentOptions = {},
  pages = 1
): Promise<string> {
  return new Promise(resolve => {
    const doc = new PDFDocument(options),
      chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    for (let i = 0; i < pages; i++) {
      if (i) doc.addPage();
      if (text) doc.text(text);
    }
    doc.end();
  });
}
it("extracts text from PDF pages for review without applying brand changes", async () => {
  const result = await extractBrandPdf(
    await pdf("Voice: clear, practical and welcoming.", {}, 2),
    1
  );
  expect(result.pages).toBe(2);
  expect(result.text).toContain("Voice: clear, practical and welcoming.");
});
it("rejects encrypted, scanned, malformed and excessive-page PDFs with useful errors", async () => {
  await expect(
    extractBrandPdf(await pdf("Private", { userPassword: "secret" }), 1)
  ).rejects.toThrow(/password/);
  await expect(extractBrandPdf(await pdf(""), 1)).rejects.toThrow(
    /text-based PDF/
  );
  await expect(
    extractBrandPdf(Buffer.from("%PDF-broken").toString("base64"), 1)
  ).rejects.toThrow(/could not be read/);
  await expect(extractBrandPdf(await pdf("Voice", {}, 41), 1)).rejects.toThrow(
    /40 pages/
  );
});
it("checks content signature, encoding and decoded byte count before parsing", () => {
  expect(() =>
    decodeBrandPdf(Buffer.from("<html>not a pdf</html>").toString("base64"))
  ).toThrow(/valid PDF/);
  expect(() => decodeBrandPdf("!!!!!===")).toThrow(/valid PDF/);
  expect(() =>
    decodeBrandPdf(Buffer.alloc(BRAND_PDF_MAX_BYTES + 1).toString("base64"))
  ).toThrow(/8 MB/);
  expect(
    brandPdfInput.safeParse({
      organizationId: 1,
      name: "x.pdf",
      mimeType: "text/html",
      base64: "JVBERi0=",
    }).success
  ).toBe(false);
});
it("accepts long brand briefs and rejects over-limit values with a useful message", () => {
  expect(brandVoiceSchema.parse("x".repeat(30000))).toHaveLength(30000);
  expect(() => brandVoiceSchema.parse("x".repeat(30001))).toThrow(/30,000/);
});
