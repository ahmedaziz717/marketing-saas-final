import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Check, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import {
  mayManageBilling,
  PRODUCT_FEATURES,
  PROPOSED_PLANS,
  type PlanId,
} from "@shared/frameProduct";
const number = (value: number) => new Intl.NumberFormat("en-US").format(value);
export function BillingUsage() {
  const { organizationId, membership } = useWorkspace();
  const allowed = mayManageBilling(membership?.role ?? "");
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [tab, setTab] = useState("usage");
  const confirmation = useRef<HTMLElement>(null);
  const [choice, setChoice] = useState<PlanId | null>(null);
  useEffect(() => {
    if (choice) {
      confirmation.current?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
      confirmation.current?.focus();
    }
  }, [choice]);
  const query = trpc.billing.summary.useQuery(
    { organizationId: organizationId!, month },
    { enabled: !!organizationId && allowed, retry: false }
  );
  const utils = trpc.useUtils();
  const save = trpc.billing.selectPreviewPlan.useMutation({
    onSuccess: () => {
      setChoice(null);
      void utils.billing.summary.invalidate();
      toast.success(
        "Plan preview saved. No subscription or charge was created."
      );
    },
    onError: error => toast.error(error.message),
  });
  if (!allowed)
    return (
      <section className="surface p-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Billing & Usage</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Only workspace owners and administrators can view usage details or
          manage plan previews. Your creation, review and publishing permissions
          are unchanged.
        </p>
      </section>
    );
  const selected = PROPOSED_PLANS.find(
    plan => plan.id === query.data?.selectedPreviewPlanId
  );
  return (
    <div className="min-w-0 space-y-6">
      <section className="surface p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Billing & Usage</h2>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Preview only - no charges
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This workspace has no paid subscription managed by Frame. Plan prices,
          AI allowances and ad-spend bands below are proposals. Selecting a
          preview does not start billing, change permissions, enforce limits or
          enable unfinished tools.
        </p>
        <p className="mt-3 text-sm">
          <strong>Saved plan preview:</strong>{" "}
          {query.isLoading
            ? "Loading..."
            : query.error
              ? "Unavailable"
              : (selected?.name ?? "Not selected")}
        </p>
      </section>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 flex h-auto w-fit max-w-full flex-wrap gap-1">
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="plans">Proposed plans</TabsTrigger>
          <TabsTrigger value="features">Feature access</TabsTrigger>
        </TabsList>
        {query.isLoading ? (
          <p role="status" className="surface p-6">
            Loading workspace usage...
          </p>
        ) : query.error ? (
          <section role="alert" className="surface p-6">
            <p>
              Billing & Usage could not be loaded. No plan or usage data was
              changed.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => query.refetch()}
            >
              Try again
            </Button>
          </section>
        ) : (
          query.data && (
            <>
              <TabsContent value="usage" className="space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className="text-sm font-medium">
                    Reporting month (UTC)
                    <input
                      aria-label="Usage reporting month"
                      type="month"
                      min="2020-01"
                      max="2100-12"
                      value={month}
                      className="mt-2 block max-w-full rounded-xl border bg-background p-2"
                      onChange={e => {
                        if (
                          /^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])$/.test(
                            e.target.value
                          )
                        )
                          setMonth(e.target.value);
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={query.isFetching}
                    onClick={() => query.refetch()}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh usage
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {query.data.usage.map(meter => (
                    <article className="surface p-5" key={meter.id}>
                      <p className="text-sm text-muted-foreground">
                        {meter.label}
                      </p>
                      <p className="mt-3 text-3xl font-semibold tabular-nums">
                        {number(meter.quantity)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Successful {meter.unit} in {month}
                      </p>
                    </article>
                  ))}
                </div>
                <section className="surface p-5">
                  <h3 className="font-semibold">
                    AI credits are not calculated yet
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {selected?.credits
                      ? `The ${selected.name} proposal includes ${number(selected.credits)} credits per month. `
                      : "A credit allowance is part of the proposed plans. "}
                    Credit costs per operation, video allowances and overage
                    rules are not configured. An image or caption count is not a
                    credit charge; no remaining-credit balance or overage is
                    being inferred.
                  </p>
                </section>
                <section className="surface p-5">
                  <h3 className="font-semibold">Current workspace inventory</h3>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                    {[
                      ["Active teammates", query.data.inventory.activeSeats],
                      ["Catalog items", query.data.inventory.catalogItems],
                      [
                        "Connected accounts",
                        query.data.inventory.connectedAccounts,
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-2 text-2xl font-semibold">
                          {number(Number(value))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Inventory is current, not historical monthly usage.
                    Connection count is not proof that a token is still valid.
                    Storage bytes and provider costs are not metered here.
                  </p>
                </section>
                <p className="text-xs leading-5 text-muted-foreground">
                  {query.data.coverage} Manual uploads count separately from
                  AI-created images. AI copy refreshes and AI work without a
                  saved completion event are not included. Failed jobs may still
                  incur provider costs; they are not counted as successful
                  outputs.
                </p>
                <Link
                  href="/app/analytics/advertising"
                  className="inline-block text-sm text-primary underline"
                >
                  View provider-reported advertising spend in Analytics
                </Link>
              </TabsContent>
              <TabsContent value="plans" className="space-y-5">
                <p className="text-sm leading-6 text-muted-foreground">
                  Proposed monthly pricing in USD. No checkout, automatic
                  upgrade, invoice or payment-method collection is enabled.
                  Ad-spend bands are sizing proposals, not a fee or a budget
                  authorization.
                </p>
                <div className="grid gap-4 xl:grid-cols-2">
                  {query.data.plans.map(plan => (
                    <article
                      key={plan.id}
                      className={`surface flex min-w-0 flex-col p-5 ${plan.id === selected?.id ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xl font-semibold">{plan.name}</h3>
                        {plan.popular && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                            Featured proposal
                          </span>
                        )}
                      </div>
                      <p className="mt-4 text-3xl font-semibold">
                        {plan.monthlyUsd === null
                          ? "Custom"
                          : "$" + number(plan.monthlyUsd)}
                        {plan.monthlyUsd !== null && (
                          <span className="text-sm font-normal text-muted-foreground">
                            {" "}
                            / month
                          </span>
                        )}
                      </p>
                      <p className="mb-5 mt-3 text-sm leading-6 text-muted-foreground">
                        {plan.description}
                      </p>
                      <dl className="mb-5 space-y-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt>Monthly AI credits</dt>
                          <dd className="font-medium">
                            {plan.credits === null
                              ? "Custom"
                              : number(plan.credits)}
                          </dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt>Monthly ad-spend band</dt>
                          <dd className="font-medium">
                            {plan.monthlyAdSpendUsd === null
                              ? "Custom"
                              : "Up to $" + number(plan.monthlyAdSpendUsd)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Video allowance</dt>
                          <dd>Not specified</dd>
                        </div>
                      </dl>
                      <Button
                        className="mt-auto h-auto min-h-10 whitespace-normal py-2"
                        variant={
                          plan.id === selected?.id ? "secondary" : "outline"
                        }
                        disabled={save.isPending || plan.id === selected?.id}
                        onClick={() => setChoice(plan.id)}
                      >
                        {plan.id === selected?.id ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Saved preview
                          </>
                        ) : (
                          "Preview " + plan.name
                        )}
                      </Button>
                    </article>
                  ))}
                </div>
                {choice && (
                  <section
                    ref={confirmation}
                    tabIndex={-1}
                    aria-label="Confirm plan preview"
                    className="rounded-xl border border-primary/30 bg-primary/5 p-5"
                  >
                    <h3 className="font-semibold">
                      Save{" "}
                      {PROPOSED_PLANS.find(plan => plan.id === choice)?.name} as
                      the workspace plan preview?
                    </h3>
                    <p className="mt-2 text-sm leading-6">
                      This saves a planning preference only. It does not
                      purchase a plan or enable charges, limits, paid features
                      or advertising spend.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        disabled={save.isPending}
                        onClick={() =>
                          save.mutate({
                            organizationId: organizationId!,
                            planId: choice,
                            revision: query.data!.revision,
                            previewOnly: true,
                          })
                        }
                      >
                        {save.isPending ? "Saving..." : "Save preview only"}
                      </Button>
                      <Button
                        disabled={save.isPending}
                        variant="outline"
                        onClick={() => setChoice(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </section>
                )}
                <p className="text-xs leading-5 text-muted-foreground">
                  Attribution tiers, incrementality add-ons and a future
                  measurement offering remain roadmap proposals. They are not
                  included as working paid features here. Credit rates,
                  allowances, billing intervals, overages and ad-spend
                  enforcement require a finalized commercial policy.
                </p>
              </TabsContent>
              <TabsContent value="features" className="space-y-4">
                <section className="surface p-5">
                  <h3 className="font-semibold">
                    Availability is not the same as authorization
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Available tools remain accessible under your workspace's
                    existing role permissions. A proposed plan does not give a
                    creator permission to approve, publish, manage billing or
                    change budgets. No commercial feature restrictions are
                    enforced during this preview.
                  </p>
                </section>
                <div className="grid gap-3">
                  {PRODUCT_FEATURES.map(feature => (
                    <article
                      key={feature.id}
                      className="surface flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{feature.name}</p>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">
                          {feature.stage}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs">
                        {feature.availability === "planned"
                          ? "Planned - not a paid unlock"
                          : feature.availability === "connection_required"
                            ? "Preview access - connection required"
                            : "Available in preview"}
                      </span>
                    </article>
                  ))}
                </div>
              </TabsContent>
            </>
          )
        )}
      </Tabs>
    </div>
  );
}
