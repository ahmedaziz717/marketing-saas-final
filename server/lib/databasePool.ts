/** Each web/worker process owns a pool, including both instances during deploys. */
export function databasePoolOptions(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.DATABASE_POOL_SIZE?.trim();
  const max = raw ? Number(raw) : 3;
  if (!Number.isInteger(max) || max < 1 || max > 50)
    throw new Error("DATABASE_POOL_SIZE must be an integer from 1 to 50.");
  return {
    prepare: false,
    max,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 30 * 60,
  } as const;
}
