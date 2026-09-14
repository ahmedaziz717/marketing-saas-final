import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(new URLSearchParams(location.search).has('error') ? 'That sign-in link could not be used. Please request a new one.' : '');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(sent ? '/api/auth/verify' : '/api/auth/email', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, returnTo: new URLSearchParams(location.search).get('next') || '/app' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign-in could not be completed.');
      if (result.redirectTo) window.location.assign(result.redirectTo);
      else setSent(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-background flex items-center justify-center p-6">
    <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
      <a href="/" className="text-lg font-semibold tracking-tight">Frame</a>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">{sent ? 'Check your email' : 'Welcome to Frame'}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{sent ? `Use the sign-in link or enter the code sent to ${email}.` : 'Sign in with your work email to access your company’s creative workspace.'}</p>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        {!sent ? <div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></div>
          : <div className="space-y-2"><Label htmlFor="code">Email code</Label><Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={token} onChange={e => setToken(e.target.value)} required disabled={busy} /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Sign in' : 'Email me a sign-in link'}</Button>
        {sent && <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { setSent(false); setToken(''); }}>Use another email or request a new link</Button>}
      </form>
    </section>
  </main>;
}
