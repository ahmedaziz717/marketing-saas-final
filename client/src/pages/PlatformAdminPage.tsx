import { useState } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import PlatformAdminLayout from "@/components/PlatformAdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { presetRange } from "@shared/reportDates";
import { utcCreditMonth, type ProviderRate } from "@shared/platformAdmin";
import { toast } from "sonner";
import { rememberWorkspace } from "@/lib/workspaceSelection";
import { OpenAIBilling } from "@/components/OpenAIBilling";
const field = "w-full rounded-xl border bg-background px-3 py-2";
const usd = (micros: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(micros / 1000000);
function ImagePriceDetails({
  usage,
  rate,
}: {
  usage: Record<string, unknown> | null;
  rate: ProviderRate | null;
}) {
  if (usage?._evokeloop_api !== "images" || !rate) return null;
  const input = usage.input_tokens_details as
    | Record<string, unknown>
    | undefined;
  if (
    typeof input?.text_tokens !== "number" ||
    typeof input?.image_tokens !== "number" ||
    typeof usage.output_tokens !== "number"
  )
    return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Text input: {input.text_tokens.toLocaleString()} tokens × $
      {rate.inputPerMillion ?? "?"}/M · Image input:{" "}
      {input.image_tokens.toLocaleString()} tokens × $
      {rate.imageInputPerMillion ?? "?"}/M · Image output:{" "}
      {usage.output_tokens.toLocaleString()} tokens × $
      {rate.imageOutputPerMillion ?? "?"}/M
      {rate.perRequestUsd !== null
        ? " · Per-request price override applies"
        : ""}
    </p>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        step="any"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
const blankRate: ProviderRate = {
  provider: "openai",
  model: "",
  kind: "text",
  credits: 1,
  inputPerMillion: null,
  cachedInputPerMillion: null,
  outputPerMillion: null,
  perRequestUsd: null,
  note: "",
};
function Administration() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("Overview"),
    [search, setSearch] = useState(""),
    [after, setAfter] = useState<number>(),
    [selected, setSelected] = useState<number>(),
    [range, setRange] = useState(() => presetRange("this_month"));
  const config = trpc.platformAdmin.config.useQuery(),
    accounts = trpc.platformAdmin.accounts.useQuery({ search, after }),
    report = trpc.platformAdmin.report.useQuery({
      range,
      organizationId: selected,
    }),
    details = trpc.platformAdmin.account.useQuery(
      { organizationId: selected! },
      { enabled: !!selected }
    ),
    audit = trpc.platformAdmin.audit.useQuery(undefined, {
      enabled: tab === "Audit",
    });
  const [newAccount, setNewAccount] = useState({
      name: "",
      ownerEmail: "",
      tierId: "trial",
      enforceCredits: true,
    }),
    [invite, setInvite] = useState("");
  const [account, setAccount] = useState({
    tierId: "",
    enforceCredits: false,
    aiPaused: false,
    notes: "",
    reason: "",
  });
  const [grant, setGrant] = useState({
    period: utcCreditMonth(),
    amount: 100,
    reason: "",
  });
  const [tier, setTier] = useState({
    id: "",
    name: "",
    monthlyCredits: 500,
    monthlyPriceUsd: 0,
    reason: "",
  });
  const [rate, setRate] = useState<ProviderRate>(blankRate);
  const [finance, setFinance] = useState({
    kind: "revenue" as "revenue" | "cost",
    amountUsd: 0,
    date: new Date().toISOString().slice(0, 10),
    description: "",
  });
  const refresh = async () => {
    await Promise.all([
      utils.platformAdmin.config.invalidate(),
      utils.platformAdmin.accounts.invalidate(),
      utils.platformAdmin.account.invalidate(),
      utils.platformAdmin.report.invalidate(),
      utils.platformAdmin.audit.invalidate(),
    ]);
  };
  const success = async () => {
      toast.success("Saved");
      await refresh();
    },
    failure = (e: { message: string }) => toast.error(e.message);
  const create = trpc.platformAdmin.createAccount.useMutation({
    onSuccess: async r => {
      setInvite(r.invitePath ? location.origin + r.invitePath : "");
      setNewAccount({ ...newAccount, name: "", ownerEmail: "" });
      toast.success(
        r.invitePath
          ? "Account created. Copy the owner invitation below."
          : "Account created and linked to the existing owner."
      );
      await refresh();
    },
    onError: failure,
  });
  const saveAccount = trpc.platformAdmin.saveAccount.useMutation({
      onSuccess: success,
      onError: failure,
    }),
    adjust = trpc.platformAdmin.adjustCredits.useMutation({
      onSuccess: success,
      onError: failure,
    }),
    saveTier = trpc.platformAdmin.saveTier.useMutation({
      onSuccess: success,
      onError: failure,
    }),
    saveRate = trpc.platformAdmin.saveRate.useMutation({
      onSuccess: success,
      onError: failure,
    }),
    addFinancial = trpc.platformAdmin.addFinancial.useMutation({
      onSuccess: success,
      onError: failure,
    }),
    renew = trpc.platformAdmin.renewInvite.useMutation({
      onSuccess: r => {
        setInvite(location.origin + r.invitePath);
        toast.success("New invitation generated. Previous link is invalid.");
      },
      onError: failure,
    });
  const groups = report.data?.groups ?? [],
    financial = report.data?.financial ?? [];
  const total = (
    key:
      | "requests"
      | "inputTokens"
      | "outputTokens"
      | "costMicros"
      | "unpriced"
      | "credits"
  ) => groups.reduce((s, g) => s + g[key], 0);
  const revenue = financial
      .filter(f => f.kind === "revenue")
      .reduce((s, f) => s + f.amountMicros, 0),
    manualCosts = financial
      .filter(f => f.kind === "cost")
      .reduce((s, f) => s + f.amountMicros, 0),
    cost = total("costMicros") + manualCosts,
    profit = revenue - cost;
  const items = accounts.data?.items ?? [],
    name = (id: number | null) =>
      id === null
        ? "Platform / unattributed"
        : (items.find(a => a.organization.id === id)?.organization.name ??
          `Account #${id}`);
  const selectedItem = items.find(a => a.organization.id === selected);
  function selectAccount(id: number | undefined) {
    setSelected(id);
    const a = items.find(a => a.organization.id === id)?.account;
    setAccount({
      tierId: a?.tierId ?? "",
      enforceCredits: !!a?.enforceCredits,
      aiPaused: !!a?.aiPaused,
      notes: a?.notes ?? "",
      reason: "",
    });
  }
  return (
    <>
      <PageHeader
        eyebrow="Platform administration"
        title="SaaS control panel"
        description="Accounts, AI credits, provider costs and business performance across EvokeLoop."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          "Overview",
          "Accounts",
          "Tiers",
          "Provider rates",
          "Financial entries",
          "Audit",
        ].map(t => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      <p className="mb-5 rounded-xl border p-4 text-sm text-muted-foreground">
        Stripe is not connected. Tier prices are planning values; no customer is
        charged. AI credits are separate from provider tokens. Default rates: 1
        credit per text request and 10 per image request until you configure a
        model override.
      </p>
      {(config.error || accounts.error || report.error) && (
        <p role="alert" className="mb-4 text-destructive">
          {config.error?.message ||
            accounts.error?.message ||
            report.error?.message}
        </p>
      )}
      {["Overview", "Financial entries"].includes(tab) && (
        <div className="mb-5 flex flex-wrap gap-4">
          <DateRangeFilter value={range} onChange={r => r && setRange(r)} />
          <Field label="Account">
            <select
              className={field}
              value={selected ?? ""}
              onChange={e =>
                selectAccount(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
            >
              <option value="">All accounts / platform</option>
              {items.map(a => (
                <option key={a.organization.id} value={a.organization.id}>
                  {a.organization.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {tab === "Overview" && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Provider requests", total("requests").toLocaleString()],
              [
                "Input / output tokens",
                `${total("inputTokens").toLocaleString()} / ${total("outputTokens").toLocaleString()}`,
              ],
              [
                "Calculated account costs",
                total("unpriced") &&
                total("unpriced") === total("requests") &&
                !manualCosts
                  ? "Unavailable"
                  : usd(cost) + (total("unpriced") ? " (partial)" : ""),
              ],
              ["Manually recorded revenue", usd(revenue)],
              [
                "Recorded contribution",
                total("unpriced") ? "Incomplete costs" : usd(profit),
              ],
              [
                "Requests without cost estimates",
                total("unpriced").toLocaleString(),
              ],
              ["Credits used / reserved", total("credits").toLocaleString()],
              [
                "Recorded contribution margin",
                revenue > 0 && !total("unpriced")
                  ? `${((profit / revenue) * 100).toFixed(1)}%`
                  : "—",
              ],
            ].map(([label, value]) => (
              <section key={label} className="surface min-w-0 p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 break-words text-2xl font-semibold">
                  {value}
                </p>
              </section>
            ))}
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            Calculated account costs include AI request estimates and any
            manually recorded expenses. {report.data?.coverage} Contribution is
            revenue minus recorded costs, not audited net profit. Unknown costs
            are excluded, not treated as free.
          </p>
          <section className="surface overflow-x-auto p-5">
            <h2 className="mb-4 text-xl font-semibold">
              Usage by account and provider
            </h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Account",
                    "Provider / model",
                    "Status",
                    "Requests",
                    "Input / output tokens",
                    "Credits",
                    "Known cost",
                    "Unpriced",
                  ].map(h => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{name(g.organizationId)}</td>
                    <td className="p-2">
                      {g.provider}
                      <br />
                      {g.model}
                      <br />
                      {g.kind}
                    </td>
                    <td className="p-2">{g.status}</td>
                    <td className="p-2">{g.requests}</td>
                    <td className="p-2">
                      {g.inputTokens} / {g.outputTokens}
                    </td>
                    <td className="p-2">{g.credits}</td>
                    <td className="p-2">
                      {g.unpriced === g.requests
                        ? "Unavailable"
                        : usd(g.costMicros) + (g.unpriced ? " (partial)" : "")}
                    </td>
                    <td className="p-2">{g.unpriced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!groups.length && (
              <p className="py-5 text-muted-foreground">
                No tracked requests in this period. Historical tokens and costs
                cannot be reconstructed from saved images.
              </p>
            )}
          </section>
          <section className="surface mt-5 p-5">
            <h2 className="text-xl font-semibold">Latest requests</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Pending requests reserve credits. Requests left pending after an
              interruption need investigation; credits can be adjusted with a
              recorded reason.
            </p>
            {report.data?.recent.map(r => (
              <div key={r.id} className="border-t py-3 text-sm">
                <p>
                  {new Date(r.createdAtMs).toLocaleString()} ·{" "}
                  {name(r.organizationId)} · {r.operation} · {r.status}
                </p>
                <p className="text-muted-foreground">
                  {r.provider} / {r.model} ·{" "}
                  {r.costMicros === null
                    ? "Cost unavailable"
                    : usd(r.costMicros)}{" "}
                  · {r.id}
                </p>
                <ImagePriceDetails usage={r.usage} rate={r.rateSnapshot} />
              </div>
            ))}
          </section>
          <div className="mt-6">
            <OpenAIBilling range={range} />
          </div>
        </>
      )}
      {tab === "Accounts" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="surface min-w-0 p-5">
            <h2 className="mb-4 text-xl font-semibold">All accounts</h2>
            <Input
              aria-label="Search accounts"
              placeholder="Search account or owner email"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setAfter(undefined);
              }}
            />
            <div className="my-4 space-y-2">
              {items.map(a => (
                <button
                  key={a.organization.id}
                  className={`w-full rounded-xl border p-4 text-left ${selected === a.organization.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => selectAccount(a.organization.id)}
                >
                  <p className="font-medium">
                    {a.organization.name} · #{a.organization.id}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {a.tier?.name ?? "No tier"} ·{" "}
                    {a.account?.enforceCredits
                      ? "Credit limits enabled"
                      : "Tracking only"}
                    {a.account?.aiPaused ? " · AI paused" : ""}
                  </p>
                  <p className="break-all text-sm">{a.account?.ownerEmail}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {after && (
                <Button variant="outline" onClick={() => setAfter(undefined)}>
                  First page
                </Button>
              )}
              {accounts.data?.next && (
                <Button
                  variant="outline"
                  onClick={() => setAfter(accounts.data!.next)}
                >
                  Next accounts
                </Button>
              )}
            </div>
            <h2 className="mb-4 mt-8 text-xl font-semibold">Create account</h2>
            <form
              className="space-y-3"
              onSubmit={e => {
                e.preventDefault();
                create.mutate(newAccount);
              }}
            >
              <Field label="Company / account name">
                <Input
                  required
                  value={newAccount.name}
                  onChange={e =>
                    setNewAccount({ ...newAccount, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Owner email">
                <Input
                  required
                  type="email"
                  value={newAccount.ownerEmail}
                  onChange={e =>
                    setNewAccount({ ...newAccount, ownerEmail: e.target.value })
                  }
                />
              </Field>
              <Field label="Tier">
                <select
                  className={field}
                  value={newAccount.tierId}
                  onChange={e =>
                    setNewAccount({ ...newAccount, tierId: e.target.value })
                  }
                >
                  {config.data?.tiers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newAccount.enforceCredits}
                  onChange={e =>
                    setNewAccount({
                      ...newAccount,
                      enforceCredits: e.target.checked,
                    })
                  }
                />
                Enforce AI credit limit
              </label>
              <Button disabled={create.isPending}>Create account</Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Existing users are linked as owners. New users receive a copyable,
              email-bound invitation valid for 7 days. No email is sent
              automatically.
            </p>
            {invite && (
              <div className="mt-4 rounded-xl border p-3">
                <p className="mb-2 text-sm">Owner invitation</p>
                <Input readOnly value={invite} />
                <Button
                  className="mt-2"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(invite)
                      .then(() => toast.success("Copied"))
                      .catch(() =>
                        toast.error("Select and copy the link manually")
                      )
                  }
                >
                  Copy link
                </Button>
              </div>
            )}
          </section>
          <section className="surface min-w-0 p-5">
            {selectedItem ? (
              <>
                <h2 className="mb-4 text-xl font-semibold">
                  {selectedItem.organization.name}
                </h2>
                <form
                  className="space-y-3"
                  onSubmit={e => {
                    e.preventDefault();
                    saveAccount.mutate({
                      organizationId: selected!,
                      ...account,
                      tierId: account.tierId || null,
                    });
                  }}
                >
                  <Field label="Tier">
                    <select
                      className={field}
                      value={account.tierId}
                      onChange={e =>
                        setAccount({ ...account, tierId: e.target.value })
                      }
                    >
                      <option value="">No tier</option>
                      {config.data?.tiers.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={account.enforceCredits}
                      onChange={e =>
                        setAccount({
                          ...account,
                          enforceCredits: e.target.checked,
                        })
                      }
                    />
                    Enforce credit limits
                  </label>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={account.aiPaused}
                      onChange={e =>
                        setAccount({ ...account, aiPaused: e.target.checked })
                      }
                    />
                    Pause new AI requests
                  </label>
                  <Field label="Internal notes">
                    <textarea
                      className={field}
                      value={account.notes}
                      onChange={e =>
                        setAccount({ ...account, notes: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Reason for change">
                    <Input
                      required
                      minLength={3}
                      value={account.reason}
                      onChange={e =>
                        setAccount({ ...account, reason: e.target.value })
                      }
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Tier changes apply immediately to this month's allowance.
                    They do not erase usage or grants.
                  </p>
                  <Button disabled={saveAccount.isPending}>Save account</Button>
                </form>
                {selectedItem.account?.invitationPending && (
                  <Button
                    variant="outline"
                    className="mt-3"
                    disabled={renew.isPending}
                    onClick={() => renew.mutate({ organizationId: selected! })}
                  >
                    Renew owner invitation
                  </Button>
                )}
                <h3 className="mb-3 mt-8 text-lg font-semibold">AI credits</h3>
                <p className="mb-3 text-sm">
                  {details.data?.period}: {details.data?.remaining ?? "—"}{" "}
                  remaining · {details.data?.allowance ?? 0} tier allowance.
                  Grants expire at the end of their UTC calendar month.
                </p>
                <form
                  className="space-y-3"
                  onSubmit={e => {
                    e.preventDefault();
                    adjust.mutate({
                      organizationId: selected!,
                      ...grant,
                      requestId: crypto.randomUUID(),
                    });
                  }}
                >
                  <Field label="Credit month (UTC)">
                    <Input
                      type="month"
                      required
                      value={grant.period}
                      onChange={e =>
                        setGrant({ ...grant, period: e.target.value })
                      }
                    />
                  </Field>
                  <NumberField
                    label="Credit adjustment (+ grant / − remove)"
                    value={grant.amount}
                    onChange={amount => setGrant({ ...grant, amount })}
                  />
                  <Field label="Reason">
                    <Input
                      required
                      minLength={3}
                      value={grant.reason}
                      onChange={e =>
                        setGrant({ ...grant, reason: e.target.value })
                      }
                    />
                  </Field>
                  <Button disabled={adjust.isPending}>
                    Apply credit adjustment
                  </Button>
                </form>
                <h3 className="mt-8 font-semibold">Members</h3>
                {details.data?.members.map((m, i) => (
                  <p key={i} className="mt-2 break-all text-sm">
                    {m.email} · {m.role} · {m.status}
                  </p>
                ))}
                <h3 className="mt-6 font-semibold">Recent credit ledger</h3>
                {details.data?.ledger.map(l => (
                  <p key={l.id} className="mt-2 text-sm">
                    {l.period} · {l.amount > 0 ? "+" : ""}
                    {l.amount} · {l.reason}
                  </p>
                ))}
              </>
            ) : (
              <p>
                Select an account to manage its tier, credits and AI access.
              </p>
            )}
          </section>
        </div>
      )}
      {tab === "Tiers" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="surface p-5">
            <h2 className="text-xl font-semibold">Tier definitions</h2>
            <p className="my-3 text-sm text-muted-foreground">
              Initial credit amounts are editable starting points. Prices start
              at $0 and are planning values only. Editing a tier changes the
              allowance for all assigned accounts immediately.
            </p>
            {config.data?.tiers.map(t => (
              <button
                key={t.id}
                className="mb-3 block w-full rounded-xl border p-4 text-left"
                onClick={() =>
                  setTier({
                    id: t.id,
                    name: t.name,
                    monthlyCredits: t.monthlyCredits,
                    monthlyPriceUsd: t.monthlyPriceMicros / 1000000,
                    reason: "",
                  })
                }
              >
                {t.name} · {t.monthlyCredits} credits/month ·{" "}
                {usd(t.monthlyPriceMicros)}/month
              </button>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setTier({
                  id: "",
                  name: "",
                  monthlyCredits: 500,
                  monthlyPriceUsd: 0,
                  reason: "",
                })
              }
            >
              New tier
            </Button>
          </section>
          <form
            className="surface space-y-3 p-5"
            onSubmit={e => {
              e.preventDefault();
              saveTier.mutate(tier);
            }}
          >
            <Field label="Tier ID">
              <Input
                required
                pattern="[a-z][a-z0-9_-]{1,40}"
                value={tier.id}
                onChange={e => setTier({ ...tier, id: e.target.value })}
              />
            </Field>
            <Field label="Display name">
              <Input
                required
                value={tier.name}
                onChange={e => setTier({ ...tier, name: e.target.value })}
              />
            </Field>
            <NumberField
              label="Monthly AI credits"
              value={tier.monthlyCredits}
              onChange={monthlyCredits => setTier({ ...tier, monthlyCredits })}
            />
            <NumberField
              label="Planned monthly price (USD)"
              value={tier.monthlyPriceUsd}
              onChange={monthlyPriceUsd =>
                setTier({ ...tier, monthlyPriceUsd })
              }
            />
            <Field label="Reason">
              <Input
                required
                minLength={3}
                value={tier.reason}
                onChange={e => setTier({ ...tier, reason: e.target.value })}
              />
            </Field>
            <Button disabled={saveTier.isPending}>Save tier</Button>
          </form>
        </div>
      )}
      {tab === "Provider rates" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="surface min-w-0 p-5">
            <h2 className="text-xl font-semibold">Provider cost estimates</h2>
            <p className="my-3 text-sm text-muted-foreground">
              Verified standard rates are configured for the models we use. Each
              request is priced from its recorded tokens and assigned to its
              account. Image requests use separate text-input, image-input and
              image-output rates. You can override rates for a provider
              agreement. Blank rates mean unknown, not zero. Edits apply to
              future requests; historical estimates retain their pricing
              snapshot.
            </p>
            {config.data?.rates.map(r => (
              <button
                key={r.id}
                className="mb-3 block w-full break-words rounded-xl border p-4 text-left"
                onClick={() => setRate(r.config)}
              >
                {r.provider} / {r.model} · {r.kind} · {r.config.credits} credits
              </button>
            ))}
            <h3 className="mt-5 font-semibold">
              Models observed in this report
            </h3>
            {Array.from(
              new Map(
                groups.map(g => [`${g.provider}/${g.model}/${g.kind}`, g])
              ).values()
            ).map(g => (
              <button
                key={`${g.provider}/${g.model}/${g.kind}`}
                className="mt-3 block break-all text-left text-sm text-primary"
                onClick={() =>
                  setRate({
                    ...blankRate,
                    provider: g.provider,
                    model: g.model,
                    kind: g.kind as ProviderRate["kind"],
                    credits: g.kind === "image" ? 10 : 1,
                  })
                }
              >
                {g.provider} / {g.model} · configure
              </button>
            ))}
          </section>
          <form
            className="surface space-y-3 p-5"
            onSubmit={e => {
              e.preventDefault();
              saveRate.mutate(rate);
            }}
          >
            <Field label="Provider">
              <Input
                required
                value={rate.provider}
                onChange={e => setRate({ ...rate, provider: e.target.value })}
              />
            </Field>
            <Field label="Exact model ID">
              <Input
                required
                value={rate.model}
                onChange={e => setRate({ ...rate, model: e.target.value })}
              />
            </Field>
            <Field label="Request type">
              <select
                className={field}
                value={rate.kind}
                onChange={e =>
                  setRate({
                    ...rate,
                    kind: e.target.value as ProviderRate["kind"],
                  })
                }
              >
                <option>text</option>
                <option>image</option>
                <option>other</option>
              </select>
            </Field>
            <NumberField
              label="AI credits per request"
              value={rate.credits}
              onChange={credits => setRate({ ...rate, credits })}
            />
            {(
              [
                "inputPerMillion",
                "cachedInputPerMillion",
                "outputPerMillion",
                "perRequestUsd",
                "imageInputPerMillion",
                "imageOutputPerMillion",
              ] as const
            ).map((key, i) => (
              <Field
                key={key}
                label={
                  [
                    "USD per million text input tokens",
                    "USD per million cached text input tokens (text requests)",
                    "USD per million text output tokens",
                    "USD per request (overrides token estimate)",
                    "USD per million image input tokens (Images API)",
                    "USD per million image output tokens (Images API)",
                  ][i]
                }
              >
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={rate[key] ?? ""}
                  placeholder="Unknown"
                  onChange={e =>
                    setRate({
                      ...rate,
                      [key]:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Long-context threshold (input tokens; blank disables)">
              <Input
                type="number"
                min="1"
                step="1"
                value={rate.longContextThreshold ?? ""}
                onChange={e =>
                  setRate({
                    ...rate,
                    longContextThreshold: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
            <NumberField
              label="Long-context input price multiplier"
              value={rate.longContextInputMultiplier ?? 1}
              onChange={longContextInputMultiplier =>
                setRate({ ...rate, longContextInputMultiplier })
              }
            />
            <NumberField
              label="Long-context output price multiplier"
              value={rate.longContextOutputMultiplier ?? 1}
              onChange={longContextOutputMultiplier =>
                setRate({ ...rate, longContextOutputMultiplier })
              }
            />
            <Field label="Rate source / notes">
              <textarea
                className={field}
                value={rate.note}
                onChange={e => setRate({ ...rate, note: e.target.value })}
              />
            </Field>
            <Button disabled={saveRate.isPending}>Save provider rate</Button>
          </form>
        </div>
      )}
      {tab === "Financial entries" && (
        <section className="surface max-w-4xl p-5">
          <h2 className="text-xl font-semibold">
            Record revenue or other costs
          </h2>
          <p className="my-3 text-sm text-muted-foreground">
            For {selected ? name(selected) : "the overall platform"}. Record
            receipts, hosting, email, or other tool costs. Do not duplicate AI
            costs already tracked automatically. Use a negative entry with an
            explanation to correct a previous entry.
          </p>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={e => {
              e.preventDefault();
              addFinancial.mutate({
                ...finance,
                organizationId: selected ?? null,
                requestId: crypto.randomUUID(),
              });
            }}
          >
            <Field label="Entry type">
              <select
                className={field}
                value={finance.kind}
                onChange={e =>
                  setFinance({
                    ...finance,
                    kind: e.target.value as "revenue" | "cost",
                  })
                }
              >
                <option value="revenue">Revenue received</option>
                <option value="cost">Other cost</option>
              </select>
            </Field>
            <NumberField
              label="Amount (USD)"
              value={finance.amountUsd}
              onChange={amountUsd => setFinance({ ...finance, amountUsd })}
            />
            <Field label="Date (UTC)">
              <Input
                type="date"
                required
                value={finance.date}
                onChange={e => setFinance({ ...finance, date: e.target.value })}
              />
            </Field>
            <Field label="Description / reference">
              <Input
                required
                minLength={3}
                value={finance.description}
                onChange={e =>
                  setFinance({ ...finance, description: e.target.value })
                }
              />
            </Field>
            <Button disabled={addFinancial.isPending}>Record entry</Button>
          </form>
          <h3 className="mt-8 font-semibold">
            Recent entries in selected period
          </h3>
          {report.data?.entries.map(e => (
            <p key={e.id} className="mt-3 text-sm">
              {new Date(e.occurredAtMs).toISOString().slice(0, 10)} ·{" "}
              {name(e.organizationId)} · {e.kind} · {usd(e.amountMicros)} ·{" "}
              {e.description}
            </p>
          ))}
        </section>
      )}
      {tab === "Audit" && (
        <section className="surface overflow-x-auto p-5">
          <h2 className="mb-4 text-xl font-semibold">
            Platform change history
          </h2>
          {audit.data?.map(e => (
            <article key={e.id} className="border-t py-3 text-sm">
              <p>
                {new Date(e.createdAtMs).toLocaleString()} · User #
                {e.actorUserId} · {e.action} · {name(e.organizationId)}
              </p>
              <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
export default function PlatformAdminPage() {
  return (
    <PlatformAdminLayout>
      <Administration />
    </PlatformAdminLayout>
  );
}
export function AccountInvitePage() {
  const { user } = useAuth();
  const [, params] = useRoute("/account-invite/:token");
  const accept = trpc.platformAdmin.acceptAccount.useMutation({
    onSuccess: r => {
      if (user) rememberWorkspace(user.id, r.organizationId);
      window.location.assign("/app");
    },
    onError: e => toast.error(e.message),
  });
  return (
    <DashboardLayout>
      <section className="surface mx-auto max-w-xl p-8">
        <h1 className="text-3xl font-semibold">Activate your account</h1>
        <p className="my-4">
          Sign in with the invited email address, then accept ownership of your
          EvokeLoop account.
        </p>
        <Button
          disabled={accept.isPending || !params?.token}
          onClick={() =>
            params?.token && accept.mutate({ token: params.token })
          }
        >
          Accept account invitation
        </Button>
      </section>
    </DashboardLayout>
  );
}
