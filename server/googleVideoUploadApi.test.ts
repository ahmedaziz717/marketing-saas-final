import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uploadGoogleVideo } from "./lib/googleVideoUploadApi";
const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "test");
  vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "test");
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "test");
  vi.stubEnv("APP_ORIGIN", "https://app.example.com");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses a resumable, unlisted upload with disclosure and returns the account-bound resource", async () => {
  fetcher
    .mockResolvedValueOnce(
      new Response("", {
        headers: {
          "x-goog-upload-url":
            "https://googleads.googleapis.com/upload/session",
        },
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        resourceName: "customers/1234567890/youTubeVideoUploads/42",
      })
    );
  expect(
    await uploadGoogleVideo(
      "token",
      "1234567890",
      "<Clip>",
      Buffer.from("video"),
      true
    )
  ).toBe("customers/1234567890/youTubeVideoUploads/42");
  const metadata = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(metadata.youTubeVideoUpload).toMatchObject({
    videoTitle: "Clip",
    videoPrivacy: "UNLISTED",
    videoContentMetadata: { generativeContentDisclosure: "GENERATIVE_CONTENT" },
  });
  expect(fetcher.mock.calls[1][1].method).toBe("PUT");
  expect(fetcher.mock.calls[1][1].headers["X-Goog-Upload-Command"]).toBe(
    "upload, finalize"
  );
});
it.each([
  "https://evil.example/upload",
  "http://googleads.googleapis.com/upload",
  "https://googleads.googleapis.com.evil.example/upload",
])(
  "rejects an unsafe provider upload URL %s without sending bytes",
  async url => {
    fetcher.mockResolvedValueOnce(
      new Response("", { headers: { "x-goog-upload-url": url } })
    );
    await expect(
      uploadGoogleVideo(
        "token",
        "1234567890",
        "Clip",
        Buffer.from("video"),
        false
      )
    ).rejects.toMatchObject({ uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
);
it("treats missing or wrong-account final confirmation as uncertain", async () => {
  fetcher
    .mockResolvedValueOnce(
      new Response("", {
        headers: {
          "x-goog-upload-url":
            "https://googleads.googleapis.com/upload/session",
        },
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        resourceName: "customers/9999999999/youTubeVideoUploads/42",
      })
    );
  await expect(
    uploadGoogleVideo(
      "token",
      "1234567890",
      "Clip",
      Buffer.from("video"),
      false
    )
  ).rejects.toMatchObject({ uncertain: true });
});
