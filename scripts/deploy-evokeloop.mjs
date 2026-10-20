import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

export const releaseServices = {
  workspace: "tea-dak3afe743jc73fqgsv0",
  web: "srv-dalf9vu7bikc7384etp0",
  worker: "srv-dalfa0e7bikc7384evf0",
  branch: "codex/render-supabase-migration",
  repo: "https://github.com/ahmedaziz717/marketing-saas-final",
  health: "https://app.evokeloop.com/healthz",
};
const pending = new Set([
  "created",
  "queued",
  "build_in_progress",
  "pre_deploy_in_progress",
  "update_in_progress",
]);

/** Called only after the release commit has passed CI. Never retries a deploy POST. */
export async function deployRelease(
  commit,
  { api, health, wait = pause, log = console.log }
) {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("An exact verified release SHA is required.");
  const services = [];
  for (const id of [releaseServices.web, releaseServices.worker]) {
    const service = await api(`/services/${id}`);
    if (
      service.ownerId !== releaseServices.workspace ||
      service.branch !== releaseServices.branch ||
      service.repo?.replace(/\.git$/, "") !== releaseServices.repo
    )
      throw new Error(
        `Service ${id} does not match the authorized EvokeLoop release target.`
      );
    if (service.autoDeploy === "yes")
      throw new Error(
        "Sequential releases require service autodeploy to be off."
      );
    const recent = await api(`/services/${id}/deploys?limit=20`);
    if (recent.some(entry => pending.has((entry.deploy ?? entry).status)))
      throw new Error(`Service ${id} already has an active deployment.`);
    services.push(service);
  }
  async function deploy(id) {
    const started = await api(`/services/${id}/deploys`, {
      commitId: commit,
      clearCache: "do_not_clear",
    });
    if (!started.id)
      throw new Error(
        "Render did not return a deploy ID. Inspect Render before retrying."
      );
    log(`Started ${id}: ${started.id}`);
    for (let attempt = 0; attempt < 240; attempt++) {
      const current = await api(`/services/${id}/deploys/${started.id}`);
      if (current.commit?.id !== commit)
        throw new Error("Render returned a different release commit.");
      if (current.status === "live") return current;
      if (!pending.has(current.status))
        throw new Error(`Deploy ${started.id} stopped: ${current.status}`);
      await wait(10000);
    }
    throw new Error(
      "Deploy confirmation timed out. Inspect Render before continuing."
    );
  }
  async function healthy() {
    const status = await health();
    if (!status.ok || status.commit !== commit)
      throw new Error(
        "Web health or release commit check failed; worker deployment is blocked."
      );
  }
  const web = await deploy(releaseServices.web);
  await healthy();
  // Render keeps the old web process for 60s, then allows its shutdown delay.
  const drainSeconds =
    60 +
    (services[0].serviceDetails?.maxShutdownDelaySeconds ??
      services[0].maxShutdownDelaySeconds ??
      30) +
    30;
  for (let elapsed = 0; elapsed < drainSeconds; elapsed += 15) {
    await wait(15000);
    await healthy();
  }
  const latest = await api(`/services/${releaseServices.web}/deploys?limit=1`);
  const latestWeb = latest[0]?.deploy ?? latest[0];
  if (latestWeb?.id !== web.id || latestWeb?.status !== "live")
    throw new Error(
      "Another web release started; worker deployment is blocked."
    );
  const worker = await deploy(releaseServices.worker);
  await healthy();
  log(`Release ${commit} is live on web and worker.`);
  return { web: web.id, worker: worker.id, commit };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const key = process.env.RENDER_API_KEY;
  if (!key)
    throw new Error(
      "RENDER_API_KEY is required. Supply it through your secret manager."
    );
  const commit = process.argv[2];
  if (process.env.CI && process.env.VERIFIED_RELEASE_SHA !== commit)
    throw new Error("CI must pass the verified release SHA.");
  try {
    await deployRelease(commit, {
      api: async (path, body) => {
        const response = await fetch(`https://api.render.com/v1${path}`, {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30000),
          redirect: "error",
        });
        if (!response.ok)
          throw new Error(
            `Render API returned HTTP ${response.status}; inspect the service before retrying.`
          );
        return response.json();
      },
      health: async () => {
        const response = await fetch(releaseServices.health, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        if (!response.ok)
          throw new Error(
            "Web health check failed; worker deployment is blocked."
          );
        return response.json();
      },
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
