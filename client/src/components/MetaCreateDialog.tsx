import { useEffect, useState } from "react";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  metaChangeSchema,
  metaObjectives,
  metaGoals,
  metaPlacementOptions,
  metaConversionEvents,
  type MetaChange,
} from "@shared/metaManagement";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { channelInput } from "./ChannelConnections";

export function MetaCreateDialog({
  connectionId,
  kind,
  campaignId,
  onClose,
  onSaved,
}: {
  connectionId: string;
  kind: "create_campaign" | "create_adset";
  campaignId?: string;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const { organizationId } = useWorkspace();
  const scope = { organizationId: organizationId!, connectionId };
  const isCampaign = kind === "create_campaign";
  const connections = trpc.channels.connections.useQuery({
    organizationId: organizationId!,
  });
  const connection = connections.data?.items.find(c => c.id === connectionId);
  const parent = trpc.channels.metaObject.useQuery(
    { ...scope, kind: "campaign", objectId: campaignId || "1" },
    { enabled: !isCampaign && !!campaignId, retry: false }
  );
  const pixels = trpc.channels.metaPixels.useQuery(scope, {
    enabled: !isCampaign,
    retry: false,
  });
  const audiences = trpc.channels.metaAudiences.useQuery(scope, {
    enabled: !isCampaign,
    retry: false,
  });
  const [form, setForm] = useState<MetaChange>(() =>
    metaChangeSchema.parse({
      kind,
      name: "New campaign",
      campaignId,
      ...(isCampaign
        ? {}
        : {
            name: "New ad set",
            countries: ["US"],
            audienceMode: "advantage",
            placements: "automatic",
          }),
    })
  );
  const [countries, setCountries] = useState("US");
  const [budgetType, setBudgetType] = useState("daily");
  const [budget, setBudget] = useState("");
  const [bid, setBid] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState<MetaChange | null>(null);
  const objective = isCampaign
    ? form.objective
    : String(parent.data?.object.objective ?? "");
  const goals = metaGoals[objective] ?? [];
  const cbo =
    !isCampaign &&
    Number(
      parent.data?.object.daily_budget || parent.data?.object.lifetime_budget
    ) > 0;
  const goal = form.optimizationGoal ?? goals[0]?.[0];
  const strategy = cbo
    ? String(parent.data?.object.bid_strategy || "LOWEST_COST_WITHOUT_CAP")
    : (form.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP");
  const special =
    !isCampaign && parent.data?.object.special_ad_categories?.length > 0;
  const currency = connection?.details.currency || "USD";
  const managerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${connection?.accountId ?? ""}`;
  const patch = (value: Partial<MetaChange>) =>
    setForm(current => ({ ...current, ...value }));
  useEffect(() => {
    if (objective && !isCampaign)
      patch({
        optimizationGoal: undefined,
        conversionEvent: objective === "OUTCOME_LEADS" ? "LEAD" : "PURCHASE",
      });
  }, [objective]);
  const review = trpc.channels.reviewMetaChange.useMutation({
    onError: e => setError(e.message),
  });
  const apply = trpc.channels.applyMetaChange.useMutation({
    onSuccess: data => {
      onSaved(data.id);
      onClose();
    },
    onError: e =>
      setError(`${e.message} Check Meta before submitting another change.`),
  });
  function prepare() {
    try {
      const change = metaChangeSchema.parse({
        ...form,
        ...(!isCampaign
          ? {
              campaignId,
              countries: countries
                .toUpperCase()
                .split(",")
                .map(s => s.trim())
                .filter(Boolean),
              optimizationGoal: goal,
              startTime: start ? new Date(start).toISOString() : undefined,
              endTime: end ? new Date(end).toISOString() : undefined,
            }
          : {}),
        dailyBudget:
          budget &&
          (!isCampaign || form.budgetMode === "campaign") &&
          !cbo &&
          budgetType === "daily"
            ? Number(budget)
            : undefined,
        lifetimeBudget:
          budget &&
          (!isCampaign || form.budgetMode === "campaign") &&
          !cbo &&
          budgetType === "lifetime"
            ? Number(budget)
            : undefined,
        bidAmount:
          !isCampaign && strategy !== "LOWEST_COST_WITHOUT_CAP" && bid
            ? Number(bid)
            : undefined,
      });
      setReviewed(change);
      setApproved(false);
      setError("");
      review.mutate({ ...scope, change });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the settings.");
    }
  }
  const budgetVisible =
    (isCampaign && form.budgetMode === "campaign") || (!isCampaign && !cbo);
  return (
    <Dialog open onOpenChange={open => !open && !apply.isPending && onClose()}>
      <DialogContent
        className="meta-create-dialog flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-3xl"
        data-workflow="Activate"
      >
        <DialogHeader className="border-b px-5 py-5 pr-12 text-left sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Meta Ads · {connection?.name ?? "Connected account"}
          </p>
          <DialogTitle>
            {review.data && reviewed ? "Review" : "Create"}{" "}
            {isCampaign ? "campaign" : "ad set"}
          </DialogTitle>
          <DialogDescription>
            {isCampaign
              ? "Choose your objective and budget structure."
              : `Set delivery for ${parent.data?.object.name ?? "the selected campaign"}.`}{" "}
            Created paused after your confirmation.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6 space-y-5">
          {review.data && reviewed ? (
            <>
              <div className="rounded-2xl border bg-muted/40 p-4 space-y-3">
                <div className="flex gap-3">
                  <CheckCircle2 className="shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold break-words">
                      {reviewed.name}
                    </h3>
                    <p className="text-sm">
                      New {isCampaign ? "campaign" : "ad set"} · Paused
                    </p>
                  </div>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Objective</dt>
                    <dd>
                      {metaObjectives.find(([v]) => v === objective)?.[1] ??
                        objective}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Budget</dt>
                    <dd>
                      {reviewed.dailyBudget
                        ? `${currency} ${reviewed.dailyBudget} / day`
                        : reviewed.lifetimeBudget
                          ? `${currency} ${reviewed.lifetimeBudget} lifetime`
                          : isCampaign
                            ? "Set on each ad set"
                            : "Uses campaign budget"}
                    </dd>
                  </div>
                  {!isCampaign && (
                    <>
                      <div>
                        <dt className="text-muted-foreground">
                          Performance goal
                        </dt>
                        <dd>
                          {
                            goals.find(
                              ([v]) => v === reviewed.optimizationGoal
                            )?.[1]
                          }
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Locations</dt>
                        <dd>{reviewed.countries?.join(", ")}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Audience</dt>
                        <dd>
                          {reviewed.audienceMode === "advantage"
                            ? "Advantage+"
                            : "Manual"}
                          {reviewed.ageMin || reviewed.ageMax
                            ? ` · ages ${reviewed.ageMin || 18}–${reviewed.ageMax || "65+"}`
                            : " · all adult ages"}
                          {reviewed.genders?.length
                            ? ` · ${reviewed.genders[0] === "1" ? "Men" : "Women"}`
                            : " · all genders"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Placements</dt>
                        <dd>
                          {reviewed.placements === "automatic"
                            ? "Automatic"
                            : metaPlacementOptions
                                .filter(([id]) =>
                                  reviewed.manualPlacements?.includes(id)
                                )
                                .map(p => p[1])
                                .join(", ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Start / end</dt>
                        <dd>
                          {reviewed.startTime
                            ? new Date(reviewed.startTime).toLocaleString()
                            : "When activated"}{" "}
                          /{" "}
                          {reviewed.endTime
                            ? new Date(reviewed.endTime).toLocaleString()
                            : "No end date"}
                        </dd>
                      </div>
                      {reviewed.pixelId && (
                        <div>
                          <dt className="text-muted-foreground">
                            Conversion tracking
                          </dt>
                          <dd>
                            {pixels.data?.data.find(
                              p => p.id === reviewed.pixelId
                            )?.name || reviewed.pixelId}{" "}
                            · {reviewed.conversionEvent?.replaceAll("_", " ")} ·{" "}
                            {reviewed.attribution || "Meta default attribution"}
                          </dd>
                        </div>
                      )}
                      {!!reviewed.includedAudiences?.length && (
                        <div>
                          <dt className="text-muted-foreground">
                            Included audiences
                          </dt>
                          <dd>
                            {reviewed.includedAudiences
                              .map(
                                id =>
                                  audiences.data?.data.find(a => a.id === id)
                                    ?.name || id
                              )
                              .join(", ")}
                          </dd>
                        </div>
                      )}
                      {!!reviewed.excludedAudiences?.length && (
                        <div>
                          <dt className="text-muted-foreground">
                            Excluded audiences
                          </dt>
                          <dd>
                            {reviewed.excludedAudiences
                              .map(
                                id =>
                                  audiences.data?.data.find(a => a.id === id)
                                    ?.name || id
                              )
                              .join(", ")}
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Bidding</dt>
                    <dd>
                      {strategy === "COST_CAP"
                        ? "Cost per result goal"
                        : strategy === "LOWEST_COST_WITH_BID_CAP"
                          ? "Bid cap"
                          : "Highest volume"}
                      {reviewed.bidAmount
                        ? ` · ${currency} ${reviewed.bidAmount}`
                        : ""}
                    </dd>
                  </div>
                  {!!reviewed.specialCategories.length && (
                    <div>
                      <dt className="text-muted-foreground">
                        Special categories
                      </dt>
                      <dd>
                        {reviewed.specialCategories
                          .join(", ")
                          .replaceAll("_", " ")}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              {review.data.warnings.map(w => (
                <p
                  key={w}
                  className="text-sm rounded-xl bg-amber-50 p-3 text-amber-950"
                >
                  {w}
                </p>
              ))}
              {!review.data.liveEnabled && (
                <p role="status">
                  Meta writes are disabled in this environment.
                </p>
              )}
              <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={approved}
                  onChange={e => setApproved(e.target.checked)}
                />
                I approve creating this paused{" "}
                {isCampaign ? "campaign" : "ad set"} with the settings shown.
              </label>
            </>
          ) : (
            <>
              {!isCampaign && parent.isLoading ? (
                <p role="status">Loading campaign settings…</p>
              ) : parent.error ? (
                <p role="alert">{parent.error.message}</p>
              ) : (
                <>
                  <label className="block space-y-2 text-sm font-medium">
                    {isCampaign ? "Campaign name" : "Ad set name"}
                    <input
                      className={channelInput}
                      value={form.name}
                      maxLength={180}
                      onChange={e => patch({ name: e.target.value })}
                    />
                  </label>
                  {isCampaign ? (
                    <>
                      <fieldset>
                        <legend className="mb-3 text-sm font-medium">
                          Campaign objective
                        </legend>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {metaObjectives.map(([value, label]) => (
                            <label
                              key={value}
                              className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${form.objective === value ? "border-primary bg-primary/5" : ""}`}
                            >
                              <input
                                type="radio"
                                name="meta-objective"
                                value={value}
                                checked={form.objective === value}
                                onChange={() => patch({ objective: value })}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      {form.objective === "OUTCOME_APP_PROMOTION" && (
                        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                          You can create the campaign here. App store, app
                          events, and app-specific creative setup are completed
                          in Meta Ads Manager.
                        </p>
                      )}
                      <label className="block space-y-2 text-sm font-medium">
                        Budget structure
                        <select
                          className={channelInput}
                          value={form.budgetMode}
                          onChange={e => {
                            patch({
                              budgetMode: e.target.value as
                                | "campaign"
                                | "adset",
                            });
                            setBudget("");
                          }}
                        >
                          <option value="adset">
                            Ad set budget · separate budget for each audience
                          </option>
                          <option value="campaign">
                            Campaign budget · distribute across ad sets
                          </option>
                        </select>
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Auction buying. Reservation buying and experiments are
                        available in Meta Ads Manager.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="rounded-xl bg-muted/50 p-3 text-sm">
                        {metaObjectives.find(([v]) => v === objective)?.[1] ??
                          objective}{" "}
                        ·{" "}
                        {cbo
                          ? "Campaign controls the budget"
                          : "Budget set here"}
                      </div>
                      {goals.length ? (
                        <label className="block space-y-2 text-sm font-medium">
                          Performance goal
                          <select
                            className={channelInput}
                            value={goal}
                            onChange={e =>
                              patch({
                                optimizationGoal: e.target
                                  .value as MetaChange["optimizationGoal"],
                              })
                            }
                          >
                            {goals.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p
                          role="status"
                          className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950"
                        >
                          This objective needs dedicated Meta setup. Create the
                          ad set in Ads Manager, then refresh and select it in
                          EvokeLoop.
                        </p>
                      )}
                      {!!goals.length && (
                        <p className="text-xs text-muted-foreground">
                          {[
                            "OUTCOME_SALES",
                            "OUTCOME_TRAFFIC",
                            "OUTCOME_LEADS",
                          ].includes(objective)
                            ? "Conversion location: Website. For instant forms, messaging, apps or catalog sales, use Meta Ads Manager."
                            : "Promotes the connected Facebook Page and ad content."}
                        </p>
                      )}
                    </>
                  )}
                  {(isCampaign || !!goals.length) && (
                    <>
                      {budgetVisible && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-2 text-sm">
                            Budget type
                            <select
                              className={channelInput}
                              value={budgetType}
                              onChange={e => setBudgetType(e.target.value)}
                            >
                              <option value="daily">Daily</option>
                              <option value="lifetime">Lifetime</option>
                            </select>
                          </label>
                          <label className="block space-y-2 text-sm">
                            Budget ({currency})
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              className={channelInput}
                              value={budget}
                              onChange={e => setBudget(e.target.value)}
                            />
                          </label>
                        </div>
                      )}
                      {(budgetVisible || (!isCampaign && cbo)) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-2 text-sm">
                            Bid strategy
                            <select
                              className={channelInput}
                              disabled={cbo}
                              value={strategy}
                              onChange={e =>
                                patch({
                                  bidStrategy: e.target
                                    .value as MetaChange["bidStrategy"],
                                })
                              }
                            >
                              <option value="LOWEST_COST_WITHOUT_CAP">
                                Highest volume
                              </option>
                              <option value="COST_CAP">
                                Cost per result goal
                              </option>
                              <option value="LOWEST_COST_WITH_BID_CAP">
                                Bid cap
                              </option>
                            </select>
                          </label>
                          {!isCampaign &&
                            strategy !== "LOWEST_COST_WITHOUT_CAP" && (
                              <label className="block space-y-2 text-sm">
                                {strategy === "COST_CAP"
                                  ? "Cost goal"
                                  : "Bid cap"}{" "}
                                ({currency})
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  className={channelInput}
                                  value={bid}
                                  onChange={e => setBid(e.target.value)}
                                />
                              </label>
                            )}
                        </div>
                      )}
                      {!isCampaign && (
                        <>
                          <section className="rounded-2xl border p-4 space-y-4">
                            <h3 className="font-semibold">Schedule</h3>
                            <p className="text-xs text-muted-foreground">
                              Times use{" "}
                              {Intl.DateTimeFormat().resolvedOptions().timeZone}
                              . The ad set stays paused until activated.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="block space-y-2 text-sm">
                                Start (optional)
                                <input
                                  type="datetime-local"
                                  className={channelInput}
                                  value={start}
                                  onChange={e => setStart(e.target.value)}
                                />
                              </label>
                              <label className="block space-y-2 text-sm">
                                End{" "}
                                {budgetType === "lifetime" ||
                                Number(parent.data?.object.lifetime_budget) > 0
                                  ? "(required)"
                                  : "(optional)"}
                                <input
                                  type="datetime-local"
                                  className={channelInput}
                                  value={end}
                                  onChange={e => setEnd(e.target.value)}
                                />
                              </label>
                            </div>
                          </section>
                          <section className="rounded-2xl border p-4 space-y-4">
                            <h3 className="font-semibold">Audience</h3>
                            <label className="block space-y-2 text-sm">
                              Countries (two-letter codes)
                              <input
                                className={channelInput}
                                placeholder="US, CA"
                                value={countries}
                                onChange={e => setCountries(e.target.value)}
                              />
                            </label>
                            <label className="block space-y-2 text-sm">
                              Audience type
                              <select
                                className={channelInput}
                                value={form.audienceMode}
                                onChange={e =>
                                  patch({
                                    audienceMode: e.target
                                      .value as MetaChange["audienceMode"],
                                    ageMin: undefined,
                                    ageMax: undefined,
                                    genders: undefined,
                                  })
                                }
                              >
                                <option value="advantage">
                                  Advantage+ audience
                                </option>
                                <option value="manual">Manual audience</option>
                              </select>
                            </label>
                            {form.audienceMode === "advantage" && (
                              <p className="text-xs text-muted-foreground">
                                Meta can expand beyond included audience
                                suggestions. Country and excluded audience
                                controls still apply.
                              </p>
                            )}
                            {form.audienceMode === "manual" && !special && (
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <label className="space-y-2 text-sm">
                                  Minimum age
                                  <input
                                    type="number"
                                    min="18"
                                    max="65"
                                    className={channelInput}
                                    placeholder="18"
                                    value={form.ageMin ?? ""}
                                    onChange={e =>
                                      patch({
                                        ageMin: e.target.value
                                          ? Number(e.target.value)
                                          : undefined,
                                      })
                                    }
                                  />
                                </label>
                                <label className="space-y-2 text-sm">
                                  Maximum age
                                  <input
                                    type="number"
                                    min="18"
                                    max="65"
                                    className={channelInput}
                                    placeholder="65+"
                                    value={form.ageMax ?? ""}
                                    onChange={e =>
                                      patch({
                                        ageMax: e.target.value
                                          ? Number(e.target.value)
                                          : undefined,
                                      })
                                    }
                                  />
                                </label>
                                <label className="space-y-2 text-sm">
                                  Gender
                                  <select
                                    className={channelInput}
                                    value={form.genders?.[0] ?? ""}
                                    onChange={e =>
                                      patch({
                                        genders: e.target.value
                                          ? [e.target.value as "1" | "2"]
                                          : [],
                                      })
                                    }
                                  >
                                    <option value="">All</option>
                                    <option value="1">Men</option>
                                    <option value="2">Women</option>
                                  </select>
                                </label>
                              </div>
                            )}
                            {audiences.error ? (
                              <p className="text-xs" role="alert">
                                Custom audiences could not be loaded.{" "}
                                <button
                                  className="underline"
                                  onClick={() => void audiences.refetch()}
                                >
                                  Retry
                                </button>
                              </p>
                            ) : (
                              <details>
                                <summary className="cursor-pointer text-sm font-medium">
                                  Custom & lookalike audiences
                                </summary>
                                <div className="mt-3 max-h-64 space-y-3 overflow-auto">
                                  {audiences.isLoading ? (
                                    <p className="text-xs">
                                      Loading audiences…
                                    </p>
                                  ) : !audiences.data?.data.length ? (
                                    <p className="text-xs text-muted-foreground">
                                      No accessible audiences. Create audiences
                                      in Meta, then refresh.
                                    </p>
                                  ) : (
                                    audiences.data.data.map(a => (
                                      <div
                                        key={a.id}
                                        className="flex flex-wrap items-center gap-3 rounded-lg border p-2 text-xs"
                                      >
                                        <span className="min-w-0 flex-1 break-words">
                                          {a.name}
                                        </span>
                                        {(
                                          [
                                            "includedAudiences",
                                            "excludedAudiences",
                                          ] as const
                                        ).map((key, i) => (
                                          <label
                                            key={key}
                                            className="flex gap-1"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={
                                                form[key]?.includes(
                                                  String(a.id)
                                                ) ?? false
                                              }
                                              onChange={e =>
                                                patch({
                                                  [key]: e.target.checked
                                                    ? [
                                                        ...(form[key] ?? []),
                                                        String(a.id),
                                                      ]
                                                    : (form[key] ?? []).filter(
                                                        id =>
                                                          id !== String(a.id)
                                                      ),
                                                })
                                              }
                                            />
                                            {i ? "Exclude" : "Include"}
                                          </label>
                                        ))}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </details>
                            )}
                          </section>
                          <section className="rounded-2xl border p-4 space-y-4">
                            <h3 className="font-semibold">Placements</h3>
                            <select
                              aria-label="Placements"
                              className={channelInput}
                              value={form.placements}
                              onChange={e =>
                                patch({
                                  placements: e.target
                                    .value as MetaChange["placements"],
                                  manualPlacements:
                                    e.target.value === "manual"
                                      ? ["facebook_feed", "instagram_feed"]
                                      : undefined,
                                })
                              }
                            >
                              <option value="automatic">
                                Advantage+ automatic placements
                              </option>
                              <option value="manual">Choose placements</option>
                            </select>
                            {form.placements === "manual" && (
                              <div className="grid grid-cols-2 gap-3">
                                {metaPlacementOptions.map(([id, label]) => (
                                  <label
                                    key={id}
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={
                                        form.manualPlacements?.includes(id) ??
                                        false
                                      }
                                      onChange={e =>
                                        patch({
                                          manualPlacements: e.target.checked
                                            ? [
                                                ...(form.manualPlacements ??
                                                  []),
                                                id,
                                              ]
                                            : (
                                                form.manualPlacements ?? []
                                              ).filter(p => p !== id),
                                        })
                                      }
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            )}
                          </section>
                          {goal === "OFFSITE_CONVERSIONS" && (
                            <section className="rounded-2xl border p-4 space-y-4">
                              <h3 className="font-semibold">
                                Conversion tracking
                              </h3>
                              <label className="block space-y-2 text-sm">
                                Dataset / Meta Pixel
                                <select
                                  className={channelInput}
                                  value={form.pixelId ?? ""}
                                  onChange={e =>
                                    patch({
                                      pixelId: e.target.value || undefined,
                                    })
                                  }
                                >
                                  <option value="">Select a dataset</option>
                                  {pixels.data?.data.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.name || p.id}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {pixels.error && (
                                <p role="alert" className="text-xs">
                                  {pixels.error.message}
                                </p>
                              )}
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block space-y-2 text-sm">
                                  Conversion event
                                  <select
                                    className={channelInput}
                                    value={form.conversionEvent ?? "PURCHASE"}
                                    onChange={e =>
                                      patch({
                                        conversionEvent: e.target
                                          .value as MetaChange["conversionEvent"],
                                      })
                                    }
                                  >
                                    {metaConversionEvents.map(v => (
                                      <option key={v} value={v}>
                                        {v.toLowerCase().replaceAll("_", " ")}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block space-y-2 text-sm">
                                  Attribution
                                  <select
                                    className={channelInput}
                                    value={form.attribution ?? ""}
                                    onChange={e =>
                                      patch({
                                        attribution:
                                          (e.target
                                            .value as MetaChange["attribution"]) ||
                                          undefined,
                                      })
                                    }
                                  >
                                    <option value="">Meta default</option>
                                    <option value="1d_click">
                                      1-day click
                                    </option>
                                    <option value="7d_click">
                                      7-day click
                                    </option>
                                    <option value="1d_click_1d_view">
                                      1-day click, 1-day view
                                    </option>
                                    <option value="7d_click_1d_view">
                                      7-day click, 1-day view
                                    </option>
                                  </select>
                                </label>
                              </div>
                            </section>
                          )}
                        </>
                      )}
                      {isCampaign && (
                        <details className="rounded-2xl border p-4">
                          <summary className="cursor-pointer text-sm font-medium">
                            Special ad categories
                          </summary>
                          <p className="my-3 text-xs text-muted-foreground">
                            Select any categories that apply to this campaign.
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {(
                              [
                                "HOUSING",
                                "EMPLOYMENT",
                                "FINANCIAL_PRODUCTS_SERVICES",
                                "ISSUES_ELECTIONS_POLITICS",
                              ] as const
                            ).map(value => (
                              <label key={value} className="flex gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={form.specialCategories.includes(
                                    value
                                  )}
                                  onChange={e =>
                                    patch({
                                      specialCategories: e.target.checked
                                        ? [...form.specialCategories, value]
                                        : form.specialCategories.filter(
                                            v => v !== value
                                          ),
                                    })
                                  }
                                />
                                {value.toLowerCase().replaceAll("_", " ")}
                              </label>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </>
              )}
              <a
                href={managerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary"
              >
                More setup options in Meta Ads Manager{" "}
                <ExternalLink size={14} />
              </a>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-800 break-words"
            >
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t bg-card p-4 [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-10">
          {review.data && reviewed ? (
            <>
              <Button
                variant="outline"
                disabled={apply.isPending}
                onClick={() => {
                  review.reset();
                  apply.reset();
                  setReviewed(null);
                  setError("");
                }}
              >
                Back to settings
              </Button>
              <Button
                disabled={
                  !approved ||
                  !review.data.liveEnabled ||
                  apply.isPending ||
                  apply.isError
                }
                onClick={() =>
                  apply.mutate({
                    ...scope,
                    change: reviewed,
                    ticket: review.data!.ticket,
                  })
                }
              >
                {apply.isPending
                  ? "Creating…"
                  : `Create paused ${isCampaign ? "campaign" : "ad set"}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={
                  review.isPending ||
                  !form.name.trim() ||
                  (!isCampaign && (!parent.data || !goals.length))
                }
                onClick={prepare}
              >
                {review.isPending ? "Checking settings…" : "Review settings"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
