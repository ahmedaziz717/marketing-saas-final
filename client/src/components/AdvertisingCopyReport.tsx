import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { CopyEvidenceResult } from "./CopyEvidenceResult";
import { copyComparisonSchema } from "@shared/copyEvidence";
import type { DateRange } from "@shared/channels";

/** Mounted with an account/range key so a changed filter cannot show stale results. */
export function AdvertisingCopyReport({
  organizationId,
  connectionId,
  range,
}: {
  organizationId: number;
  connectionId: string;
  range: DateRange;
}) {
  const [objective, setObjective] = useState<"cpa" | "roas">("cpa");
  const [minimumImpressions, setImpressions] = useState(1000);
  const [minimumPurchases, setPurchases] = useState(5);
  const report = trpc.optimization.copyReport.useMutation();
  const settings = copyComparisonSchema.safeParse({
    objective,
    minimumImpressions,
    minimumPurchases,
  });
  const stale =
    report.data &&
    (report.data.settings.objective !== objective ||
      report.data.settings.minimumImpressions !== minimumImpressions ||
      report.data.settings.minimumPurchases !== minimumPurchases);
  return (
    <section className="mt-6 rounded-xl border p-4 space-y-3">
      <h3 className="text-lg font-semibold">Copy analysis</h3>
      <p className="text-sm text-muted-foreground">
        Compare messaging, tone, benefits, urgency, offers, specificity and
        length for this account and selected dates. Includes ads created outside
        EvokeLoop. Tags are saved automatically.
      </p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <ChoiceField>
          Compare performance by
          <VisualSelect
            aria-label="Copy report objective"
            className="block rounded border bg-background p-2"
            value={objective}
            onChange={e => setObjective(e.target.value as "cpa" | "roas")}
          >
            <option value="cpa">Purchase CPA</option>
            <option value="roas">Purchase ROAS</option>
          </VisualSelect>
        </ChoiceField>
        <label>
          Minimum impressions
          <input
            aria-label="Copy report minimum impressions"
            type="number"
            min={0}
            max={1000000}
            className="block w-32 rounded border bg-background p-2"
            value={minimumImpressions}
            onChange={e => setImpressions(Number(e.target.value))}
          />
        </label>
        <label>
          Minimum purchases
          <input
            aria-label="Copy report minimum purchases"
            type="number"
            min={1}
            max={10000}
            className="block w-32 rounded border bg-background p-2"
            value={minimumPurchases}
            onChange={e => setPurchases(Number(e.target.value))}
          />
        </label>
        <Button
          disabled={report.isPending || !settings.success}
          onClick={() =>
            settings.success &&
            report.mutate({
              organizationId,
              connectionId,
              range,
              settings: settings.data,
            })
          }
        >
          {report.isPending
            ? "Analyzing copy…"
            : report.data
              ? "Refresh copy analysis"
              : "Analyze copy"}
        </Button>
        <span className="text-xs text-muted-foreground">
          0 AI credits · text signals
        </span>
      </div>
      {report.isPending && (
        <p role="status">Fetching current ad copy and performance from Meta…</p>
      )}
      {report.error && <p role="alert">{report.error.message}</p>}
      {stale ? (
        <p role="status">
          Settings changed. Refresh copy analysis to update the results.
        </p>
      ) : (
        report.data && <CopyEvidenceResult data={report.data} />
      )}
    </section>
  );
}
