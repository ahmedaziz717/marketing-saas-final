import { useState } from "react";
import { dimensionNames, type Dimension } from "@shared/optimization";
import type { LibraryAsset } from "@shared/assetLibrary";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { VisualSelect } from "./choices/VisualSelect";
export function CreativeDimensions({
  asset,
  organizationId,
  canEdit,
  onSaved,
}: {
  asset: LibraryAsset;
  organizationId: number;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [dimension, setDimension] = useState<Dimension>("theme"),
    [value, setValue] = useState(""),
    [evidence, setEvidence] = useState(""),
    [status, setStatus] = useState<"known" | "unknown" | "not_applicable">(
      "known"
    ),
    [confidence, setConfidence] = useState(0.9);
  const save = trpc.assetLibrary.classifyDimension.useMutation({
    onSuccess: () => {
      toast.success("Dimension review saved for this asset version");
      onSaved();
    },
    onError: e => toast.error(e.message),
  });
  const snapshot = asset.intelligence;
  if (!snapshot) return null;
  const counts = Object.values(snapshot.observed).reduce(
    (a, f) => ({ ...a, [f.status]: a[f.status] + 1 }),
    { known: 0, unknown: 0, not_applicable: 0 }
  );
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Creative dimensions · {counts.known} known · {counts.unknown} to review
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        {dimensionNames.length} dimensions · taxonomy {snapshot.taxonomyVersion}{" "}
        · {counts.not_applicable} not applicable. Requested settings are kept
        separately from observed facts. Delivery dimensions fill in after
        activation.
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left p-2">Dimension</th>
              <th className="text-left p-2">Requested</th>
              <th className="text-left p-2">Observed</th>
            </tr>
          </thead>
          <tbody>
            {dimensionNames.map(d => {
              const f = snapshot.observed[d];
              return (
                <tr key={d} className="border-t">
                  <td className="p-2 capitalize">{d.replaceAll("_", " ")}</td>
                  <td className="p-2">
                    {snapshot.requested[d]?.values.join(", ") || "—"}
                  </td>
                  <td className="p-2">
                    <span>
                      {f?.values.join(", ") ||
                        f?.status.replaceAll("_", " ") ||
                        "unknown"}
                    </span>
                    <span className="block text-muted-foreground">
                      {f?.status === "known"
                        ? `${Math.round(f.confidence * 100)}% · ${f.source}`
                        : f?.reason}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <fieldset disabled={save.isPending} className="mt-4 space-y-3">
          <legend className="font-medium">Review a dimension</legend>
          <VisualSelect
            aria-label="Dimension to review"
            value={dimension}
            onChange={e => setDimension(e.target.value as Dimension)}
          >
            {dimensionNames.map(d => (
              <option key={d} value={d}>
                {d.replaceAll("_", " ")}
              </option>
            ))}
          </VisualSelect>
          <VisualSelect
            aria-label="Dimension status"
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
          >
            <option value="known">Known</option>
            <option value="unknown">Unknown</option>
            <option value="not_applicable">Not applicable</option>
          </VisualSelect>
          {status === "known" && (
            <label className="block">
              Value
              <input
                className="mt-1 w-full rounded border bg-background p-2"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="e.g. cinematic"
              />
            </label>
          )}
          <label className="block">
            Evidence or reason
            <textarea
              className="mt-1 w-full rounded border bg-background p-2"
              value={evidence}
              onChange={e => setEvidence(e.target.value)}
              placeholder="What in the finished asset supports this?"
            />
          </label>
          <label className="block">
            Confidence ({Math.round(confidence * 100)}%)
            <input
              className="w-full"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
            />
          </label>
          <Button
            disabled={
              evidence.trim().length < 5 ||
              (status === "known" && !value.trim())
            }
            onClick={() =>
              save.mutate({
                organizationId,
                key: asset.key,
                fingerprint: asset.fingerprint,
                dimension,
                status,
                values: status === "known" ? [value.trim()] : [],
                evidence,
                confidence,
              })
            }
          >
            Save dimension review
          </Button>
        </fieldset>
      )}
    </details>
  );
}
