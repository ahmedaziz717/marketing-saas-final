import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Check, Facebook, Plug, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { channelNames, type Channel } from "@shared/channels";
export const channelInput =
  "min-w-0 w-full rounded-xl border bg-background px-3 py-2 text-sm";
export function ChannelConnectionCard({ channel }: { channel: Channel }) {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false),
    [token, setToken] = useState("");
  const query = trpc.channels.connections.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const manage = ["owner", "admin"].includes(membership?.role ?? "");
  const items = (query.data?.items ?? []).filter(c => c.channel === channel);
  const connected = items.filter(
    c => c.status === "connected" && !c.expired
  ).length;
  const fail = (e: { message: string }) => toast.error(e.message);
  const oauth = trpc.channels.beginOAuth.useMutation({
    onSuccess: r => window.location.assign(r.url),
    onError: fail,
  });
  const verify = trpc.channels.verify.useMutation({
    onSuccess: async r => {
      await utils.channels.connections.invalidate();
      toast.success(r.message);
    },
    onError: fail,
  });
  const disconnect = trpc.channels.disconnect.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channels.connections.invalidate(),
        utils.publishing.list.invalidate(),
      ]);
      toast.success("Disconnected. Existing posts and ads were not deleted.");
    },
    onError: fail,
  });
  const selection = (r: { id: string }) => {
    setToken("");
    setOpen(false);
    navigate("/app/settings/integrations?metaSelection=" + r.id);
  };
  const discover = trpc.channels.discover.useMutation({
    onSuccess: selection,
    onError: fail,
  });
  const legacy = trpc.channels.useExistingToken.useMutation({
    onSuccess: selection,
    onError: fail,
  });
  return (
    <article className="surface flex min-w-0 flex-col p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          {channel === "facebook" ? (
            <Facebook />
          ) : (
            <span className="text-3xl font-semibold">∞</span>
          )}
        </div>
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
      <h3 className="mt-5 font-semibold">
        {channel === "facebook" ? "Facebook Pages" : "Meta Ads"}
      </h3>
      <p className="mb-6 mt-2 flex-1 text-sm text-muted-foreground">
        {channel === "facebook"
          ? "Organic posts, scheduling, and Page performance. Separate from paid advertising."
          : "Connect an ad account and Page, browse campaigns, prepare paused ads, and report results."}
      </p>
      <Button variant="outline" className="w-fit" onClick={() => setOpen(true)}>
        <Plug className="mr-2 h-4 w-4" />
        {connected ? "Manage connections" : "Connect account"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          setOpen(value);
          if (!value) setToken("");
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{channelNames[channel]} connections</DialogTitle>
            <DialogDescription>
              Connecting does not publish content, activate advertising, or
              change budgets.
            </DialogDescription>
          </DialogHeader>
          {query.error ? (
            <p role="alert">
              Connections could not be loaded.{" "}
              <Button onClick={() => query.refetch()}>Retry</Button>
            </p>
          ) : (
            <>
              {!manage && (
                <p className="rounded-xl bg-muted p-4 text-sm">
                  Ask a workspace owner or administrator to connect or reconnect
                  this channel.
                </p>
              )}
              {items.map(c => (
                <div key={c.id} className="min-w-0 rounded-xl border p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.accountId} · {c.expired ? "Expired" : c.status}
                      </p>
                    </div>
                    {manage && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            verify.isPending || c.status !== "connected"
                          }
                          onClick={() =>
                            verify.mutate({
                              organizationId: organizationId!,
                              id: c.id,
                            })
                          }
                        >
                          <RefreshCw className="h-4 w-4" />
                          <span className="sr-only">Verify {c.name}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            disconnect.isPending || c.status === "disconnected"
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "Disconnect this account and stop its queued deliveries? Existing posts and ads will remain in Meta."
                              )
                            )
                              disconnect.mutate({
                                organizationId: organizationId!,
                                id: c.id,
                                confirm: true,
                              });
                          }}
                        >
                          <Unplug className="h-4 w-4" />
                          <span className="sr-only">Disconnect {c.name}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.details.capabilities.map(cap => (
                      <span
                        key={cap}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-1 text-xs"
                      >
                        <Check className="h-3 w-3" />
                        {cap === "publish"
                          ? "Publishing permission"
                          : cap === "insights"
                            ? "Reporting permission"
                            : "Read access"}
                      </span>
                    ))}
                  </div>
                  {c.details.pageName && (
                    <p className="mt-2 text-sm">Page: {c.details.pageName}</p>
                  )}
                  {c.details.warnings.map(w => (
                    <p key={w} className="mt-2 text-xs text-muted-foreground">
                      {w}
                    </p>
                  ))}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last identity check:{" "}
                    {new Date(c.verifiedAtMs).toLocaleString()}
                  </p>
                </div>
              ))}
              {manage && (
                <>
                  <Button
                    disabled={oauth.isPending || !query.data?.oauthConfigured}
                    onClick={() =>
                      oauth.mutate({ organizationId: organizationId!, channel })
                    }
                  >
                    Connect with Meta
                  </Button>
                  {!query.data?.oauthConfigured && (
                    <p className="rounded-xl bg-muted p-4 text-sm">
                      Meta OAuth needs server setup before account login can
                      open. Configure the Meta app ID, secret and callback URL.
                      No account is connected by this button until consent is
                      completed.
                    </p>
                  )}
                  {query.data?.callbackUrl && (
                    <p className="break-all text-xs text-muted-foreground">
                      OAuth callback: {query.data.callbackUrl}
                    </p>
                  )}
                  {channel === "meta_ads" && query.data?.hasLegacy && (
                    <Button
                      variant="outline"
                      disabled={legacy.isPending}
                      onClick={() =>
                        legacy.mutate({ organizationId: organizationId! })
                      }
                    >
                      Revalidate existing Meta connection
                    </Button>
                  )}
                  {query.data?.advancedEnabled && (
                    <details className="rounded-xl border p-4">
                      <summary className="cursor-pointer text-sm">
                        Advanced: connect with a Meta user token
                      </summary>
                      <Label
                        htmlFor={"meta-token-" + channel}
                        className="mt-4 block"
                      >
                        User access token
                      </Label>
                      <Input
                        id={"meta-token-" + channel}
                        type="password"
                        autoComplete="off"
                        value={token}
                        onChange={e => setToken(e.target.value)}
                      />
                      <Button
                        className="mt-3"
                        disabled={discover.isPending || token.length < 20}
                        onClick={() =>
                          discover.mutate({
                            organizationId: organizationId!,
                            channel,
                            token,
                          })
                        }
                      >
                        Verify and choose assets
                      </Button>
                    </details>
                  )}
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
export function MetaConnectionSelection() {
  const { organizationId, membership } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const raw = params.get("metaSelection");
  const id = raw && /^[a-f0-9-]{36}$/i.test(raw) ? raw : null;
  const manage = ["owner", "admin"].includes(membership?.role ?? "");
  const [accountId, setAccountId] = useState(""),
    [pageId, setPageId] = useState("");
  const query = trpc.channels.selection.useQuery(
    {
      organizationId: organizationId!,
      id: id ?? "00000000-0000-4000-8000-000000000000",
    },
    { enabled: !!organizationId && !!id && manage, retry: false }
  );
  useEffect(() => {
    setAccountId("");
    setPageId("");
  }, [id]);
  const connect = trpc.channels.connect.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channels.connections.invalidate(),
        utils.publishing.list.invalidate(),
      ]);
      navigate("/app/settings/integrations");
      toast.success("Account connected. Nothing has been published.");
    },
    onError: e => toast.error(e.message),
  });
  const error = params.get("metaError");
  return (
    <>
      {error && (
        <div role="alert" className="mb-6 rounded-xl border p-4 text-sm">
          Meta login did not complete (
          {["state", "expired", "declined", "code"].includes(error)
            ? error
            : "connection error"}
          ). Your existing connections have not changed.{" "}
          <Button
            variant="ghost"
            onClick={() => navigate("/app/settings/integrations")}
          >
            Dismiss
          </Button>
        </div>
      )}
      <Dialog
        open={!!id}
        onOpenChange={open => {
          if (!open) navigate("/app/settings/integrations");
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose your Meta assets</DialogTitle>
            <DialogDescription>
              Only assets granted through Meta login can be connected to this
              workspace.
            </DialogDescription>
          </DialogHeader>
          {!manage ? (
            <p>Only owners and administrators can complete account setup.</p>
          ) : query.isLoading ? (
            <p role="status">Loading authorized assets...</p>
          ) : query.error ? (
            <p role="alert">{query.error.message}</p>
          ) : (
            query.data && (
              <>
                <p className="text-sm">
                  Connected identity: {query.data.identityName}
                </p>
                <Label htmlFor="meta-account-choice">
                  {query.data.purpose === "facebook"
                    ? "Facebook Page"
                    : "Ad account"}
                </Label>
                <select
                  id="meta-account-choice"
                  className={channelInput}
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                >
                  <option value="">Choose an account</option>
                  {(query.data.purpose === "facebook"
                    ? query.data.pages
                    : query.data.accounts
                  ).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
                {query.data.purpose === "meta_ads" && (
                  <>
                    <Label htmlFor="meta-page-choice">
                      Facebook Page for ads
                    </Label>
                    <select
                      id="meta-page-choice"
                      className={channelInput}
                      value={pageId}
                      onChange={e => setPageId(e.target.value)}
                    >
                      <option value="">Choose a Page</option>
                      {query.data.pages.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {!query.data.pages.length && (
                  <p className="text-sm">
                    No Pages were granted. Reconnect and select a Page you
                    manage.
                  </p>
                )}
                {query.data.warnings.map(w => (
                  <p key={w} className="text-sm text-muted-foreground">
                    {w}
                  </p>
                ))}
                <Button
                  disabled={
                    connect.isPending ||
                    !accountId ||
                    (query.data.purpose === "meta_ads" && !pageId)
                  }
                  onClick={() =>
                    connect.mutate({
                      organizationId: organizationId!,
                      discoveryId: id!,
                      accountId,
                      pageId:
                        query.data.purpose === "meta_ads" ? pageId : undefined,
                    })
                  }
                >
                  {connect.isPending
                    ? "Connecting..."
                    : "Connect selected account"}
                </Button>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
