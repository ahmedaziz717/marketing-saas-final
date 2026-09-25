import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { Integrations } from "./IntegrationsPage";
import { BillingUsage } from "@/components/BillingUsage";
import { Activity } from "./ActivityPage";
import {
  History,
  Building2,
  Users,
  CreditCard,
  Bell,
  Shield,
  Database,
  Plug,
  Copy,
  Mail,
  Plus,
  X,
} from "lucide-react";

type Role = "admin" | "creator" | "reviewer" | "publisher";
const sections = [
  { id: "company", label: "Company & brand", icon: Building2 },
  { id: "team", label: "Team & access", icon: Users },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "activity", label: "Activity & audit log", icon: History },
  { id: "billing", label: "Billing & Usage", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Data & privacy", icon: Database },
] as const;
const planned = {
  billing: [
    [
      "Plan & subscription",
      "Compare plans and manage renewal or cancellation.",
    ],
    [
      "Usage & limits",
      "Track creative generations, storage, team seats, and catalog items.",
    ],
    [
      "Invoices & payment methods",
      "Manage billing details, payment methods, and receipts.",
    ],
  ],
  notifications: [
    [
      "Approvals & collaboration",
      "Choose updates for reviews, comments, and invitations.",
    ],
    [
      "Jobs & integrations",
      "Choose alerts for completed generations, sync failures, and disconnected accounts.",
    ],
    [
      "Delivery preferences",
      "Manage email, in-app notifications, and digest frequency.",
    ],
  ],
  security: [
    [
      "Sign-in & sessions",
      "Review active sessions and manage sign-in security.",
    ],
    [
      "Multi-factor authentication",
      "Add a second verification step and workspace requirements.",
    ],
    ["Single sign-on", "Configure company identity providers when available."],
  ],
  data: [
    [
      "Export workspace data",
      "Download your catalog, content, and workspace records.",
    ],
    [
      "Retention & deletion",
      "Manage retention and request workspace deletion.",
    ],
    [
      "Privacy & consent",
      "Manage consent preferences and data-processing details.",
    ],
  ],
};
function RoleSelect({
  value,
  onChange,
  owner,
  disabled,
}: {
  value: Role;
  onChange: (v: Role) => void;
  owner: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Workspace role"
      className="rounded-xl border bg-background p-2 text-sm"
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value as Role)}
    >
      {(owner
        ? ["admin", "creator", "reviewer", "publisher"]
        : ["creator", "reviewer", "publisher"]
      ).map(r => (
        <option key={r} value={r}>
          {r[0].toUpperCase() + r.slice(1)}
        </option>
      ))}
    </select>
  );
}
function Settings() {
  const { user: platformUser } = useAuth();
  const { organizationId, organization, membership } = useWorkspace();
  const [location, navigate] = useLocation();
  const requestedSection = location.split("/").at(-1);
  const section = sections.some(s => s.id === requestedSection)
    ? requestedSection!
    : "team";
  const setSection = (id: string) => navigate(`/app/settings/${id}`);
  const [teamTab, setTeamTab] = useState("members");
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("creator");
  const [delivery, setDelivery] = useState("email");
  const [ready, setReady] = useState<{ url: string; email: string } | null>(
    null
  );
  const [confirmation, setConfirmation] = useState<{
    memberId: number;
    name: string;
    role?: Role;
    remove: boolean;
  } | null>(null);
  const manager = membership?.role === "owner" || membership?.role === "admin";
  const owner = membership?.role === "owner";
  const input = { organizationId: organizationId! };
  const members = trpc.workspace.members.useQuery(input, {
    enabled: !!organizationId,
  });
  const invites = trpc.workspace.invites.useQuery(input, {
    enabled: !!organizationId && manager,
  });
  const utils = trpc.useUtils();
  const refresh = () => {
    void utils.workspace.members.invalidate();
    void utils.workspace.invites.invalidate();
  };
  const error = (e: { message: string }) => toast.error(e.message);
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invitation link copied");
    } catch {
      toast.error("Copy failed. Select and copy the link below.");
    }
  }
  function compose(url: string, recipient: string) {
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Join ${organization?.name} on EvokeLoop`)}&body=${encodeURIComponent(`You are invited to join ${organization?.name} on EvokeLoop. Sign in with ${recipient} to accept your invitation:\n\n${url}\n\nThis invitation expires in seven days.`)}`;
  }
  const invite = trpc.workspace.createInvite.useMutation({
    onSuccess: (data, variables) => {
      setReady({ url: data.inviteUrl, email: variables.email });
      setShowInvite(true);
      refresh();
      toast.success(
        "Invitation created. Share the link to invite your teammate."
      );
    },
    onError: error,
  });
  const manage = trpc.workspace.manageInvite.useMutation({
    onSuccess: data => {
      refresh();
      if (data.inviteUrl) {
        setReady({ url: data.inviteUrl, email: "" });
        setShowInvite(true);
        void copy(data.inviteUrl);
      } else toast.success("Invitation revoked");
    },
    onError: error,
  });
  const update = trpc.workspace.updateMember.useMutation({
    onSuccess: () => {
      refresh();
      setConfirmation(null);
      toast.success("Team updated");
    },
    onError: error,
  });
  function create(recipient = email, inviteRole = role) {
    invite.mutate({
      ...input,
      email: recipient,
      role: inviteRole,
      origin: window.location.origin,
    });
  }
  return (
    <>
      <PageHeader
        eyebrow="Workspace administration"
        title="Settings"
        description="Manage your company, people, and workspace preferences."
      />
      {platformUser?.role === "admin" && (
        <div className="mb-5 rounded-xl border p-4 text-sm">
          <a className="font-medium text-primary" href="/app/platform/website">
            Platform website &amp; public requests
          </a>
          <p className="mt-1 text-muted-foreground">
            Manage EvokeLoop's public company information and support/privacy inbox.
            Platform administrator only.
          </p>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="space-y-1">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm ${section === id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"}`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
          {section === "billing" ? (
            <BillingUsage />
          ) : section === "integrations" ? (
            <Integrations />
          ) : section === "activity" ? (
            <Activity />
          ) : section === "team" ? (
            <>
              <section className="surface p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Team & access</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {organization?.name} · Your role: {membership?.role}
                    </p>
                  </div>
                  {manager && (
                    <Button
                      onClick={() => {
                        setReady(null);
                        setShowInvite(true);
                      }}
                    >
                      <Plus size={16} className="mr-2" />
                      Invite teammate
                    </Button>
                  )}
                </div>
                <div
                  className="mt-6 flex flex-wrap gap-2"
                  role="tablist"
                  aria-label="Team settings"
                >
                  {[
                    "members",
                    ...(manager ? ["invitations"] : []),
                    "permissions",
                  ].map(tab => (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={teamTab === tab}
                      onClick={() => setTeamTab(tab)}
                      className={`rounded-full px-4 py-2 text-sm ${teamTab === tab ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {tab[0].toUpperCase() + tab.slice(1)}
                      {tab === "members" && members.data
                        ? ` (${members.data.length})`
                        : tab === "invitations" && invites.data
                          ? ` (${invites.data.length})`
                          : ""}
                    </button>
                  ))}
                </div>
                {teamTab === "members" && (
                  <div className="mt-5 space-y-3">
                    {members.isLoading && <p>Loading members…</p>}
                    {members.error && (
                      <p role="alert">
                        Unable to load members.{" "}
                        <button onClick={() => members.refetch()}>Retry</button>
                      </p>
                    )}
                    {members.data?.map(item => {
                      const editable =
                        manager &&
                        item.membership.role !== "owner" &&
                        item.membership.userId !== membership?.userId &&
                        (owner || item.membership.role !== "admin");
                      return (
                        <div
                          key={item.membership.id}
                          className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/50 p-4"
                        >
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-background font-semibold">
                            {(item.user.name ||
                              item.user.email ||
                              "U")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {item.user.name || item.user.email}
                              {item.membership.userId === membership?.userId &&
                                " (you)"}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {item.user.email}
                            </p>
                          </div>
                          {editable ? (
                            <>
                              <RoleSelect
                                value={item.membership.role as Role}
                                owner={owner}
                                disabled={update.isPending}
                                onChange={next =>
                                  setConfirmation({
                                    memberId: item.membership.id,
                                    name: item.user.email || "this member",
                                    role: next,
                                    remove: false,
                                  })
                                }
                              />
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setConfirmation({
                                    memberId: item.membership.id,
                                    name: item.user.email || "this member",
                                    remove: true,
                                  })
                                }
                              >
                                Remove
                              </Button>
                            </>
                          ) : (
                            <span className="rounded-full border px-3 py-1 text-sm capitalize">
                              {item.membership.role}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground">
                      Removing a member revokes workspace access and their
                      pending invitations. Their existing content remains.
                      Ownership transfer is not available yet.
                    </p>
                  </div>
                )}
                {teamTab === "invitations" && manager && (
                  <div className="mt-5 space-y-3">
                    {invites.isLoading && <p>Loading invitations…</p>}
                    {invites.error && (
                      <p role="alert">
                        Unable to load invitations.{" "}
                        <button onClick={() => invites.refetch()}>Retry</button>
                      </p>
                    )}
                    {invites.data?.length === 0 && (
                      <p className="rounded-xl bg-muted p-6 text-muted-foreground">
                        No pending invitations. Invite a teammate to get
                        started.
                      </p>
                    )}
                    {invites.data?.map(item => (
                      <div key={item.id} className="rounded-2xl border p-4">
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <p className="font-medium">{item.email}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {item.role} ·{" "}
                              {item.expiresAtMs <= Date.now()
                                ? "Expired"
                                : `Pending · expires ${new Date(item.expiresAtMs).toLocaleDateString()}`}
                            </p>
                          </div>
                          {(owner || item.role !== "admin") && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                disabled={
                                  manage.isPending ||
                                  item.expiresAtMs <= Date.now()
                                }
                                onClick={() =>
                                  manage.mutate({
                                    ...input,
                                    inviteId: item.id,
                                    action: "copy",
                                    origin: window.location.origin,
                                  })
                                }
                              >
                                Copy link
                              </Button>
                              <Button
                                variant="outline"
                                disabled={invite.isPending}
                                onClick={() => {
                                  setDelivery("email");
                                  create(item.email, item.role);
                                }}
                              >
                                Renew & resend
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={manage.isPending}
                                onClick={() =>
                                  manage.mutate({
                                    ...input,
                                    inviteId: item.id,
                                    action: "revoke",
                                    origin: window.location.origin,
                                  })
                                }
                              >
                                Revoke
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Renewing creates a fresh seven-day invitation and
                      invalidates the previous link. Resend opens a message for
                      you to send in your email app.
                    </p>
                  </div>
                )}
                {teamTab === "permissions" && (
                  <div className="mt-5 space-y-6">
                    <div>
                      <h3 className="font-semibold">Workspace roles</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Existing roles are enforced by the server. Owners manage
                        administrators; administrators manage creators,
                        reviewers, and publishers.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        [
                          "Owner",
                          "Full workspace administration; protected from removal and demotion here.",
                        ],
                        [
                          "Admin",
                          "Workspace administration, invitations, content creation, and review.",
                        ],
                        [
                          "Creator",
                          "Create and edit content within the current role workflow.",
                        ],
                        [
                          "Reviewer",
                          "Review and approve content within the current role workflow.",
                        ],
                        [
                          "Publisher",
                          "Publishing responsibilities within the current role workflow.",
                        ],
                      ].map(([name, detail]) => (
                        <div key={name} className="rounded-xl border p-4">
                          <h4 className="font-medium">{name}</h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {detail}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl bg-muted/60 p-5">
                      <h3 className="font-semibold">
                        Custom section permissions{" "}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Planned
                        </span>
                      </h3>
                      <p className="my-3 text-sm text-muted-foreground">
                        Future custom roles will let you grant access by
                        section. These controls are not enabled or enforced yet.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr>
                              <th className="py-2">Section</th>
                              <th>Planned access levels</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              "Catalog",
                              "Brand & assets",
                              "Briefs & creatives",
                              "Reviews & approvals",
                              "Publishing",
                              "Integrations",
                              "Team & billing",
                            ].map(name => (
                              <tr key={name} className="border-t">
                                <td className="py-3 pr-4">{name}</td>
                                <td className="text-muted-foreground">
                                  No access · View · Manage
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Create, approve, publish, connect accounts, and manage
                        billing will be separate permissions. Role presets will
                        provide the starting point.
                      </p>
                    </div>
                  </div>
                )}
              </section>
              {showInvite && manager && (
                <section className="surface p-6" aria-label="Invite teammate">
                  <div className="flex justify-between">
                    <h3 className="text-lg font-semibold">Invite teammate</h3>
                    <Button
                      aria-label="Close invitation form"
                      variant="ghost"
                      onClick={() => setShowInvite(false)}
                    >
                      <X size={18} />
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Invitations are tied to an email address and expire after
                    seven days.
                  </p>
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      create();
                    }}
                    className="mt-5 space-y-4"
                  >
                    <div>
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="teammate@company.com"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <Label>Role</Label>
                      <RoleSelect
                        value={role}
                        onChange={setRole}
                        owner={owner}
                      />
                    </div>
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium">
                        Share invitation
                      </legend>
                      <div className="flex flex-wrap gap-4">
                        {[
                          ["email", "Email app"],
                          ["link", "Copy link"],
                        ].map(([value, label]) => (
                          <label
                            key={value}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="radio"
                              name="delivery"
                              value={value}
                              checked={delivery === value}
                              onChange={() => setDelivery(value)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <p className="text-xs text-muted-foreground">
                      Email opens a prefilled message in your own email app.
                      Automatic email delivery will be connected later.
                    </p>
                    <Button type="submit" disabled={invite.isPending}>
                      {invite.isPending ? "Creating…" : "Create invitation"}
                    </Button>
                  </form>
                  {ready && (
                    <div className="mt-5 rounded-xl bg-muted p-4">
                      <Label htmlFor="ready-link">Invitation ready</Label>
                      <Input
                        id="ready-link"
                        readOnly
                        value={ready.url}
                        onFocus={e => e.target.select()}
                        className="my-3"
                      />
                      <div className="flex flex-wrap gap-2">
                        {delivery === "email" && ready.email && (
                          <Button
                            onClick={() => compose(ready.url, ready.email)}
                          >
                            <Mail size={16} className="mr-2" />
                            Open email to send
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => copy(ready.url)}
                        >
                          <Copy size={16} className="mr-2" />
                          Copy link
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {confirmation && (
                <section
                  role="alertdialog"
                  aria-label="Confirm member change"
                  className="surface border-destructive/40 p-6"
                >
                  <h3 className="font-semibold">
                    {confirmation.remove
                      ? "Remove workspace access?"
                      : "Change workspace role?"}
                  </h3>
                  <p className="my-3 text-sm">
                    {confirmation.name}
                    {confirmation.remove
                      ? " will lose access to this workspace immediately."
                      : ` will become a ${confirmation.role}.`}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      disabled={update.isPending}
                      variant={confirmation.remove ? "destructive" : "default"}
                      onClick={() =>
                        update.mutate({
                          ...input,
                          memberId: confirmation.memberId,
                          role: confirmation.role,
                          remove: confirmation.remove,
                        })
                      }
                    >
                      Confirm {confirmation.remove ? "removal" : "role change"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmation(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </section>
              )}
            </>
          ) : section === "company" ? (
            <section className="surface p-6">
              <h2 className="text-xl font-semibold">Company & brand</h2>
              <div className="my-6 rounded-xl bg-muted p-5">
                <p className="text-sm text-muted-foreground">Workspace name</p>
                <p className="mt-1 font-medium">{organization?.name}</p>
              </div>
              <Link href="~/app/brand" className="text-primary underline">
                Manage brand identity and saved assets ↗
              </Link>
              <p className="mt-5 text-sm text-muted-foreground">
                Planned: company profile, business type, locale, time zone,
                currency, and workspace name editing.
              </p>
            </section>
          ) : (
            <section className="surface p-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">
                  {sections.find(s => s.id === section)?.label}
                </h2>
                <span className="rounded-full bg-muted px-3 py-1 text-xs">
                  Planned
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Settings structure only. These preferences are not connected
                yet.
              </p>
              <div className="mt-6 space-y-4">
                {planned[section as keyof typeof planned]?.map(
                  ([title, description]) => (
                    <div key={title} className="rounded-xl border p-5">
                      <h3 className="font-medium">{title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  )
                )}
              </div>
              {section === "security" && (
                <Link
                  href="~/app/settings/activity"
                  className="mt-6 inline-block text-primary underline"
                >
                  View workspace activity ↗
                </Link>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
export default function SettingsPage() {
  return (
    <WorkspaceGate>
      <Settings />
    </WorkspaceGate>
  );
}
