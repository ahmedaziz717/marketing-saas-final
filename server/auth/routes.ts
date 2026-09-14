import type { Express, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authClient, resolveAuthUser } from './supabase';

export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?!\/)[^\\\x00-\x20]*$/.test(value) ? value : '/app';
}

export const requireSameOrigin: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!process.env.APP_ORIGIN || req.headers.origin !== process.env.APP_ORIGIN) {
    res.status(403).json({ error: 'Request origin is not permitted.' });
    return;
  }
  next();
};

export function registerAuthRoutes(app: Express) {
  const limiter = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/api/auth/email', limiter(), async (req, res) => {
    const input = z.object({ email: z.email(), returnTo: z.string().optional() }).safeParse(req.body);
    if (!input.success) return void res.status(400).json({ error: 'Enter a valid email address.' });
    try {
      const returnTo = safeReturnPath(input.data.returnTo);
      const callback = new URL('/api/auth/callback', process.env.APP_ORIGIN);
      callback.searchParams.set('next', returnTo);
      const { error } = await authClient(req, res).auth.signInWithOtp({
        email: input.data.email.trim().toLowerCase(),
        options: { shouldCreateUser: process.env.AUTH_SIGNUP_ENABLED === 'true', emailRedirectTo: callback.toString() },
      });
      // Do not reveal whether an address already has an account.
      if (error) console.warn('Sign-in email request was not accepted');
      res.set('Cache-Control', 'no-store').json({ success: true });
    } catch {
      res.status(503).json({ error: 'Sign-in is temporarily unavailable. Please try again.' });
    }
  });
  app.post('/api/auth/verify', limiter(), async (req, res) => {
    const input = z.object({ email: z.email(), token: z.string().regex(/^\d{6,10}$/), returnTo: z.string().optional() }).safeParse(req.body);
    if (!input.success) return void res.status(400).json({ error: 'Enter the code from your email.' });
    try {
      const client = authClient(req, res);
      const { data, error } = await client.auth.verifyOtp({ email: input.data.email.trim().toLowerCase(), token: input.data.token, type: 'email' });
      if (error || !data.user) return void res.status(401).json({ error: 'That code is invalid or has expired.' });
      if (!await resolveAuthUser(data.user)) throw new Error('Unverified account');
      res.set('Cache-Control', 'no-store').json({ redirectTo: safeReturnPath(input.data.returnTo) });
    } catch {
      res.status(503).json({ error: 'Your account is not ready. Please contact support.' });
    }
  });
  app.get('/api/auth/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (typeof req.query.code !== 'string') throw new Error('Missing code');
      const { data, error } = await authClient(req, res).auth.exchangeCodeForSession(req.query.code);
      if (error || !data.user || !await resolveAuthUser(data.user)) throw new Error('Invalid session');
      res.redirect(safeReturnPath(req.query.next));
    } catch {
      res.redirect('/login?error=signin');
    }
  });
}
