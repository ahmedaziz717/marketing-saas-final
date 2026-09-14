import { createServerClient } from '@supabase/ssr';
import { parse } from 'cookie';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { users, type User } from '../../drizzle/schema';
import { getDb } from '../db';

export function authConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Customer authentication is not configured');
  return { url, key };
}

export function authClient(req: Request, res: Response) {
  const { url, key } = authConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => Object.entries(parse(req.headers.cookie || '')).map(([name, value]) => ({ name, value: value || '' })),
      setAll: cookies => {
        res.setHeader('Cache-Control', 'private, no-store');
        for (const { name, value, options } of cookies) {
          res.cookie(name, value, {
            ...options,
            maxAge: options.maxAge === undefined ? undefined : options.maxAge * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
          });
        }
      },
    },
  });
}

// Only a server-verified Supabase identity may select an application account.
// Never link imported users by an unverified email or trust user_metadata roles.
export async function resolveAuthUser(identity: {
  id: string; email?: string; email_confirmed_at?: string;
}) {
  if (!identity.email || !identity.email_confirmed_at) return null;
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const existing = await db.select().from(users).where(eq(users.authUserId, identity.id)).limit(1);
  if (existing[0]) return existing[0];
  // Existing accounts are mapped explicitly during migration. Avoid accidentally
  // creating a second workspace for someone whose old account is not mapped yet.
  const imported = await db.select({ id: users.id, authUserId: users.authUserId }).from(users)
    .where(sql`lower(${users.email}) = ${identity.email.trim().toLowerCase()}`).limit(1);
  if (imported[0]) throw new Error('Account migration mapping required');
  await db.insert(users).values({
    authUserId: identity.id, openId: `supabase:${identity.id}`,
    email: identity.email, loginMethod: 'email',
    role: identity.id === process.env.SUPABASE_OWNER_USER_ID ? 'admin' : 'user',
    lastSignedIn: new Date(),
  }).onConflictDoNothing({ target: users.authUserId });
  return (await db.select().from(users).where(eq(users.authUserId, identity.id)).limit(1))[0] || null;
}

const requestUsers = new WeakMap<Request, Promise<User | null>>();
export function authenticateRequest(req: Request, res: Response): Promise<User | null> {
  let pending = requestUsers.get(req);
  if (!pending) {
    pending = (async () => {
      if (!req.headers.cookie?.includes('sb-')) return null;
      const { data, error } = await authClient(req, res).auth.getUser();
      if (error || !data.user) return null;
      return resolveAuthUser(data.user);
    })();
    requestUsers.set(req, pending);
  }
  return pending;
}
