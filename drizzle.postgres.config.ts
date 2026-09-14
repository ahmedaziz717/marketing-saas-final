import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (url && !/^postgres(?:ql)?:\/\//.test(url)) throw new Error('PostgreSQL migration URL required');

export default defineConfig({
  schema: './drizzle/schema.ts', out: './drizzle/postgres', dialect: 'postgresql',
  schemaFilter: ['app_private'],
  dbCredentials: { url: url || 'postgresql://localhost/frame_unconfigured' },
});
