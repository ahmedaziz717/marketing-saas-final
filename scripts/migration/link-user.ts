import 'dotenv/config';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../../drizzle/schema';
import { closeDb, getDb } from '../../server/db';
import { storageClient } from '../../server/storage';

async function main() {
  const id = z.coerce.number().int().positive().parse(process.argv[2]);
  const authId = z.uuid().parse(process.argv[3]);
  const db = await getDb();
  if (!db) throw new Error('Target database unavailable');
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const { data, error } = await storageClient().auth.admin.getUserById(authId);
  if (error || !user?.email || !data.user?.email_confirmed_at || !data.user.email || user.email.trim().toLowerCase() !== data.user.email.trim().toLowerCase()) throw new Error('Verified email and existing account do not match');
  if (user.authUserId && user.authUserId !== authId) throw new Error('Account is already linked');
  if (!process.argv.includes('--apply')) return void console.log(JSON.stringify({ dryRun: true, userId: id, verifiedMatch: true }));
  if (!user.authUserId) {
    const linked = await db.update(users).set({ authUserId: authId }).where(and(eq(users.id, id), isNull(users.authUserId))).returning({ id: users.id });
    if (!linked.length) throw new Error('Account changed during linking');
  }
  console.log(JSON.stringify({ linkedUserId: id, rolePreserved: true }));
}
main().catch(() => { console.error('Account mapping failed. Verify the existing ID and confirmed Supabase identity; no roles were changed.'); process.exitCode = 1; }).finally(closeDb);
