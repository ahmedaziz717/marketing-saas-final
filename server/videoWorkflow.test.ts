import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  submit: vi.fn(),
  poll: vi.fn(),
  cancel: vi.fn(),
  download: vi.fn(),
  signed: vi.fn(),
  upload: vi.fn(),
  storedVideo: "",
}));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  closeDb: async () => {},
}));
vi.mock("./lib/higgsfield", async original => ({
  ...(await original<typeof import("./lib/higgsfield")>()),
  submitHiggsfield: (...args: any[]) => state.submit(...args),
  pollHiggsfield: (...args: any[]) => state.poll(...args),
  cancelHiggsfield: (...args: any[]) => state.cancel(...args),
  downloadVideo: (...args: any[]) => state.download(...args),
}));
vi.mock("./storage", async original => ({
  ...(await original<typeof import("./storage")>()),
  storageClient: () => ({
    storage: {
      from: () => ({ createSignedUrl: state.signed, upload: state.upload }),
    },
  }),
  storageGetBase64: async () => state.storedVideo,
}));
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  organizations,
  organizationMemberships,
  users,
  brandAssets,
  brandKits,
} from "../drizzle/schema";
import { videoJobs, providerWorkers } from "../drizzle/videoSchema";
import {
  aiUsage,
  creditLedger,
  platformAccounts,
  platformTiers,
} from "../drizzle/platformSchema";
import {
  defaultVideoSetup,
  videoRequestBody,
  videoSetupProblem,
  type VideoSetup,
} from "../shared/videoCreation";
import { processNextVideoJob, videoWorkerHeartbeat } from "./jobs/videoWorker";
import { HiggsfieldError, requestUrl } from "./lib/higgsfield";
import { mp4Info } from "./lib/videoMedia";
import { defaultVideoRates, videoQuote } from "./lib/videoPricing";
let engine: PGlite,
  org: number,
  otherOrg: number,
  ownerId: number,
  imageId: number,
  videoId: number,
  foreignId: number;
let owner: ReturnType<typeof appRouter.createCaller>,
  outsider: typeof owner,
  reviewer: typeof owner;
const setup = (): VideoSetup => ({
  ...defaultVideoSetup,
  title: "Product orbit",
  prompt: "Orbit around Image 1",
  imageKeys: [`asset:${imageId}`],
});
function sampleMp4(seconds = 5) {
  const box = (name: string, body: Buffer) => {
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(out.length);
    out.write(name, 4);
    body.copy(out, 8);
    return out;
  };
  const timing = Buffer.alloc(100);
  timing.writeUInt32BE(1000, 12);
  timing.writeUInt32BE(seconds * 1000, 16);
  const track = Buffer.alloc(84);
  track.writeUInt32BE(1280 * 65536, 76);
  track.writeUInt32BE(720 * 65536, 80);
  return Buffer.concat([
    box("ftyp", Buffer.from("isom0000isom")),
    box(
      "moov",
      Buffer.concat([box("mvhd", timing), box("trak", box("tkhd", track))])
    ),
  ]);
}
beforeAll(async () => {
  vi.stubEnv("HF_API_KEY", "isolated-test-credential");
  vi.stubEnv("VIDEO_GENERATION_ENABLED", "true");
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(file => file.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  state.db = drizzle(engine);
  const db = state.db,
    now = Date.now();
  const people = await db
    .insert(users)
    .values(
      ["owner", "outsider", "reviewer"].map(name => ({
        openId: `video-${name}`,
        name,
      }))
    )
    .returning();
  ownerId = people[0].id;
  [owner, outsider, reviewer] = people.map((user: any) =>
    appRouter.createCaller({ user, req: {}, res: {} } as TrpcContext)
  );
  const orgs = await db
    .insert(organizations)
    .values(
      ["video-main", "video-other"].map(slug => ({
        slug,
        name: slug,
        createdByUserId: ownerId,
        createdAtMs: now,
      }))
    )
    .returning();
  org = orgs[0].id;
  otherOrg = orgs[1].id;
  await db
    .insert(organizationMemberships)
    .values(
      people.map((user: any, i: number) => ({
        userId: user.id,
        organizationId: i === 1 ? otherOrg : org,
        role: i === 2 ? "reviewer" : "owner",
        status: "active",
        createdAtMs: now,
      }))
    );
  for (const organizationId of [org, otherOrg]) {
    const [kit] = await db
      .insert(brandKits)
      .values({
        organizationId,
        name: "Video brand",
        colors: [],
        fonts: [],
        status: "active",
        updatedByUserId: ownerId,
        updatedAtMs: now,
      })
      .returning();
    const [asset] = await db
      .insert(brandAssets)
      .values({
        organizationId,
        brandKitId: kit.id,
        name: "Reference image",
        type: "product",
        storageKey: `org-${organizationId}/reference.png`,
        url: "/media/reference.png",
        mimeType: "image/png",
        status: "approved",
        uploadedByUserId: ownerId,
        createdAtMs: now,
      })
      .returning();
    if (organizationId === org) {
      imageId = asset.id;
      const [video] = await db
        .insert(brandAssets)
        .values({
          organizationId,
          brandKitId: kit.id,
          name: "Source clip",
          type: "reference",
          storageKey: `org-${organizationId}/reference.mp4`,
          url: "/media/reference.mp4",
          mimeType: "video/mp4",
          status: "approved",
          metadata: { durationSeconds: 5, width: 1280, height: 720 },
          uploadedByUserId: ownerId,
          createdAtMs: now,
        })
        .returning();
      videoId = video.id;
    } else foreignId = asset.id;
  }
  await db
    .insert(platformTiers)
    .values({
      id: "video-test",
      name: "Test",
      monthlyCredits: 10000,
      monthlyPriceMicros: 0,
      updatedAtMs: now,
    });
  await db
    .insert(platformAccounts)
    .values({
      organizationId: org,
      tierId: "video-test",
      enforceCredits: 1,
      updatedAtMs: now,
    });
});
beforeEach(async () => {
  state.submit.mockReset();
  state.poll.mockReset();
  state.cancel.mockReset();
  state.download.mockReset();
  state.upload.mockReset();
  state.signed.mockReset();
  state.signed.mockImplementation(async (key: string) => ({
    data: {
      signedUrl: `https://storage.example.test/${key}?token=frozen-signature`,
    },
    error: null,
  }));
  state.upload.mockResolvedValue({ error: null });
  state.download.mockResolvedValue(sampleMp4());
  state.storedVideo = sampleMp4().toString("base64");
  await state.db.delete(videoJobs);
  await state.db.delete(aiUsage);
  await state.db.delete(creditLedger);
  await state.db.update(platformAccounts).set({ aiPaused: 0 });
  await state.db.update(platformTiers).set({ monthlyCredits: 10000 });
  await videoWorkerHeartbeat(state.db);
});
afterAll(async () => {
  await engine.close();
  vi.unstubAllEnvs();
});
async function queued(settings = setup()) {
  const draft = await owner.video.save({
    organizationId: org,
    setup: settings,
  });
  const quote = await owner.video.quote({
    organizationId: org,
    setup: settings,
  });
  return owner.video.generate({
    organizationId: org,
    id: draft.id,
    revision: draft.revision,
    quotedCredits: quote.credits,
  });
}
async function tick() {
  await state.db.update(videoJobs).set({ nextPollAtMs: 0 });
  return processNextVideoJob(state.db);
}
const providerId = randomUUID();
const accepted = {
  request_id: providerId,
  status: "queued",
  status_url: `https://api.higgsfield.ai/requests/${providerId}/status`,
  cancel_url: `https://api.higgsfield.ai/requests/${providerId}/cancel`,
};

describe("durable video generation", () => {
  it("saves incomplete drafts without billing and enforces workspace/role boundaries", async () => {
    const draft = await owner.video.save({
      organizationId: org,
      setup: { ...setup(), prompt: "" },
    });
    expect(draft.status).toBe("draft");
    expect(await state.db.select().from(aiUsage)).toHaveLength(0);
    await expect(
      outsider.video.get({ organizationId: org, id: draft.id })
    ).rejects.toThrow("access");
    await expect(
      reviewer.video.save({ organizationId: org, setup: setup() })
    ).rejects.toThrow("role");
    await expect(
      owner.video.quote({
        organizationId: org,
        setup: { ...setup(), imageKeys: [`asset:${foreignId}`] },
      })
    ).rejects.toThrow("workspace");
  });
  it("reserves credits exactly once for duplicate generate clicks and rejects changed quotes", async () => {
    const draft = await owner.video.save({
      organizationId: org,
      setup: setup(),
    });
    await expect(
      owner.video.generate({
        organizationId: org,
        id: draft.id,
        revision: 1,
        quotedCredits: 1,
      })
    ).rejects.toThrow("price changed");
    const quote = await owner.video.quote({
      organizationId: org,
      setup: setup(),
    });
    for (let i = 0; i < 2; i++)
      await owner.video.generate({
        organizationId: org,
        id: draft.id,
        revision: 1,
        quotedCredits: quote.credits,
      });
    expect(await state.db.select().from(aiUsage)).toHaveLength(1);
    const ledger = await state.db.select().from(creditLedger);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(-235);
    expect(
      JSON.stringify(
        await owner.video.get({ organizationId: org, id: draft.id })
      )
    ).not.toContain("storageKey");
  });
  it("blocks spending without worker readiness, sufficient credits or with paused AI", async () => {
    await state.db.update(providerWorkers).set({ ready: 0 });
    await expect(queued()).rejects.toThrow("administrator setup");
    await videoWorkerHeartbeat(state.db);
    await state.db.update(platformTiers).set({ monthlyCredits: 1 });
    await expect(queued()).rejects.toThrow("235 AI credits");
    await state.db.update(platformAccounts).set({ aiPaused: 1 });
    await expect(queued()).rejects.toThrow("paused");
    expect(await state.db.select().from(aiUsage)).toHaveLength(0);
  });
  it("replays the exact signed payload and idempotency key after ambiguous acceptance, then stores one reviewable clip", async () => {
    const job = await queued();
    await tick();
    state.submit
      .mockRejectedValueOnce(new HiggsfieldError(0, true, "Timeout"))
      .mockResolvedValueOnce(accepted);
    await tick();
    await tick();
    expect(state.signed).toHaveBeenCalledTimes(1);
    expect(state.submit).toHaveBeenCalledTimes(2);
    expect(state.submit.mock.calls[0]).toEqual(state.submit.mock.calls[1]);
    expect(state.submit.mock.calls[0][2]).toBe(job.id);
    state.poll.mockResolvedValue({
      ...accepted,
      status: "completed",
      video: { url: "https://cdn.example.test/result.mp4" },
    });
    await tick();
    await tick();
    const result = await owner.video.get({ organizationId: org, id: job.id });
    expect(result.status).toBe("completed");
    expect(result.assetKey).toMatch(/^asset:/);
    const stored = (
      await owner.assetLibrary.studioList({ organizationId: org })
    ).find(asset => asset.key === result.assetKey)!;
    expect(stored).toMatchObject({
      state: "draft",
      origin: "generated",
      mediaType: "video",
      durationSeconds: 5,
      width: 1280,
      height: 720,
    });
    const [usage] = await state.db.select().from(aiUsage);
    expect(usage).toMatchObject({
      status: "succeeded",
      credits: 235,
      costMicros: 2311200,
    });
    expect(usage.usage.costBasis).toBe("published_rate_estimate");
    expect(usage.outputTokens).toBeNull();
    expect(await tick()).toBe(false);
    expect(state.upload).toHaveBeenCalledTimes(1);
    const privateRow = (await state.db.select().from(videoJobs))[0];
    expect(privateRow.requestBody).toBeNull();
    expect(privateRow.outputUrl).toBeNull();
  });
  it("cancels an unsubmitted job and refunds once", async () => {
    const job = await queued();
    await owner.video.cancel({ organizationId: org, id: job.id });
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("canceled");
    expect(await tick()).toBe(false);
    expect(state.submit).not.toHaveBeenCalled();
    const ledger = await state.db.select().from(creditLedger);
    expect(
      ledger
        .map((row: any) => row.amount)
        .reduce((a: number, b: number) => a + b, 0)
    ).toBe(0);
    await expect(
      owner.video.cancel({ organizationId: org, id: job.id })
    ).rejects.toThrow("no longer");
    expect(await state.db.select().from(creditLedger)).toHaveLength(2);
  });
  it("waits for provider confirmation before refunding cancellation", async () => {
    const job = await queued();
    await tick();
    state.submit.mockResolvedValue(accepted);
    await tick();
    await owner.video.cancel({ organizationId: org, id: job.id });
    state.poll.mockResolvedValueOnce(accepted);
    state.cancel.mockResolvedValue(null);
    await tick();
    expect(await state.db.select().from(creditLedger)).toHaveLength(1);
    state.poll.mockResolvedValueOnce({ ...accepted, status: "canceled" });
    await tick();
    expect(await state.db.select().from(creditLedger)).toHaveLength(2);
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("canceled");
  });
  it("keeps a completed provider charge when storage fails, and retries saving without another generation", async () => {
    const job = await queued();
    await tick();
    state.submit.mockResolvedValue({
      ...accepted,
      status: "completed",
      video: { url: "https://cdn.example.test/result.mp4" },
    });
    await tick();
    state.upload
      .mockResolvedValueOnce({ error: { message: "Storage down" } })
      .mockResolvedValueOnce({ error: null });
    await tick();
    expect((await state.db.select().from(aiUsage))[0].status).toBe("succeeded");
    expect(await state.db.select().from(creditLedger)).toHaveLength(1);
    await tick();
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("completed");
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(state.upload.mock.calls[0][0]).toBe(state.upload.mock.calls[1][0]);
  });
  it("recovers an expired worker lease and refunds a confirmed moderation rejection", async () => {
    const job = await queued();
    await state.db
      .update(videoJobs)
      .set({ leaseOwner: "old-worker", leaseUntilMs: Date.now() - 1 });
    await tick();
    state.submit.mockResolvedValue({ ...accepted, status: "nsfw" });
    await tick();
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("failed");
    expect((await state.db.select().from(aiUsage))[0].costMicros).toBe(0);
    expect(await state.db.select().from(creditLedger)).toHaveLength(2);
  });
  it("validates source video timing and does not send hidden settings to edit/motion endpoints", async () => {
    const edit = {
      ...setup(),
      mode: "edit" as const,
      sourceVideoKey: `asset:${videoId}`,
    };
    expect(
      (await owner.video.quote({ organizationId: org, setup: edit })).credits
    ).toBe(470);
    const request = videoRequestBody(
      edit,
      ["https://reference.test/a.png"],
      "https://reference.test/a.mp4"
    );
    expect(request).not.toHaveProperty("duration");
    expect(request).not.toHaveProperty("aspect_ratio");
    const motion = { ...edit, mode: "motion" as const };
    expect(videoRequestBody(motion, ["image"], "video")).not.toHaveProperty(
      "generate_audio"
    );
    expect(videoRequestBody(motion, ["image"], "video")).not.toHaveProperty(
      "bitrate_mode"
    );
    expect(videoSetupProblem({ ...motion, imageKeys: [] })).toContain("1–8");
    await expect(
      owner.video.quote({
        organizationId: org,
        setup: { ...edit, sourceVideoKey: `asset:${imageId}` },
      })
    ).rejects.toThrow("MP4");
  });
});

it("bounds MP4 parsing and estimates video-specific units without recording fake LLM tokens", () => {
  expect(mp4Info(sampleMp4())).toEqual({
    durationSeconds: 5,
    width: 1280,
    height: 720,
  });
  expect(() => mp4Info(Buffer.from("not a video"))).toThrow("MP4");
  const invalid = sampleMp4();
  invalid.writeUInt32BE(0xffffffff, 0);
  expect(() => mp4Info(invalid)).toThrow("container");
  const rate = defaultVideoRates.find(
    rate => rate.model === "seedance-2.5/720p"
  )!;
  expect(
    videoQuote(
      { ...defaultVideoSetup, mode: "edit", sourceVideoKey: "asset:1" },
      [
        {
          key: "asset:1",
          name: "Video",
          storageKey: "v.mp4",
          fingerprint: "x",
          mimeType: "video/mp4",
          durationSeconds: 5,
          width: 1280,
          height: 720,
        },
      ],
      rate
    ).costMicros
  ).toBe(2773440);
});
it("never forwards provider credentials to an arbitrary request URL", () => {
  expect(() =>
    requestUrl(
      `https://evil.example/requests/${providerId}/status`,
      providerId,
      "status"
    )
  ).toThrow("Invalid");
  expect(() =>
    requestUrl(
      `https://api.higgsfield.ai/requests/${providerId}/status?redirect=evil`,
      providerId,
      "status"
    )
  ).toThrow("Invalid");
  expect(() =>
    requestUrl(
      `https://api.higgsfield.ai@evil.example/requests/${providerId}/status`,
      providerId,
      "status"
    )
  ).toThrow("Invalid");
});
