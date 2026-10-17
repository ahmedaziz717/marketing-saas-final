import { MetaCreateDialog } from "./MetaCreateDialog";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { metaChangeSchema, type MetaChange } from "@shared/metaManagement";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { channelInput } from "./ChannelConnections";
function MetaEditDialog({
  connectionId,
  kind,
  objectId,
  campaignId,
  onClose,
  onSaved,
}: {
  connectionId: string;
  kind: MetaChange["kind"];
  objectId?: string;
  campaignId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { organizationId } = useWorkspace();
  const scope = { organizationId: organizationId!, connectionId };
  const editing = kind.startsWith("update"),
    adset = kind.includes("adset"),
    campaign = kind.includes("campaign");
  const details = trpc.channels.metaObject.useQuery(
    {
      ...scope,
      kind: campaign ? "campaign" : adset ? "adset" : "ad",
      objectId: objectId ?? "1",
    },
    { enabled: editing, retry: false }
  );
  const pixels = trpc.channels.metaPixels.useQuery(scope, {
    enabled: kind === "create_adset",
    retry: false,
  });
  const [name, setName] = useState(""),
    [budget, setBudget] = useState(""),
    [mode, setMode] = useState<"adset" | "campaign">("adset"),
    [objective, setObjective] = useState<"OUTCOME_SALES" | "OUTCOME_TRAFFIC">(
      "OUTCOME_SALES"
    );
  const [countries, setCountries] = useState(editing ? "" : "US"),
    [pixel, setPixel] = useState(""),
    [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "">("");
  const [audience, setAudience] = useState<MetaChange["audienceMode"]>(
      editing ? "keep" : "advantage"
    ),
    [placements, setPlacements] = useState<MetaChange["placements"]>(
      editing ? "keep" : "automatic"
    );
  const [categories, setCategories] = useState<MetaChange["specialCategories"]>(
      []
    ),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const [reviewed, setReviewed] = useState<MetaChange | null>(null);
  const review = trpc.channels.reviewMetaChange.useMutation({
    onError: e => setError(e.message),
  });
  const apply = trpc.channels.applyMetaChange.useMutation({
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: e =>
      setError(e.message + " Check Meta before submitting another change."),
  });
  const current = details.data?.object;
  function prepare() {
    try {
      const change = metaChangeSchema.parse({
        kind,
        objectId,
        campaignId,
        name: name || current?.name,
        objective,
        budgetMode: mode,
        ...(budget ? { dailyBudget: Number(budget) } : {}),
        ...(editing && status ? { status } : {}),
        ...(adset && countries
          ? {
              countries: countries
                .toUpperCase()
                .split(",")
                .map(x => x.trim())
                .filter(Boolean),
            }
          : {}),
        ...(adset && pixel ? { pixelId: pixel } : {}),
        audienceMode: adset ? audience : "keep",
        placements: adset ? placements : "keep",
        specialCategories: categories,
      });
      setError("");
      setReviewed(change);
      setConfirmed(false);
      review.mutate({ ...scope, change });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your inputs.");
    }
  }
  return (
    <Dialog open onOpenChange={open => !open && !apply.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit" : "New"}{" "}
            {campaign ? "campaign" : adset ? "ad set" : "ad"}
          </DialogTitle>
          <DialogDescription>
            Review the exact change before sending it to Meta. New campaigns and
            ad sets are created paused.
          </DialogDescription>
        </DialogHeader>
        {details.isLoading && editing ? (
          <p>Loading current settings…</p>
        ) : details.error ? (
          <p role="alert">{details.error.message}</p>
        ) : review.data && reviewed ? (
          <>
            <div className="rounded-xl border p-4">
              <p className="font-semibold">{reviewed.name}</p>
              <p className="text-sm">
                {editing
                  ? `Existing object: ${objectId}`
                  : `Create paused ${campaign ? "campaign" : "ad set"}`}
              </p>
              <p className="mt-2 text-sm">
                Delivery:{" "}
                {review.data.params.status === "ACTIVE"
                  ? "Activate"
                  : review.data.params.status === "PAUSED"
                    ? "Paused"
                    : "Keep current"}
              </p>
              {reviewed.dailyBudget != null && (
                <p className="text-sm">
                  Daily budget: ${reviewed.dailyBudget.toFixed(2)} USD
                </p>
              )}
              {kind === "create_campaign" && (
                <p className="text-sm">
                  {reviewed.objective === "OUTCOME_SALES" ? "Sales" : "Traffic"}{" "}
                  ·{" "}
                  {reviewed.budgetMode === "campaign"
                    ? "Campaign budget (CBO)"
                    : "Ad-set budgets (ABO)"}
                </p>
              )}
              {reviewed.countries && (
                <p className="text-sm">
                  Target countries: {reviewed.countries.join(", ")}
                </p>
              )}
              {adset && (
                <>
                  <p className="text-sm">
                    Audience:{" "}
                    {reviewed.audienceMode === "keep"
                      ? "Keep current"
                      : reviewed.audienceMode === "advantage"
                        ? "Advantage+ audience"
                        : "Manual"}
                  </p>
                  <p className="text-sm">
                    Placements:{" "}
                    {reviewed.placements === "keep"
                      ? "Keep current"
                      : reviewed.placements === "automatic"
                        ? "Automatic"
                        : "Facebook Feed"}
                  </p>
                  {reviewed.pixelId && (
                    <p className="text-sm">
                      Purchase pixel:{" "}
                      {pixels.data?.data.find(p => p.id === reviewed.pixelId)
                        ?.name ?? reviewed.pixelId}
                    </p>
                  )}
                </>
              )}
              {!!reviewed.specialCategories.length && (
                <p className="text-sm">
                  Special categories:{" "}
                  {reviewed.specialCategories.join(", ").replaceAll("_", " ")}
                </p>
              )}
            </div>
            {review.data.warnings.map(w => (
              <p
                key={w}
                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
              >
                {w}
              </p>
            ))}
            {!review.data.liveEnabled && (
              <p role="status">
                Meta writes are disabled in this environment. You can review the
                setup, but it cannot be sent yet.
              </p>
            )}
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
              />
              I approve these changes to this Meta account, including any budget
              or delivery effect shown above.
            </label>
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={apply.isPending}
                onClick={() => {
                  review.reset();
                  apply.reset();
                  setReviewed(null);
                }}
              >
                Back to edit
              </Button>
              <Button
                disabled={
                  !confirmed ||
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
                {apply.isPending ? "Sending…" : "Apply approved change"}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {current && (
              <div className="rounded-xl bg-muted p-3 text-sm">
                <p>
                  Current: {current.name} · {current.effective_status}
                </p>
                <p>
                  Budget:{" "}
                  {current.daily_budget
                    ? `${(Number(current.daily_budget) / 100).toFixed(2)} / day`
                    : current.lifetime_budget
                      ? `${(Number(current.lifetime_budget) / 100).toFixed(2)} lifetime`
                      : "Controlled by parent or ad sets"}
                </p>
                {current.targeting && (
                  <p>
                    Countries:{" "}
                    {current.targeting.geo_locations?.countries?.join(", ") ||
                      "Custom locations"}{" "}
                    · Audience:{" "}
                    {current.targeting.targeting_automation
                      ?.advantage_audience === 1
                      ? "Advantage+"
                      : "Manual or not supplied"}{" "}
                    · Placements:{" "}
                    {current.targeting.publisher_platforms?.join(", ") ||
                      "Automatic"}
                  </p>
                )}
              </div>
            )}
            <label className="block text-sm">
              Name
              <input
                className={channelInput}
                value={name || current?.name || ""}
                onChange={e => setName(e.target.value)}
              />
            </label>
            {kind === "create_campaign" && (
              <>
                <label className="block text-sm">
                  Objective
                  <select
                    className={channelInput}
                    value={objective}
                    onChange={e =>
                      setObjective(e.target.value as typeof objective)
                    }
                  >
                    <option value="OUTCOME_SALES">
                      Sales · website purchases
                    </option>
                    <option value="OUTCOME_TRAFFIC">
                      Traffic · website clicks
                    </option>
                  </select>
                </label>
                <label className="block text-sm">
                  Budget ownership
                  <select
                    className={channelInput}
                    value={mode}
                    onChange={e => {
                      setMode(e.target.value as typeof mode);
                      setBudget("");
                    }}
                  >
                    <option value="adset">ABO · budget on each ad set</option>
                    <option value="campaign">
                      CBO · Advantage campaign budget
                    </option>
                  </select>
                </label>
                <fieldset>
                  <legend className="text-sm font-medium">
                    Special ad categories
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Select every category that applies. Leave unchecked only if
                    none apply.
                  </p>
                  {[
                    "HOUSING",
                    "EMPLOYMENT",
                    "FINANCIAL_PRODUCTS_SERVICES",
                    "ISSUES_ELECTIONS_POLITICS",
                  ].map(value => (
                    <label
                      key={value}
                      className="mr-3 inline-flex gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={categories.includes(value as any)}
                        onChange={e =>
                          setCategories(old =>
                            e.target.checked
                              ? [...old, value as any]
                              : old.filter(x => x !== value)
                          )
                        }
                      />
                      {value.replaceAll("_", " ")}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {(adset || (campaign && (editing || mode === "campaign"))) && (
              <label className="block text-sm">
                {editing
                  ? "New daily budget (leave blank to keep)"
                  : "Daily budget (USD; leave blank for CBO ad sets)"}
                <input
                  type="number"
                  min=".01"
                  step=".01"
                  className={channelInput}
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                />
              </label>
            )}
            {editing && (
              <label className="block text-sm">
                Delivery
                <select
                  className={channelInput}
                  value={status}
                  onChange={e => setStatus(e.target.value as typeof status)}
                >
                  <option value="">Keep current status</option>
                  <option value="PAUSED">Pause</option>
                  <option value="ACTIVE">Activate · may begin spending</option>
                </select>
              </label>
            )}
            {adset && (
              <>
                <label className="block text-sm">
                  {editing
                    ? "Replace target countries (blank keeps current)"
                    : "Target countries"}
                  <input
                    className={channelInput}
                    placeholder="US, CA"
                    value={countries}
                    onChange={e => setCountries(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Audience automation
                  <select
                    className={channelInput}
                    value={audience}
                    onChange={e =>
                      setAudience(e.target.value as typeof audience)
                    }
                  >
                    <option value="keep">Keep current</option>
                    <option value="advantage">Advantage+ audience</option>
                    <option value="manual">Manual audience</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Placements
                  <select
                    className={channelInput}
                    value={placements}
                    onChange={e =>
                      setPlacements(e.target.value as typeof placements)
                    }
                  >
                    <option value="keep">Keep current</option>
                    <option value="automatic">Automatic placements</option>
                    <option value="facebook_feed">Facebook Feed only</option>
                  </select>
                </label>
                {kind === "create_adset" && (
                  <label className="block text-sm">
                    Purchase pixel (required for Sales)
                    <select
                      className={channelInput}
                      value={pixel}
                      onChange={e => setPixel(e.target.value)}
                    >
                      <option value="">Select pixel</option>
                      {pixels.data?.data.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name || p.id}
                        </option>
                      ))}
                    </select>
                    {pixels.error && <p role="alert">{pixels.error.message}</p>}
                  </label>
                )}
              </>
            )}
            <Button
              disabled={review.isPending || (editing && !current)}
              onClick={prepare}
            >
              {review.isPending ? "Checking Meta settings…" : "Review change"}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MetaChangeDialog(props: {
  connectionId: string;
  kind: MetaChange["kind"];
  objectId?: string;
  campaignId?: string;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  return props.kind === "create_campaign" || props.kind === "create_adset" ? (
    <MetaCreateDialog {...props} kind={props.kind} />
  ) : (
    <MetaEditDialog {...props} />
  );
}
