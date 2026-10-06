import { ActionCredits } from "./ActionCredits";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { CatalogEntry } from "@shared/catalog";
export function OfferingDiscovery({
  organizationId,
}: {
  organizationId: number;
}) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState("");
  const [drafts, setDrafts] = useState<CatalogEntry[]>([]);
  const discover = trpc.catalogSources.discoverOfferings.useMutation({
    onSuccess: setDrafts,
    onError: e => toast.error(e.message),
  });
  const save = trpc.catalogSources.addEntries.useMutation({
    onSuccess: async r => {
      const errors = r.filter(i => i.error);
      if (errors.length) toast.error(errors.map(i => i.error).join("; "));
      else {
        toast.success("Offerings saved for catalog review");
        setDrafts([]);
      }
      await utils.catalog.overview.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <section className="rounded-xl border p-5 space-y-3">
      <h3 className="font-semibold">
        Discover platform & subscription offerings
      </h3>
      <p className="text-sm text-muted-foreground">
        Use your homepage or pricing page. Reviews below are suggestions;
        third-party directory products are excluded. Verify prices and terms
        before approval.
      </p>
      <label className="block text-sm">
        Website or pricing URL
        <Input type="url" value={url} onChange={e => setUrl(e.target.value)} />
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={!url || discover.isPending || save.isPending}
        onClick={() => discover.mutate({ organizationId, website: url })}
      >
        {discover.isPending ? "Reading website…" : "Find offerings"}{" "}
        <ActionCredits organizationId={organizationId} />
      </Button>
      {discover.isSuccess && !drafts.length && (
        <p className="text-sm">
          No unsaved suggestions. You can also add an offering manually.
        </p>
      )}
      {drafts.map((d, i) => (
        <div key={i} className="rounded-lg bg-muted p-3">
          <div className="flex justify-between gap-3">
            <strong>{d.name}</strong>
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setDrafts(ds => ds.filter((_, n) => n !== i))}
            >
              Remove
            </Button>
          </div>
          <p className="text-sm">{d.description}</p>
          <p className="text-sm">
            {d.price
              ? `${d.currency} ${d.price} ${d.serviceDetails?.billingPeriod}`
              : "Price not confirmed"}
          </p>
          <a
            className="text-sm underline"
            target="_blank"
            rel="noreferrer"
            href={d.productUrl}
          >
            Source page
          </a>
          <blockquote className="mt-2 text-xs">
            {d.specifications["Source evidence"]}
          </blockquote>
        </div>
      ))}
      {!!drafts.length && (
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate({ organizationId, entries: drafts })}
        >
          Save suggestions for review
        </Button>
      )}
    </section>
  );
}
