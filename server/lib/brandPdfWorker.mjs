import { parentPort, workerData } from "node:worker_threads";

// Text extraction only: no rendering, script execution, embedded files or URL loading.
let task;
try {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  task = getDocument({
    data: workerData.bytes,
    isEvalSupported: false,
    useWorkerFetch: false,
    useSystemFonts: false,
    disableFontFace: true,
    disableAutoFetch: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  const pdf = await task.promise;
  if (pdf.numPages > workerData.maxPages) throw new Error("page_limit");
  const pages = [];
  let length = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const stream = page.streamTextContent();
    const reader = stream.getReader();
    let text = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const item of value.items) {
        if (!("str" in item)) continue;
        const part = item.str + (item.hasEOL ? "\n" : " ");
        length += part.length;
        if (length > workerData.maxText) throw new Error("text_limit");
        text += part;
      }
    }
    pages.push(
      text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim()
    );
    page.cleanup();
  }
  const text = pages.filter(Boolean).join("\n\n");
  if (!text) throw new Error("no_text");
  parentPort.postMessage({ text, pages: pdf.numPages });
} catch (error) {
  const code =
    error?.name === "PasswordException"
      ? "password"
      : ["page_limit", "text_limit", "no_text"].includes(error?.message)
        ? error.message
        : "invalid";
  parentPort.postMessage({ error: code });
} finally {
  await task?.destroy();
}
