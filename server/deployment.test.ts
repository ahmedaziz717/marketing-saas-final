import { expect, it, vi } from "vitest";
import { databasePoolOptions } from "./lib/databasePool";
import {
  deployRelease,
  releaseServices as s,
} from "../scripts/deploy-evokeloop.mjs";
const commit = "a".repeat(40);
function fixture() {
  const calls: Array<{ path: string; body?: unknown }> = [];
  const api = vi.fn(async (path: string, body?: unknown) => {
    calls.push({ path, body });
    if (path.endsWith("?limit=20")) return [];
    if (path.endsWith("?limit=1"))
      return [{ deploy: { id: "web-deploy", status: "live" } }];
    if (path.endsWith("/web-deploy") || path.endsWith("/worker-deploy"))
      return {
        id: path.split("/").pop(),
        status: "live",
        commit: { id: commit },
      };
    if (body)
      return { id: path.includes(s.web) ? "web-deploy" : "worker-deploy" };
    return {
      ownerId: s.workspace,
      branch: s.branch,
      repo: s.repo,
      autoDeploy: "no",
    };
  });
  return {
    api,
    calls,
    health: vi.fn(async () => ({ ok: true, commit })),
    wait: vi.fn(async () => {}),
    log: vi.fn(),
  };
}
it("leaves database headroom during overlapping instances and releases idle clients", () => {
  expect(databasePoolOptions({})).toMatchObject({
    max: 3,
    idle_timeout: 20,
    prepare: false,
  });
  expect(databasePoolOptions({ DATABASE_POOL_SIZE: "2" }).max).toBe(2);
  for (const raw of ["0", "NaN", "2.5", "10000"])
    expect(() => databasePoolOptions({ DATABASE_POOL_SIZE: raw })).toThrow(
      /integer/
    );
});
it("deploys the exact web commit, drains old connections, then starts the worker", async () => {
  const f = fixture();
  expect(await deployRelease(commit, f)).toEqual({
    web: "web-deploy",
    worker: "worker-deploy",
    commit,
  });
  expect(f.calls.filter(c => c.body).map(c => c.path)).toEqual([
    `/services/${s.web}/deploys`,
    `/services/${s.worker}/deploys`,
  ]);
  expect(f.wait).toHaveBeenCalledTimes(8);
  expect(f.health).toHaveBeenCalledTimes(10);
});
it("never starts the worker after failed web health or deploys to an unexpected workspace", async () => {
  const f = fixture();
  f.health.mockResolvedValue({ ok: false, commit });
  await expect(deployRelease(commit, f)).rejects.toThrow(/blocked/);
  expect(f.calls.some(c => c.body && c.path.includes(s.worker))).toBe(false);
  const wrong = fixture();
  wrong.api.mockResolvedValue({ ownerId: "wrong" } as any);
  await expect(deployRelease(commit, wrong)).rejects.toThrow(/authorized/);
  expect(wrong.calls.some(c => c.body)).toBe(false);
});
