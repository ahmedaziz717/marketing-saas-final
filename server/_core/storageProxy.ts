import type { Express, RequestHandler } from 'express';
import { and, eq } from 'drizzle-orm';
import { brandAssets, productImages, creativeVariants, organizationMemberships } from '../../drizzle/schema';
import { authenticateRequest } from '../auth/supabase';
import { getDb } from '../db';
import { normalizeStorageKey, storageGetSignedUrl } from '../storage';

export async function canReadAsset(userId: number, key: string) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const owners = [
    ...await db.select({ organizationId: brandAssets.organizationId }).from(brandAssets).where(eq(brandAssets.storageKey, key)),
    ...await db.select({ organizationId: productImages.organizationId }).from(productImages).where(eq(productImages.storageKey, key)),
    ...await db.select({ organizationId: creativeVariants.organizationId }).from(creativeVariants).where(eq(creativeVariants.imageStorageKey, key)),
  ];
  for (const { organizationId } of owners) {
    const membership = await db.select({ id: organizationMemberships.id }).from(organizationMemberships).where(and(
      eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, 'active'),
    )).limit(1);
    if (membership[0]) return true;
  }
  return false;
}

export function registerStorageProxy(app: Express) {
  const read: RequestHandler = async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const user = await authenticateRequest(req, res);
      if (!user) return void res.status(401).send('Sign in to view this asset.');
      const key = normalizeStorageKey((req.params as Record<string, string>)[0]);
      if (!await canReadAsset(user.id, key)) return void res.status(404).send('Asset not found.');
      res.redirect(307, await storageGetSignedUrl(key));
    } catch { res.status(503).send('Asset temporarily unavailable.'); }
  };
  // Vite owns /assets/ for public application bundles; private media is separate.
  app.get('/media/*', read);
  // Preserve historical URLs without changing audit hashes or snapshots.
  app.get('/manus-storage/*', read);
}
