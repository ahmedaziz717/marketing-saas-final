import { processHistoryPage } from "./lib/optimizationIngestion";
import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { getDb, closeDb } from "./db";
import {
  processNextBuilderJob,
  recoverInterruptedJobs,
} from "./jobs/creativeWorker";

import { publicationTick } from "./lib/publications";
import { processNextWebsiteJob } from "./jobs/catalogWorker";
import { processNextStoreJob } from "./jobs/storeWorker";
import { processNextVideoJob, videoWorkerHeartbeat, refreshFailedVideoDiagnostic } from "./jobs/videoWorker";
import { processNextWorkflowRun } from "./jobs/workflowWorker";

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Worker requires PostgreSQL");
  console.info('Publishing worker readiness', { liveSocialEnabled: process.env.LIVE_SOCIAL_ACTIONS_ENABLED === 'true', liveAdsEnabled: process.env.LIVE_AD_ACTIONS_ENABLED === 'true' });
  let lastRecovery = 0;
  const intelligenceLoop = (async () => {
    while (!stopping) {
      try { await processHistoryPage(db); } catch { console.error("Optimization history iteration failed"); }
      await setTimeout(1500);
    }
  })();
  const workflowLoop = (async () => {
    while (!stopping) {
      try { await processNextWorkflowRun(db); } catch { console.error("Creative workflow worker iteration failed"); }
      await setTimeout(1500);
    }
  })();
  const videoHeartbeatLoop = (async () => {
    while (!stopping) {
      try { await videoWorkerHeartbeat(db); } catch { console.error("Video worker heartbeat failed"); }
      await setTimeout(10000);
    }
  })();
  const videoLoop = (async () => {
    let lastDiagnosticCheck = 0;
    while (!stopping) {
      try { await processNextVideoJob(db); } catch { console.error("Video worker iteration failed"); }
      if (Date.now() - lastDiagnosticCheck > 60000) {
        lastDiagnosticCheck = Date.now();
        try { await refreshFailedVideoDiagnostic(db); } catch { console.error("Video diagnostic refresh failed"); }
      }
      await setTimeout(2000);
    }
  })();
  const publishingLoop = (async () => {
    while (!stopping) {
      try { await publicationTick(db); } catch { console.error("Publishing worker iteration failed"); }
      await setTimeout(15000);
    }
  })();
  const catalogLoop = (async () => {
    while (!stopping) {
      try {
        await processNextWebsiteJob(db);
        await processNextStoreJob(db);
      } catch {
        console.error("Catalog worker iteration failed");
      }
      await setTimeout(1000);
    }
  })();
  while (!stopping) {
    try {
      // Staging starts paused. Enabling it is a deliberate configuration change.
      if (process.env.CREATIVE_WORKER_ENABLED !== "true") {
        await setTimeout(5000);
        continue;
      }
      if (Date.now() - lastRecovery > 60_000) {
        await recoverInterruptedJobs(db);
        lastRecovery = Date.now();
      }
      if (!(await processNextBuilderJob(db))) await setTimeout(2000);
    } catch {
      console.error("Creative worker iteration failed");
      await setTimeout(5000);
    }
  }
  await Promise.all([intelligenceLoop, catalogLoop, publishingLoop, videoLoop, videoHeartbeatLoop, workflowLoop]);
  await closeDb();
}

main().catch(async () => {
  console.error("Creative worker startup failed");
  await closeDb();
  process.exitCode = 1;
});
