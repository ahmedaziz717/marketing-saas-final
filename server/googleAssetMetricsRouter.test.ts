import { beforeEach, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const f = vi.hoisted(() => ({ role: vi.fn(), read: vi.fn(), db: {} }));
vi.mock("./lib/access", () => ({
  requireOrganizationRole: (...args: unknown[]) => f.role(...args),
}));
vi.mock("./lib/assetLibrary", async original => ({
  ...(await original<any>()),
  libraryDatabase: async () => f.db,
}));
vi.mock("./lib/googleAssetMetrics", () => ({
  googleAssetMetrics: (...args: unknown[]) => f.read(...args),
}));
import { googleCampaignsRouter } from "./routers/googleCampaigns";
const input = {
  organizationId: 3,
  connectionId: "00000000-0000-4000-8000-000000000001",
  campaignId: "11",
  assetGroupId: "22",
};
const caller = (user: any = { id: 9 }) =>
  googleCampaignsRouter.createCaller({ user, req: {} as any, res: {} as any });
beforeEach(() => {
  f.role.mockReset();
  f.read.mockReset();
  f.read.mockResolvedValue({ status: "available", rows: [] });
});
it("requires workspace membership before loading metrics and defaults to30complete days", async () => {
  await caller().assetMetrics(input);
  expect(f.role).toHaveBeenCalledWith(9, 3);
  expect(f.read).toHaveBeenCalledWith(
    f.db,
    3,
    input.connectionId,
    "11",
    "22",
    30
  );
});
it("denies unauthenticated and nonmember reads without querying Google", async () => {
  await expect(caller(null).assetMetrics(input)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  f.role.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
  await expect(caller().assetMetrics(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(f.read).not.toHaveBeenCalled();
});
it("validates report periods and destination IDs", async () => {
  await expect(
    caller().assetMetrics({ ...input, days: 1000 as any })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller().assetMetrics({ ...input, assetGroupId: "22 OR TRUE" })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(f.read).not.toHaveBeenCalled();
});
