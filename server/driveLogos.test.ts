import { expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ text: vi.fn(), file: vi.fn() }));
vi.mock("./lib/websiteCrawler", () => ({
  safeFetchText: mocked.text,
  safeFetchDriveFile: mocked.file,
}));
import {
  driveReference,
  driveLogoCandidates,
  discoverDriveLogos,
  fetchDriveLogo,
} from "./lib/driveLogos";
import { normalizeBrandLogo } from "./lib/brandLogoImport";
it("accepts only supported public Drive links and keeps resource keys", () => {
  expect(
    driveReference(
      "https://drive.google.com/file/d/abcdefghijklmnop/view?resourcekey=0-secret"
    )
  ).toMatchObject({
    kind: "file",
    downloadUrl:
      "https://drive.google.com/uc?export=download&id=abcdefghijklmnop&resourcekey=0-secret",
  });
  for (const value of [
    "https://drive.google.com.attacker.example/file/d/abcdefghijklmnop/view",
    "http://drive.google.com/file/d/abcdefghijklmnop/view",
    "https://drive.google.com/evil?id=abcdefghijklmnop",
  ])
    expect(() => driveReference(value)).toThrow();
});
it("scans direct image files without following subfolders or unrelated links", async () => {
  const html =
    '<a href="https://drive.google.com/file/d/abcdefghijklmnop/view"><div class="flip-entry-title">Brand logo.png</div></a><a href="https://drive.google.com/file/d/abcdefghijklmnop/view">Brand logo.png</a><a href="https://drive.google.com/file/d/qrstuvwxyz123456/view">Notes.pdf</a><a href="https://drive.google.com/drive/folders/123456abcdefghijkl">More logos</a><a href="https://attacker.example/logo.png">Bad logo.png</a>';
  expect(driveLogoCandidates(html)).toHaveLength(1);
  mocked.text.mockResolvedValue({ status: 200, text: html });
  expect(
    await discoverDriveLogos(
      "https://drive.google.com/drive/folders/123456abcdefghijkl"
    )
  ).toHaveLength(1);
  expect(mocked.text).toHaveBeenCalledTimes(1);
});
it("does not import sign-in pages or SVG external references disguised as raster images", async () => {
  mocked.file.mockResolvedValue({
    data: Buffer.from("<html>Sign in</html>"),
    contentType: "text/html",
  });
  await expect(
    fetchDriveLogo("https://drive.google.com/file/d/abcdefghijklmnop/view")
  ).rejects.toThrow(/accessible image/);
  await expect(
    normalizeBrandLogo(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>'
      ),
      "image/png"
    )
  ).rejects.toThrow(/external/);
});
