import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { getDb, closeDb } from "./db";
import {
  processNextBuilderJob,
  recoverInterruptedJobs,
} from "./jobs/creativeWorker";

import { processNextWebsiteJob } from "./jobs/catalogWorker";
import { processNextStoreJob } from "./jobs/storeWorker";

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
  let lastRecovery = 0;
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
  await catalogLoop;
  await closeDb();
}

main().catch(async () => {
  console.error("Creative worker startup failed");
  await closeDb();
  process.exitCode = 1;
});
