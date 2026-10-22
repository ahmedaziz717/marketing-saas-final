import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Plug, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PartnerLogo } from "./PartnerLogo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  formatGoogleCustomerId,
  googleConnectionMessage,
} from "@shared/googleAds";

const integrations = "/app/settings/integrations";
const fail = (error: { message: string }) => toast.error(error.message);
export function GoogleAdsConnectionCard() {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const manage = ["owner", "admin"].includes(membership?.role ?? "");
  const query = trpc.googleAds.connections.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const items = query.data?.items ?? [];
  const current = items.filter(c => c.status !== "disconnected");
  const previous = items.filter(c => c.status === "disconnected");
  const connected = current.filter(
    c => c.status === "connected" && !c.needsReconnect
  ).length;
  const oauth = trpc.googleAds.beginOAuth.useMutation({
    onSuccess: r => window.location.assign(r.url),
    onError: fail,
  });
  const verify = trpc.googleAds.verify.useMutation({
    onSuccess: async r => {
      await utils.googleAds.connections.invalidate();
      toast.success(r.message);
    },
    onError: async e => {
      await utils.googleAds.connections.invalidate();
      fail(e);
    },
  });
  const disconnect = trpc.googleAds.disconnect.useMutation({
    onSuccess: async () => {
      setDisconnectId(null);
      await utils.googleAds.connections.invalidate();
      toast.success("Google Ads account disconnected.");
    },
    onError: fail,
  });
  const busy = oauth.isPending || verify.isPending || disconnect.isPending;
  const start = () => {
    if (organizationId) oauth.mutate({ organizationId });
  };
  const disconnecting = items.find(c => c.id === disconnectId);
  useEffect(() => {
    setDisconnectId(null);
    setOpen(false);
  }, [organizationId]);
  return (
    <article className="surface flex min-w-0 flex-col p-6">
      <div className="flex items-center justify-between gap-2">
        <PartnerLogo slug="googleads" name="Google Ads" />
        <span className="rounded-full bg-muted px-3 py-1 text-xs">
          {query.isLoading
            ? "Checking..."
            : query.error
              ? "Status unavailable"
              : connected
                ? `${connected} connected`
                : "Not connected"}
        </span>
      </div>
      <h3 className="mt-5 font-semibold">Google Ads</h3>
      <p className="mb-6 mt-2 flex-1 text-sm text-muted-foreground">
        Connect your Google account and choose the Ads accounts for this
        workspace. Report on spend, conversions and campaign performance in
        Insights Studio.
      </p>
      {query.error && (
        <p role="alert" className="mb-3 text-sm">
          Could not load your connections.{" "}
          <button className="underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {query.data && !query.data.oauthConfigured && (
        <p className="mb-3 text-sm text-muted-foreground">
          Google connection setup is pending. Contact support to enable it.
        </p>
      )}
      <Button
        variant="outline"
        className="w-fit"
        disabled={
          query.isLoading ||
          !!query.error ||
          (!items.length && (!manage || !query.data?.oauthConfigured)) ||
          busy
        }
        onClick={() => (items.length ? setOpen(true) : start())}
      >
        <Plug className="mr-2 h-4 w-4" />
        {oauth.isPending
          ? "Opening Google..."
          : items.length
            ? "Manage connections"
            : "Connect with Google"}
      </Button>
      {connected > 0 && (
        <Button variant="outline" className="mt-3 w-fit" asChild>
          <Link href="/app/analytics/studio?channel=google_ads">
            Open Google Ads reports
          </Link>
        </Button>
      )}
      {connected > 0 && (
        <Button asChild variant="outline" className="mt-2 w-fit">
          <Link href="/app/activate/google">Open Google campaign studio</Link>
        </Button>
      )}
      {!manage && (
        <p className="mt-3 text-xs text-muted-foreground">
          A workspace owner or administrator can connect accounts.
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={value => {
          setOpen(value);
          if (!value) setDisconnectId(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Google Ads connections</DialogTitle>
            <DialogDescription>
              Manage the Google Ads accounts connected to this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            {current.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No Google Ads accounts are currently connected.
              </p>
            )}
            {current.map(c => (
              <section key={c.id} className="rounded-xl border p-4">
                <p className="break-words font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatGoogleCustomerId(c.accountId)} ·{" "}
                  {c.needsReconnect ? "Reconnect needed" : "Connected"}
                  {c.details.google?.testAccount ? " · Test account" : ""}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {c.details.currency} · {c.details.timezone}
                  {c.details.google?.loginCustomerId
                    ? ` · Via manager ${formatGoogleCustomerId(c.details.google.loginCustomerId)}`
                    : ""}
                </p>
                {c.details.warnings.map(w => (
                  <p key={w} className="mt-2 text-sm text-muted-foreground">
                    {w}
                  </p>
                ))}
                {manage && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !query.data?.oauthConfigured}
                      onClick={() =>
                        verify.mutate({
                          organizationId: organizationId!,
                          id: c.id,
                        })
                      }
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Check connection
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !query.data?.oauthConfigured}
                      onClick={start}
                    >
                      Reconnect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDisconnectId(c.id)}
                    >
                      <Unplug className="mr-1 h-3 w-3" />
                      Disconnect
                    </Button>
                  </div>
                )}
              </section>
            ))}
            {!!previous.length && (
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer text-sm">
                  Previously connected accounts ({previous.length})
                </summary>
                <ul className="mt-3 space-y-2">
                  {previous.map(c => (
                    <li key={c.id} className="text-sm">
                      <span className="break-words">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatGoogleCustomerId(c.accountId)} · Disconnected
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-muted-foreground">
              Connecting an account does not launch, change, or delete ads.
              Campaign changes are reviewed separately in the Google campaign
              studio.
            </p>
          </div>
          <div className="shrink-0 space-y-3 border-t pt-4">
            {disconnecting && (
              <div role="alert" className="rounded-xl border p-3 text-sm">
                <p className="break-words">
                  Disconnect {disconnecting.name} from this workspace? Its
                  campaigns and other connected accounts will stay unchanged.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      disconnect.mutate({
                        organizationId: organizationId!,
                        id: disconnecting.id,
                        confirm: true,
                      })
                    }
                  >
                    {disconnect.isPending
                      ? "Disconnecting..."
                      : "Confirm disconnect"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disconnect.isPending}
                    onClick={() => setDisconnectId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {manage && (
              <Button
                disabled={busy || !query.data?.oauthConfigured}
                onClick={start}
              >
                {oauth.isPending ? "Opening Google..." : "Connect with Google"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

export function GoogleAdsConnectionSelection() {
  const { organizationId, membership } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const raw = params.get("googleSelection");
  const id =
    raw &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw)
      ? raw
      : null;
  const error = params.get("googleError");
  const manage = ["owner", "admin"].includes(membership?.role ?? "");
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    setChosen([]);
    setSearch("");
  }, [id, organizationId]);
  const query = trpc.googleAds.selection.useQuery(
    {
      organizationId: organizationId!,
      id: id ?? "00000000-0000-4000-8000-000000000000",
    },
    { enabled: !!organizationId && !!id && manage, retry: false }
  );
  const cancel = trpc.googleAds.cancelSelection.useMutation({
    onSuccess: () => navigate(integrations),
    onError: e => {
      fail(e);
      navigate(integrations);
    },
  });
  const connect = trpc.googleAds.connect.useMutation({
    onSuccess: async r => {
      await utils.googleAds.connections.invalidate();
      navigate(integrations);
      toast.success(
        `${r.accounts.length} Google Ads account${r.accounts.length === 1 ? "" : "s"} connected.`
      );
    },
    onError: fail,
  });
  const dismiss = () => {
    if (connect.isPending || cancel.isPending) return;
    if (id && organizationId && manage) cancel.mutate({ organizationId, id });
    else navigate(integrations);
  };
  const accounts = (query.data?.accounts ?? []).filter(a =>
    `${a.name} ${a.id} ${formatGoogleCustomerId(a.id)}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  return (
    <>
      {error && (
        <div role="alert" className="mb-6 rounded-xl border p-4 text-sm">
          {googleConnectionMessage(error)}{" "}
          <Button variant="ghost" onClick={() => navigate(integrations)}>
            Dismiss
          </Button>
        </div>
      )}
      <Dialog
        open={!!id}
        onOpenChange={value => {
          if (!value) dismiss();
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose your Google Ads accounts</DialogTitle>
            <DialogDescription>
              Select the accounts to connect to this workspace. Only accounts
              available through your Google login are listed.
            </DialogDescription>
          </DialogHeader>
          {!manage ? (
            <p>
              Only workspace owners and administrators can complete account
              setup.
            </p>
          ) : query.isLoading ? (
            <p role="status">Loading Google Ads accounts...</p>
          ) : query.error ? (
            <p role="alert" className="text-sm">
              {query.error.message}
            </p>
          ) : (
            query.data && (
              <>
                {!!query.data.accounts.length && (
                  <Input
                    aria-label="Search Google Ads accounts"
                    placeholder="Search by account name or ID"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                )}
                <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                  {!query.data.accounts.length && (
                    <p className="py-3 text-sm">
                      No active advertising accounts were found. Make sure this
                      Google login has access to a Google Ads account. Manager
                      accounts are expanded into their advertising accounts.
                    </p>
                  )}
                  {!!query.data.accounts.length && !accounts.length && (
                    <p className="py-3 text-sm">
                      No accounts match your search.
                    </p>
                  )}
                  {accounts.map(a => (
                    <label
                      key={a.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${chosen.includes(a.id) ? "border-primary bg-primary/5" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        checked={chosen.includes(a.id)}
                        disabled={
                          connect.isPending ||
                          cancel.isPending ||
                          (chosen.length >= 25 && !chosen.includes(a.id))
                        }
                        onChange={e =>
                          setChosen(current =>
                            e.target.checked
                              ? [...current, a.id]
                              : current.filter(id => id !== a.id)
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium">
                          {a.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatGoogleCustomerId(a.id)} · {a.currency}
                          {a.testAccount ? " · Test account" : ""}
                        </span>
                        {a.loginCustomerId && (
                          <span className="block text-xs text-muted-foreground">
                            Via manager{" "}
                            {formatGoogleCustomerId(a.loginCustomerId)}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )
          )}
          <div className="shrink-0 space-y-3 border-t pt-4">
            {query.data?.warnings.map(w => (
              <p
                key={w}
                role="status"
                className="text-sm text-muted-foreground"
              >
                {w}
              </p>
            ))}
            {chosen.length >= 25 && (
              <p className="text-sm">Connect up to 25 accounts at a time.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={
                  !manage ||
                  !query.data ||
                  !!query.error ||
                  !chosen.length ||
                  connect.isPending ||
                  cancel.isPending
                }
                onClick={() =>
                  connect.mutate({
                    organizationId: organizationId!,
                    discoveryId: id!,
                    accountIds: chosen,
                  })
                }
              >
                {connect.isPending
                  ? "Connecting..."
                  : `Connect selected${chosen.length ? ` (${chosen.length})` : ""}`}
              </Button>
              <Button
                variant="ghost"
                disabled={connect.isPending || cancel.isPending}
                onClick={dismiss}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
