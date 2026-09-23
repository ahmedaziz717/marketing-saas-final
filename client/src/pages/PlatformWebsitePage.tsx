import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  emptyWebsiteProfile,
  REQUEST_STATES,
  type WebsiteProfile,
} from "@shared/publicWebsite";
import { toast } from "sonner";

function WebsiteAdministration() {
  const utils = trpc.useUtils();
  const current = trpc.publicWebsiteAdmin.profile.useQuery();
  const [before, setBefore] = useState<
    { createdAtMs: number; id: string } | undefined
  >();
  const requests = trpc.publicWebsiteAdmin.requests.useQuery(
    before ? { before } : undefined
  );
  const [form, setForm] = useState<WebsiteProfile>(emptyWebsiteProfile);
  const [tab, setTab] = useState<"profile" | "inbox">("profile");
  const [active, setActive] = useState("");
  const [requestState, setRequestState] =
    useState<(typeof REQUEST_STATES)[number]>("under_review");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (current.data) setForm(current.data.profile);
  }, [current.data]);
  const save = trpc.publicWebsiteAdmin.saveProfile.useMutation({
    onSuccess: async () => {
      await utils.publicWebsiteAdmin.profile.invalidate();
      toast.success("Public website details updated");
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.publicWebsiteAdmin.updateRequest.useMutation({
    onSuccess: async () => {
      await utils.publicWebsiteAdmin.requests.invalidate();
      setActive("");
      setNote("");
      toast.success(
        "Request status updated. No customer data was deleted by this action."
      );
    },
    onError: e => toast.error(e.message),
  });
  const selected = requests.data?.items.find(r => r.id === active);
  return (
    <>
      <PageHeader
        eyebrow="Platform administration"
        title="Public website & requests"
        description="EvokeLoop platform settings, not the identity or permissions of a customer workspace."
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Button
          variant={tab === "profile" ? "default" : "outline"}
          onClick={() => setTab("profile")}
        >
          Website details
        </Button>
        <Button
          variant={tab === "inbox" ? "default" : "outline"}
          onClick={() => setTab("inbox")}
        >
          Public requests inbox
        </Button>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="self-center text-sm text-primary"
        >
          View public website
        </a>
      </div>
      {tab === "profile" ? (
        <section className="surface max-w-3xl p-6">
          <h2 className="text-xl font-semibold">
            Confirm the business behind EvokeLoop
          </h2>
          <p className="my-3 text-sm text-muted-foreground">
            These details appear on public company, policy and contact pages. Do
            not enter a customer's business, a personal email without
            permission, or API secrets. Only the platform administrator can edit
            this information.
          </p>
          {current.isLoading ? (
            <p role="status">Loading website details...</p>
          ) : current.error ? (
            <p role="alert">Website details could not be loaded.</p>
          ) : (
            <form
              className="space-y-5"
              onSubmit={e => {
                e.preventDefault();
                save.mutate({
                  profile: form,
                  revision: current.data?.revision ?? 0,
                });
              }}
            >
              {(
                [
                  ["operatorName", "Legal operating company", "text"],
                  ["supportEmail", "Public support email", "email"],
                  ["privacyEmail", "Public privacy email", "email"],
                  [
                    "operatorWebsite",
                    "Operating company's website (optional HTTPS URL)",
                    "url",
                  ],
                ] as const
              ).map(([key, label, type]) => (
                <div key={key}>
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    className="mt-2"
                    id={key}
                    type={type}
                    value={form[key]}
                    onChange={e =>
                      setForm({
                        ...form,
                        [key]: e.target.value,
                        disclosuresApproved: false,
                      })
                    }
                  />
                </div>
              ))}
              <div>
                <Label htmlFor="businessAddress">
                  Public business address (optional)
                </Label>
                <Textarea
                  className="mt-2"
                  id="businessAddress"
                  value={form.businessAddress}
                  onChange={e =>
                    setForm({
                      ...form,
                      businessAddress: e.target.value,
                      disclosuresApproved: false,
                    })
                  }
                />
              </div>
              <div className="rounded-xl border p-4 text-sm">
                <p className="mb-3 font-semibold">
                  Before approving these disclosures
                </p>
                <p className="mb-3 text-muted-foreground">
                  Review the public Privacy, Terms, Data deletion and Security
                  pages against actual operations, provider contracts and the
                  legal business. Confirm a monitored support/privacy mailbox
                  and a person responsible for the inbox and deletion
                  fulfillment. This checkbox does not complete Meta's app review
                  or create an automatic deletion service.
                </p>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.disclosuresApproved}
                    onChange={e =>
                      setForm({
                        ...form,
                        disclosuresApproved: e.target.checked,
                      })
                    }
                  />
                  <span>
                    I am authorized to publish this operator identity, have
                    reviewed these disclosures and have established request
                    handling for this service.
                  </span>
                </label>
              </div>
              <Button
                disabled={save.isPending || !current.data?.available}
                type="submit"
              >
                {save.isPending ? "Saving..." : "Save public details"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Operator identity and policy approval are tracked here. Public
                pages use customer-facing copy and remain noindex until these
                details are approved. Meta and other crawlers can still read the
                public HTML. Provider review, credentials and live-publishing
                settings are managed separately.
              </p>
            </form>
          )}
        </section>
      ) : (
        <section className="surface p-6">
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="text-xl font-semibold">
              Support, access & privacy requests
            </h2>
            <Button
              variant="outline"
              onClick={() => requests.refetch()}
              disabled={requests.isFetching}
            >
              Refresh inbox
            </Button>
          </div>
          <p className="my-4 text-sm text-muted-foreground">
            Website messages are saved here and queued for email notification.
            Reply within two business days, verify authority before fulfilling
            privacy requests, and record the outcome. Closing a request does not
            delete any account, asset, connected data or public content.
          </p>
          {requests.data && !requests.data.deliveryConfigured && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              Email delivery is not configured. Messages remain saved here;
              configure the contact email sender before relying on
              notifications.
            </p>
          )}
          {requests.isLoading ? (
            <p role="status">Loading requests...</p>
          ) : requests.error ? (
            <p role="alert">Requests could not be loaded. Try refreshing.</p>
          ) : !requests.data?.items.length ? (
            <p>No requests in this page of the inbox.</p>
          ) : (
            <div className="space-y-3">
              {requests.data.items.map(r => (
                <article className="rounded-xl border p-4" key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {r.name}{" "}
                        <span className="font-normal text-muted-foreground">
                          / {r.topic}
                        </span>
                      </p>
                      <a
                        className="text-sm text-primary break-all"
                        href={`mailto:${r.email}`}
                      >
                        {r.email}
                      </a>
                      <p className="mt-1 text-xs">
                        {new Date(r.createdAtMs).toLocaleString()} /{" "}
                        {r.state.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs">
                        {r.emailState === "sent"
                          ? "Email notification accepted by the delivery provider"
                          : r.emailState === "needs_attention"
                            ? "Email notification needs attention — use the inbox to respond"
                            : r.emailState === "retrying"
                              ? "Email notification is being retried"
                              : "Email notification queued"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setActive(r.id);
                        setRequestState(r.state as typeof requestState);
                        setNote(r.resolutionNote ?? "");
                      }}
                    >
                      Review request
                    </Button>
                  </div>
                  <p className="mt-3 text-sm break-words">
                    Workspace/reference: {r.workspace || "Not supplied"}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                    {r.message}
                  </p>
                  {r.resolutionNote && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      Internal note: {r.resolutionNote}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="mt-5 flex gap-3">
            {before && (
              <Button variant="outline" onClick={() => setBefore(undefined)}>
                Newest requests
              </Button>
            )}
            {requests.data?.nextBefore && (
              <Button
                variant="outline"
                onClick={() => setBefore(requests.data!.nextBefore!)}
              >
                Older requests
              </Button>
            )}
          </div>
          {selected && (
            <form
              className="mt-6 max-w-2xl space-y-4 rounded-xl border p-5"
              onSubmit={e => {
                e.preventDefault();
                update.mutate({
                  id: selected.id,
                  updatedAtMs: selected.updatedAtMs,
                  state: requestState,
                  note,
                });
              }}
            >
              <h3 className="font-semibold">
                Update request from {selected.name}
              </h3>
              <label className="block text-sm">
                Status
                <select
                  className="mt-2 block w-full rounded-lg border bg-background p-2"
                  value={requestState}
                  onChange={e =>
                    setRequestState(e.target.value as typeof requestState)
                  }
                >
                  {REQUEST_STATES.map(s => (
                    <option value={s} key={s}>
                      {s.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Internal outcome / next step
                <Textarea
                  className="mt-2"
                  required
                  minLength={5}
                  maxLength={2000}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Do not record secrets. Verify identity and complete any deletion
                separately before describing it as complete to the requester.
              </p>
              <div className="flex gap-3">
                <Button disabled={update.isPending} type="submit">
                  Save status
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setActive("")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
export default function PlatformWebsitePage() {
  const { user, loading } = useAuth();
  return (
    <DashboardLayout>
      {loading ? (
        <p role="status">Loading...</p>
      ) : user?.role === "admin" ? (
        <WebsiteAdministration />
      ) : (
        <section className="surface p-6">
          <h1 className="text-xl font-semibold">
            Platform administrator access required
          </h1>
          <p className="mt-3 text-sm">
            A workspace owner or reviewer cannot change EvokeLoop's public
            business details or read the platform inbox.
          </p>
          <a className="mt-4 inline-block text-primary" href="/contact">
            Contact EvokeLoop
          </a>
        </section>
      )}
    </DashboardLayout>
  );
}
