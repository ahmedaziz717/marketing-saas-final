import { useState } from "react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  LockKeyhole,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

function PublishingWorkspace() {
  const { organizationId } = useWorkspace();
  const utils = trpc.useUtils();
  const overview = trpc.meta.overview.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [connection, setConnection] = useState({
    adAccountId: "",
    pageId: "",
    instagramActorId: "",
    accessToken: "",
  });
  const [variantId, setVariantId] = useState("");
  const [action, setAction] = useState<"create" | "update">("create");
  const [payload, setPayload] = useState({
    name: "",
    destinationUrl: "",
    adSetId: "",
    adId: "",
  });
  const refresh = async () =>
    Promise.all([
      utils.meta.overview.invalidate(),
      utils.activity.list.invalidate(),
    ]);
  const connect = trpc.meta.connect.useMutation({
    onSuccess: async result => {
      await refresh();
      setConnectionOpen(false);
      setConnection(value => ({ ...value, accessToken: "" }));
      toast.success(`Connected as ${result.identityName}`);
    },
    onError: error => toast.error(error.message),
  });
  const createRequest = trpc.meta.createRequest.useMutation({
    onSuccess: async () => {
      await refresh();
      setRequestOpen(false);
      toast.success("Publish request created and awaiting approval");
    },
    onError: error => toast.error(error.message),
  });
  const approve = trpc.meta.approveRequest.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Exact publish payload approved");
    },
    onError: error => toast.error(error.message),
  });
  const execute = trpc.meta.executeRequest.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(`Meta ad ${result.adId} saved as PAUSED`);
    },
    onError: error => toast.error(error.message),
  });

  const submitConnection = () =>
    connect.mutate({
      organizationId: organizationId!,
      ...connection,
      instagramActorId: connection.instagramActorId || undefined,
    });
  const submitRequest = () =>
    createRequest.mutate({
      organizationId: organizationId!,
      variantId: Number(variantId),
      action,
      payload: {
        name: payload.name,
        destinationUrl: payload.destinationUrl,
        adSetId: action === "create" ? payload.adSetId : undefined,
        adId: action === "update" ? payload.adId : undefined,
      },
    });

  return (
    <>
      <PageHeader
        eyebrow="Controlled delivery"
        title="Meta publishing"
        description="Create or update a Meta ad only after the creative and exact publishing payload have both been explicitly approved."
        action={
          overview.data?.connection?.status === "connected" ? (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="h-4 w-4" />
              Meta connected
            </div>
          ) : (
            <StatusPill status="disconnected" />
          )
        }
      />
      <div className="mb-6 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className="surface p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Destination</p>
              <h2 className="mt-3 text-xl font-semibold">Meta ad account</h2>
            </div>
            <div
              className={`grid h-11 w-11 place-items-center rounded-2xl ${overview.data?.connection ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
            >
              <KeyRound className="h-5 w-5" />
            </div>
          </div>
          {overview.data?.connection ? (
            <div className="mt-6 space-y-3 rounded-2xl bg-muted/60 p-4 text-sm">
              <p className="text-muted-foreground">
                Ad account{" "}
                <span className="float-right font-medium text-foreground">
                  act_{overview.data.connection.adAccountId}
                </span>
              </p>
              <p className="text-muted-foreground">
                Page{" "}
                <span className="float-right font-medium text-foreground">
                  {overview.data.connection.pageId}
                </span>
              </p>
              <p className="text-muted-foreground">
                Status{" "}
                <span className="float-right">
                  <StatusPill status={overview.data.connection.status} />
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Connect an access token with the required Marketing API
              permissions. It is validated, encrypted, and never returned to the
              browser.
            </p>
          )}
          <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="mt-5 w-full">
                {overview.data?.connection
                  ? "Replace connection"
                  : "Connect Meta"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-editorial text-4xl font-normal">
                  Connect Meta safely
                </DialogTitle>
                <DialogDescription>
                  The token is validated with Meta and stored using AES-256-GCM
                  encryption.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-3">
                <div>
                  <Label>Ad account ID</Label>
                  <Input
                    className="mt-2"
                    value={connection.adAccountId}
                    onChange={event =>
                      setConnection({
                        ...connection,
                        adAccountId: event.target.value,
                      })
                    }
                    placeholder="act_123456789"
                  />
                </div>
                <div>
                  <Label>Facebook Page ID</Label>
                  <Input
                    className="mt-2"
                    value={connection.pageId}
                    onChange={event =>
                      setConnection({
                        ...connection,
                        pageId: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>
                    Instagram actor ID{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    className="mt-2"
                    value={connection.instagramActorId}
                    onChange={event =>
                      setConnection({
                        ...connection,
                        instagramActorId: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Access token</Label>
                  <Input
                    className="mt-2"
                    type="password"
                    autoComplete="off"
                    value={connection.accessToken}
                    onChange={event =>
                      setConnection({
                        ...connection,
                        accessToken: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex items-start gap-2 rounded-2xl bg-muted/60 p-4 text-xs leading-5 text-muted-foreground">
                  <LockKeyhole className="mt-.5 h-4 w-4 shrink-0 text-primary" />
                  Frame never records raw tokens in the activity ledger or
                  exposes them through workspace APIs.
                </div>
              </div>
              <Button
                onClick={submitConnection}
                disabled={
                  connection.adAccountId.length < 4 ||
                  connection.pageId.length < 4 ||
                  connection.accessToken.length < 20 ||
                  connect.isPending
                }
              >
                {connect.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Validate & connect
              </Button>
            </DialogContent>
          </Dialog>
        </section>
        <section className="surface overflow-hidden bg-[#201c25] p-6 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-violet-300">
            Safety contract
          </p>
          <h2 className="mt-4 max-w-xl font-editorial text-4xl leading-none">
            Every outbound change passes two approvals.
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/[.06] p-4">
              <span className="text-xs text-violet-300">01</span>
              <p className="mt-5 font-semibold">Creative approved</p>
              <p className="mt-2 text-xs leading-5 text-white/50">
                A reviewer accepts the exact image and copy package.
              </p>
            </div>
            <div className="rounded-2xl bg-white/[.06] p-4">
              <span className="text-xs text-violet-300">02</span>
              <p className="mt-5 font-semibold">Payload approved</p>
              <p className="mt-2 text-xs leading-5 text-white/50">
                A publisher accepts the frozen destination and Meta action.
              </p>
            </div>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-white/55">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            All created and updated ads are forced to PAUSED.
          </p>
        </section>
      </div>

      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="eyebrow">Approval queue</p>
          <h2 className="mt-2 text-2xl font-semibold">Publish requests</h2>
        </div>
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogTrigger asChild>
            <Button
              className="rounded-full"
              disabled={
                !overview.data?.connection || !overview.data?.variants.length
              }
            >
              <Send className="mr-2 h-4 w-4" />
              New request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-editorial text-4xl font-normal">
                Prepare a Meta action
              </DialogTitle>
              <DialogDescription>
                The payload is frozen when submitted. Any later change
                invalidates approval.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-3">
              <div>
                <Label>Approved creative</Label>
                <Select value={variantId} onValueChange={setVariantId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Choose a creative" />
                  </SelectTrigger>
                  <SelectContent>
                    {overview.data?.variants.map(variant => (
                      <SelectItem key={variant.id} value={String(variant.id)}>
                        {variant.name} · {variant.headline}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Action</Label>
                <Select
                  value={action}
                  onValueChange={value =>
                    setAction(value as "create" | "update")
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create">Create new paused ad</SelectItem>
                    <SelectItem value="update">
                      Update existing ad and pause it
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ad name</Label>
                <Input
                  className="mt-2"
                  value={payload.name}
                  onChange={event =>
                    setPayload({ ...payload, name: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Destination URL</Label>
                <Input
                  className="mt-2"
                  value={payload.destinationUrl}
                  onChange={event =>
                    setPayload({
                      ...payload,
                      destinationUrl: event.target.value,
                    })
                  }
                  placeholder="https://example.com/offer"
                />
              </div>
              {action === "create" ? (
                <div>
                  <Label>Target ad set ID</Label>
                  <Input
                    className="mt-2"
                    value={payload.adSetId}
                    onChange={event =>
                      setPayload({ ...payload, adSetId: event.target.value })
                    }
                  />
                </div>
              ) : (
                <div>
                  <Label>Existing ad ID</Label>
                  <Input
                    className="mt-2"
                    value={payload.adId}
                    onChange={event =>
                      setPayload({ ...payload, adId: event.target.value })
                    }
                  />
                </div>
              )}
            </div>
            <Button
              onClick={submitRequest}
              disabled={
                !variantId ||
                !payload.name ||
                !payload.destinationUrl ||
                (action === "create" ? !payload.adSetId : !payload.adId) ||
                createRequest.isPending
              }
            >
              Submit for explicit approval
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {!overview.data?.requests.length ? (
        <div className="surface grid min-h-72 place-items-center text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Send className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold">No publish requests</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Approve a creative, connect Meta, and prepare the first controlled
              action.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {overview.data.requests.map(request => (
            <article key={request.id} className="surface p-5 md:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="eyebrow">Request #{request.id}</p>
                    <StatusPill status={request.status} />
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                      {request.action}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">
                    {String(
                      (request.payload as { name?: string }).name || "Meta ad"
                    )}
                  </h3>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    Payload {request.payloadHash.slice(0, 16)}…
                  </p>
                  {request.metaObjectId && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Meta ad ID: {request.metaObjectId}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {request.status === "awaiting_approval" && (
                    <Button
                      onClick={() =>
                        approve.mutate({
                          organizationId: organizationId!,
                          requestId: request.id,
                        })
                      }
                      disabled={approve.isPending}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve exact payload
                    </Button>
                  )}
                  {request.status === "approved" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button>
                          <Send className="mr-2 h-4 w-4" />
                          Publish to Meta
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Confirm the outbound Meta action
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will {request.action} a Meta ad using the
                            approved creative and frozen payload. The ad will be
                            saved as PAUSED. Frame will record each API action
                            in the immutable ledger.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              execute.mutate({
                                organizationId: organizationId!,
                                requestId: request.id,
                              })
                            }
                          >
                            Confirm & publish paused ad
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export default function LegacyPublishingPage() {
  return (
    <WorkspaceGate>
      <PublishingWorkspace />
    </WorkspaceGate>
  );
}
