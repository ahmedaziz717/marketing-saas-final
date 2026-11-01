import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import type { CatalogMediaGroupSummary } from "@shared/catalogMedia";

type Link = {
  parentProductId: number;
  componentProductId: number;
  parentName: string;
  componentName: string;
  kind: string;
  sourceCode: string;
  optionAmount: string | null;
  amountMeaning: string;
};
export function CatalogComponentCards({
  organizationId,
  product,
  canEdit,
  onSaved,
}: {
  organizationId: number;
  product: {
    id: number;
    sourceId?: number | null;
    mediaGroups?: CatalogMediaGroupSummary[] | null;
    provenance?: Record<string, string>;
    componentLinks?: Link[];
  };
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [review, setReview] = useState(false);
  const links = product.componentLinks ?? [];
  const isComponent = !!product.provenance?.["component.sourceCode"];
  const hasOptions =
    !isComponent &&
    !!product.sourceId &&
    product.mediaGroups?.some(g => g.role !== "system" && g.eligible);
  if (!hasOptions && !links.length && !isComponent) return null;
  return (
    <details className="mb-4 rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {isComponent
          ? "Component identity and compatibility"
          : "Separate component cards"}
        {links.length
          ? ` (${new Set(links.map(l => (isComponent ? l.parentProductId : l.componentProductId))).size})`
          : ""}
      </summary>
      {isComponent && (
        <p className="mt-2">
          {product.provenance?.["component.kind"]} component only · Source code{" "}
          {product.provenance?.["component.sourceCode"]}. Compatible systems do
          not imply included hardware. No standalone sale price is supplied.
        </p>
      )}
      {!!links.length && (
        <ul className="mt-2 max-h-48 space-y-2 overflow-auto">
          {links.map((l, i) => (
            <li key={i}>
              <a
                className="underline"
                href={`/app/catalog?search=${encodeURIComponent(isComponent ? l.parentName : l.componentName)}`}
              >
                {isComponent ? l.parentName : l.componentName}
              </a>
              {l.optionAmount != null && (
                <span className="block text-xs text-muted-foreground">
                  {l.amountMeaning === "upgrade_delta"
                    ? "System-specific upgrade delta"
                    : "Unclassified source option amount"}
                  : {l.optionAmount} · Not a standalone price
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasOptions && canEdit && (
        <>
          <p className="my-2 text-xs text-muted-foreground">
            Review original component galleries as separate pending catalog
            products. Shared source codes are reused across compatible systems.
            Existing system images and selections are preserved.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReview(!review)}
          >
            {review
              ? "Close component review"
              : "Review separate component cards"}
          </Button>
          {review && (
            <ComponentReview
              organizationId={organizationId}
              productId={product.id}
              onSaved={() => {
                setReview(false);
                onSaved();
              }}
            />
          )}
        </>
      )}
    </details>
  );
}
function ComponentReview({
  organizationId,
  productId,
  onSaved,
}: {
  organizationId: number;
  productId: number;
  onSaved: () => void;
}) {
  const preview = trpc.catalog.previewComponents.useQuery({
    organizationId,
    productId,
  });
  const create = trpc.catalog.createComponents.useMutation({
    onSuccess: onSaved,
  });
  return (
    <div className="mt-3">
      {preview.isLoading && (
        <p>Reading saved source identities and original images…</p>
      )}
      {(preview.error || create.error) && (
        <p role="alert" className="text-destructive">
          {preview.error?.message ?? create.error?.message}
        </p>
      )}
      {preview.data && (
        <>
          <ul className="max-h-80 space-y-3 overflow-auto">
            {preview.data.components.map(c => (
              <li key={c.code} className="flex gap-3 border-b pb-3">
                <img
                  className="h-16 w-16 shrink-0 object-contain"
                  src={c.previewUrl}
                  alt={c.name}
                />
                <div className="min-w-0">
                  <strong>
                    {c.kind}: {c.name}
                  </strong>
                  <p className="break-all text-xs">{c.code}</p>
                  <p className="text-xs">
                    {c.imageCount} original views · at least {c.minimumWidth}×
                    {c.minimumHeight} · {new Set(c.parents.map(p => p.id)).size}{" "}
                    compatible systems
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="my-3 text-xs">
            Creates or reuses pending component cards. No system specifications
            or sale prices are copied. Approval for generation stays separate.
          </p>
          <Button
            disabled={create.isPending || preview.isFetching}
            onClick={() =>
              create.mutate({
                organizationId,
                productId,
                reviewedHash: preview.data!.hash,
                confirmed: true,
              })
            }
          >
            {create.isPending
              ? "Creating component cards…"
              : "Create or update separate cards"}
          </Button>
        </>
      )}
    </div>
  );
}
