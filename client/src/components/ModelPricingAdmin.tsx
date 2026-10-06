import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { generationModel, generationModels } from "@shared/modelCatalog";
import { defaultCreditPolicy, retailCredits } from "@shared/aiCredits";
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(n);
export function ModelPricingAdmin() {
  const catalog = trpc.models.adminCatalog.useQuery(),
    utils = trpc.useUtils();
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [edit, setEdit] = useState<string | null>(null);
  const [policy, setPolicy] = useState<{
    markupPercent: number;
    creditValueMicros: number;
  } | null>(null);
  const [form, setForm] = useState({
    routeId: "",
    markup: "",
    estimate: "",
    request: "",
    second: "",
  });
  const refresh = () => {
    void utils.models.invalidate();
    void utils.platformAdmin.config.invalidate();
  };
  const savePolicy = trpc.models.savePolicy.useMutation({
    onSuccess: () => {
      toast.success(
        "Pricing defaults saved. Existing usage keeps its original rate."
      );
      setPolicy(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const saveModel = trpc.models.saveModel.useMutation({
    onSuccess: () => {
      toast.success("Model settings saved");
      setEdit(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const setEnabled = trpc.models.setEnabled.useMutation({
    onSuccess: async data => {
      toast.success(
        data.enabled
          ? "Model offered to customers"
          : "Model hidden from customers"
      );
      await utils.models.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const sync = trpc.models.syncAvailability.useMutation({
    onSuccess: data => {
      toast.success(`${data.available.length} OpenAI image models available`);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const currentPolicy = policy ?? catalog.data?.policy ?? defaultCreditPolicy;
  function open(id: string) {
    const m = catalog.data!.models.find(x => x.id === id)!,
      definition = generationModel(m.routeId)!;
    const rate = catalog.data!.rates.find(
      r =>
        r.provider === definition.provider &&
        r.model === definition.providerModel
    )?.config;
    setForm({
      routeId: m.routeId,
      markup: rate?.markupPercent == null ? "" : String(rate.markupPercent),
      estimate:
        rate?.estimatedCostMicros == null
          ? ""
          : String(rate.estimatedCostMicros / 1e6),
      request: rate?.perRequestUsd == null ? "" : String(rate.perRequestUsd),
      second: rate?.perSecondUsd == null ? "" : String(rate.perSecondUsd),
    });
    setEdit(id);
  }
  const edited = generationModel(edit ?? "");
  const routes = edited
    ? edited.id.includes("sunburst") || edited.id.includes("flare")
      ? generationModels.filter(m =>
          m.providerModel.endsWith(
            edited.id.includes("sunburst") ? "sunburst" : "flare"
          )
        )
      : [edited]
    : [];
  return (
    <div className="space-y-6">
      <section className="surface p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Models & credit pricing</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Manage provider routes, wholesale cost estimates, and retail
              markup. Packages allocate credits; these rates determine how many
              each action uses.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? "Checking…" : "Sync OpenAI availability & rates"}
          </Button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span>Default markup (%)</span>
            <Input
              type="number"
              min={0}
              max={1000}
              value={currentPolicy.markupPercent}
              onChange={e =>
                setPolicy({
                  ...currentPolicy,
                  markupPercent: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Retail value of one credit (USD)</span>
            <Input
              type="number"
              min={0.0001}
              max={1}
              step={0.0001}
              value={currentPolicy.creditValueMicros / 1e6}
              onChange={e =>
                setPolicy({
                  ...currentPolicy,
                  creditValueMicros: Math.round(Number(e.target.value) * 1e6),
                })
              }
            />
          </label>
          <div className="rounded-xl bg-violet-500/10 p-3 text-sm">
            <p>Example: $0.20 provider cost</p>
            <strong>
              {money(0.2 * (1 + currentPolicy.markupPercent / 100))} retail ·{" "}
              {currentPolicy.creditValueMicros > 0
                ? retailCredits(200000, currentPolicy)
                : "—"}{" "}
              credits
            </strong>
          </div>
        </div>
        <Button
          className="mt-4"
          disabled={
            !policy ||
            currentPolicy.creditValueMicros < 100 ||
            savePolicy.isPending
          }
          onClick={() => savePolicy.mutate(currentPolicy)}
        >
          Save pricing defaults
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          100% markup doubles cost (50% gross margin before other expenses).
          Individual models can override the default. Credit rounding occurs
          once per action.
        </p>
      </section>
      <section className="surface p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="font-semibold">Package allowances & AI writing</h3>
          <a className="text-sm text-primary underline" href="/admin/tiers">
            Manage package credits
          </a>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Assign a package or grant extra credits in Accounts. Existing
          unassigned workspaces keep their current access.
        </p>
        <div className="mt-3 space-y-2">
          {catalog.data?.rates
            .filter(r => r.kind === "text")
            .map(r => (
              <div key={r.id} className="rounded-xl border p-3 text-sm">
                <strong>{r.model}</strong> · {r.provider}
                <p className="mt-1 text-xs text-muted-foreground">
                  Provider:{" "}
                  {r.config.inputPerMillion == null
                    ? "Unpriced"
                    : money(r.config.inputPerMillion)}{" "}
                  input /{" "}
                  {r.config.outputPerMillion == null
                    ? "Unpriced"
                    : money(r.config.outputPerMillion)}{" "}
                  output per million tokens. Retail uses{" "}
                  {r.config.markupPercent ?? currentPolicy.markupPercent}%
                  markup.
                </p>
              </div>
            ))}
        </div>
        <a
          href="/admin/pricing"
          className="mt-3 inline-block text-xs text-primary underline"
        >
          Manage token rates and request estimates
        </a>
      </section>
      <div className="flex gap-3">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models, makers, or providers…"
        />
        <select
          aria-label="Model type"
          className="rounded-xl border bg-background px-3"
          value={kind}
          onChange={e => setKind(e.target.value)}
        >
          <option value="all">All types</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </div>
      <p className="text-sm text-muted-foreground">
        Offer this model: turn it on to include it in apps and workflows. Turn
        it off to hide it from customer choices and block new generation
        requests. Changes save immediately.
      </p>
      <section className="surface overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {[
                "Model",
                "Offer this model",
                "API provider",
                "Provider cost estimate",
                "Retail / credits",
                "Markup",
                "Availability",
                "",
              ].map((v, i) => (
                <th key={i} className="p-3 font-medium">
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.data?.models
              .filter(
                m =>
                  (kind === "all" || m.kind === kind) &&
                  `${m.name} ${m.maker} ${m.provider} ${m.variant}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
              )
              .map(m => {
                const definition = generationModel(m.routeId)!,
                  rate = catalog.data!.rates.find(
                    r =>
                      r.provider === definition.provider &&
                      r.model === definition.providerModel
                  )?.config;
                const rules = rate?.costRules ?? definition.costRules;
                const min = rules.length
                    ? Math.min(...rules.map(r => r.usd))
                    : null,
                  max = rules.length
                    ? Math.max(...rules.map(r => r.usd))
                    : null;
                const cost =
                  rate?.perRequestUsd ??
                  rate?.perSecondUsd ??
                  (rate?.estimatedCostMicros != null
                    ? rate.estimatedCostMicros / 1e6
                    : definition.provider === "openai"
                      ? 0.2
                      : max);
                const unit =
                  rate?.perSecondUsd != null
                    ? "second"
                    : rate?.perRequestUsd != null
                      ? definition.kind === "image"
                        ? "image"
                        : "request"
                      : (rules[0]?.unit ?? "action");
                const markup =
                  rate?.markupPercent ?? currentPolicy.markupPercent;
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="p-3">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.maker} · {m.variant} · {m.kind}
                      </p>
                    </td>
                    <td className="p-3">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <Switch
                          aria-label={`Offer ${m.name} · ${m.variant}`}
                          checked={m.enabled}
                          disabled={setEnabled.isPending}
                          onCheckedChange={enabled =>
                            setEnabled.mutate({ id: m.id, enabled })
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {setEnabled.isPending &&
                          setEnabled.variables?.id === m.id
                            ? "Saving…"
                            : m.enabled
                              ? "On"
                              : "Off"}
                        </span>
                      </label>
                    </td>
                    <td className="p-3">
                      {m.provider === "openai"
                        ? "OpenAI · Direct"
                        : "Higgsfield"}
                    </td>
                    <td className="p-3">
                      {cost == null
                        ? "Pricing required"
                        : `${money(cost)} / ${unit}`}
                      {definition.provider === "openai" &&
                        rate?.perRequestUsd == null && (
                          <p className="mt-1 max-w-[250px] text-[11px] text-muted-foreground">
                            Token estimate. Per 1M: text input{" "}
                            {rate?.inputPerMillion == null
                              ? "—"
                              : money(rate.inputPerMillion)}
                            ; image input{" "}
                            {rate?.imageInputPerMillion == null
                              ? "—"
                              : money(rate.imageInputPerMillion)}
                            ; image output{" "}
                            {rate?.imageOutputPerMillion == null
                              ? "—"
                              : money(rate.imageOutputPerMillion)}
                            .
                          </p>
                        )}
                      {min != null && min !== max && (
                        <p className="text-[11px] text-muted-foreground">
                          Published range: {money(min)}–{money(max!)}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      {cost == null ? (
                        "Depends on output"
                      ) : (
                        <>
                          {money(cost * (1 + markup / 100))}
                          <p className="text-xs text-muted-foreground">
                            ≈{" "}
                            {retailCredits(cost * 1e6, {
                              ...currentPolicy,
                              markupPercent: markup,
                            })}{" "}
                            credits / {unit}
                          </p>
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      {markup}%
                      {rate?.markupPercent == null && (
                        <p className="text-xs text-muted-foreground">Default</p>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {m.available ? "Available" : m.reason}
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => open(m.id)}
                      >
                        Configure
                      </Button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {catalog.isLoading && (
          <p className="p-5 text-sm">Loading model pricing…</p>
        )}
        {catalog.error && (
          <p className="p-5 text-sm text-destructive">
            {catalog.error.message}
          </p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        OpenAI rates are checked against official pricing daily; actual tokens
        are recorded per request. Higgsfield estimates use verified public list
        prices, excluding promotions and contract discounts. Review your
        provider bill before treating estimates as final costs. Routing changes
        affect new actions only.
      </p>
      <Dialog open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>{edited?.name}</DialogTitle>
          <DialogDescription>
            Set pricing and routing for new requests. Blank overrides use the
            global or published rate.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              if (edit)
                saveModel.mutate({
                  id: edit,
                  routeId: form.routeId,
                  markupPercent:
                    form.markup === "" ? null : Number(form.markup),
                  estimatedCostUsd:
                    form.estimate === "" ? null : Number(form.estimate),
                  perRequestUsd:
                    form.request === "" ? null : Number(form.request),
                  perSecondUsd: form.second === "" ? null : Number(form.second),
                });
            }}
          >
            <label className="block space-y-1 text-sm">
              <span>Provider route</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-2"
                value={form.routeId}
                onChange={e => {
                  const route = generationModel(e.target.value)!,
                    rate = catalog.data!.rates.find(
                      r =>
                        r.provider === route.provider &&
                        r.model === route.providerModel
                    )?.config;
                  setForm({
                    ...form,
                    routeId: e.target.value,
                    markup:
                      rate?.markupPercent == null
                        ? ""
                        : String(rate.markupPercent),
                    estimate:
                      rate?.estimatedCostMicros == null
                        ? ""
                        : String(rate.estimatedCostMicros / 1e6),
                    request:
                      rate?.perRequestUsd == null
                        ? ""
                        : String(rate.perRequestUsd),
                    second:
                      rate?.perSecondUsd == null
                        ? ""
                        : String(rate.perSecondUsd),
                  });
                }}
              >
                {routes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.provider === "openai" ? "OpenAI direct" : "Higgsfield"} ·{" "}
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["markup", "Markup override (%)"],
                ["estimate", "Estimated token-based action cost (USD)"],
                ["request", "Provider cost per image/request override (USD)"],
                ["second", "Provider cost per second override (USD)"],
              ] as const
            )
              .filter(([key]) => key !== "second" || edited?.kind === "video")
              .filter(
                ([key]) =>
                  key !== "estimate" ||
                  generationModel(form.routeId)?.provider === "openai"
              )
              .map(([key, label]) => (
                <label key={key} className="block space-y-1 text-sm">
                  <span>{label}</span>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    placeholder="Use default"
                  />
                </label>
              ))}
            <p className="text-xs text-muted-foreground">
              Per-request cost takes precedence over per-second pricing. Token
              estimates are used for upfront quotes, then reconciled from usage.
              Provider rate changes apply to every model routed through that
              provider endpoint.
            </p>
            <a
              className="block text-xs text-primary underline"
              href={edited?.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Official model documentation
            </a>
            <Button disabled={saveModel.isPending}>Save model settings</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
