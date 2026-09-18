import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage({
  resetPassword = false,
}: {
  resetPassword?: boolean;
}) {
  const [method, setMethod] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    new URLSearchParams(location.search).has("error")
      ? new URLSearchParams(location.search).get("error") === "expired"
        ? "This email link has expired or was already used. Request a new link below. To set your password, choose ‘Set or forgot password?’."
        : "That sign-in link could not be used. Please request a new one in this browser."
      : ""
  );
  const next = new URLSearchParams(location.search).get("next") || "/app";
  function chooseMethod(value: "password" | "link") {
    setMethod(value);
    setSent(false);
    setRecovery(false);
    setError("");
    setPassword("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (resetPassword && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const endpoint = resetPassword
        ? "/api/auth/password/update"
        : recovery
          ? "/api/auth/password/reset"
          : method === "password"
            ? "/api/auth/password"
            : "/api/auth/email";
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          ...(resetPassword || (method === "password" && !recovery)
            ? { password }
            : {}),
          returnTo: next,
        }),
      });
      const result = await response.json().catch(() => ({
        error:
          response.status === 429
            ? "Too many attempts. Please try again later."
            : "Sign-in is temporarily unavailable. Please try again.",
      }));
      if (!response.ok)
        throw new Error(result.error || "Sign-in could not be completed.");
      setPassword("");
      setConfirm("");
      if (result.redirectTo) window.location.assign(result.redirectTo);
      else setSent(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const title = resetPassword
    ? "Set your password"
    : sent
      ? "Check your email"
      : recovery
        ? "Set or reset your password"
        : "Welcome to Frame";
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <a href="/" className="text-lg font-semibold tracking-tight">
          Frame
        </a>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {resetPassword
            ? "Choose a strong password with at least 12 characters. You can still sign in with an emailed link."
            : sent
              ? recovery
                ? `If an account exists for ${email}, a password-reset link will arrive shortly. Open it in this browser.`
                : `If sign-in is available for ${email}, a sign-in link will arrive shortly. Open it in this browser. Check your spam folder too.`
              : recovery
                ? "Already use email links? Use this to add a password to the same account, or reset a forgotten password."
                : "Choose how to sign in to your creative workspace."}
        </p>
        {!resetPassword && !recovery && (
          <div
            className="mt-6 grid grid-cols-2 gap-2"
            role="group"
            aria-label="Sign-in method"
          >
            <Button
              type="button"
              variant={method === "password" ? "default" : "outline"}
              disabled={busy}
              aria-pressed={method === "password"}
              onClick={() => chooseMethod("password")}
            >
              Password
            </Button>
            <Button
              type="button"
              variant={method === "link" ? "default" : "outline"}
              disabled={busy}
              aria-pressed={method === "link"}
              onClick={() => chooseMethod("link")}
            >
              Email link
            </Button>
          </div>
        )}
        <form className="mt-7 space-y-5" onSubmit={submit}>
          {!sent && !resetPassword && (
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={busy}
              />
            </div>
          )}
          {!sent && (resetPassword || (method === "password" && !recovery)) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="password">
                  {resetPassword ? "New password" : "Password"}
                </Label>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    resetPassword ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={resetPassword ? 12 : undefined}
                  maxLength={resetPassword ? 128 : 1024}
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  className="text-xs text-primary"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
              {resetPassword && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    disabled={busy}
                  />
                </div>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!sent && (
            <Button className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : resetPassword
                  ? "Save password & continue"
                  : recovery
                    ? "Email me a password-reset link"
                    : method === "password"
                      ? "Sign in with password"
                      : "Email me a sign-in link"}
            </Button>
          )}
          {sent && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setSent(false)}
            >
              Use another email or request a new link
            </Button>
          )}
          {!resetPassword && !recovery && method === "password" && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setRecovery(true);
                setSent(false);
                setError("");
                setPassword("");
              }}
            >
              Set or forgot password?
            </Button>
          )}
          {(recovery || resetPassword) && (
            <a
              className="block text-center text-sm text-primary"
              href={`/login?next=${encodeURIComponent(next)}`}
            >
              Back to sign in
            </a>
          )}
          {!sent && !resetPassword && !recovery && method === "link" && (
            <p className="text-xs text-muted-foreground">
              New here? Use an email link to verify your address and get
              started.
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
