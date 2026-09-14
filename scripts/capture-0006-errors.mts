import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is unavailable");
const connection = await mysql.createConnection(databaseUrl);

for (const check of [
  { name: "creativeBuilder.options", sql: "SELECT `creativeSetup` FROM `campaign_briefs` LIMIT 1" },
  { name: "creatives.overview", sql: "SELECT `leaseExpiresAtMs` FROM `creative_jobs` LIMIT 1" },
]) {
  try {
    await connection.query(check.sql);
    console.log(JSON.stringify({ check: check.name, ok: true }));
  } catch (error) {
    const dbError = error as { code?: string; errno?: number; sqlState?: string; sqlMessage?: string };
    console.log(JSON.stringify({
      check: check.name,
      ok: false,
      code: dbError.code,
      errno: dbError.errno,
      sqlState: dbError.sqlState,
      message: dbError.sqlMessage,
    }));
  }
}

await connection.end();
