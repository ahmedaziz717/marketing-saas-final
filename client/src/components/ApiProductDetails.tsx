import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
function ComponentImage({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p className="text-xs text-muted-foreground">Image unavailable</p>
  ) : (
    <img
      className="h-20 w-20 object-contain rounded bg-white"
      loading="lazy"
      referrerPolicy="no-referrer"
      src={url}
      alt={name}
      onError={() => setFailed(true)}
    />
  );
}
export function ApiProductDetails({
  organizationId,
  productId,
  representedCodes = [],
}: {
  organizationId: number;
  productId: number;
  representedCodes?: string[];
}) {
  const details = trpc.catalogSources.productDetails.useMutation();
  return (
    <details className="my-3 rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Installed components & available upgrades
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Inspect the current API configuration. These options stay separate from
        the approved product specifications.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={details.isPending}
        onClick={() => details.mutate({ organizationId, productId })}
      >
        {details.isPending
          ? "Reading configuration…"
          : "Read current configuration"}
      </Button>
      {details.error && (
        <p role="alert" className="mt-2 text-destructive">
          {details.error.message}
        </p>
      )}
      {details.data && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            {details.data.priceNote}
          </p>
          {!details.data.components.length && (
            <p>No component configuration was returned by this source.</p>
          )}
          {details.data.components.map((group, i) => (
            <details key={i} className="rounded border p-2">
              <summary className="cursor-pointer capitalize">
                {group.group.replaceAll("_", " ")} · {group.optionCount}{" "}
                available options
              </summary>
              <p className="mt-2 font-medium">Installed</p>
              {group.selected ? (
                <div className="my-2 flex items-start gap-3">
                  {group.selected.imageUrl && (
                    <ComponentImage
                      url={group.selected.imageUrl}
                      name={group.selected.name}
                    />
                  )}
                  <div>
                    <p>
                      {group.selected.quantity > 1
                        ? `${group.selected.quantity} × `
                        : ""}
                      {group.selected.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {group.selected.code}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No component selected</p>
              )}
              <p className="mt-3 font-medium">Optional upgrades</p>
              {group.options.some(option =>
                representedCodes.includes(option.code)
              ) && (
                <p className="my-2 text-xs text-muted-foreground">
                  Represented options appear as separate catalog component cards
                  above.
                </p>
              )}
              {group.options.some(
                option => !representedCodes.includes(option.code)
              ) ? (
                <ul className="mt-2 space-y-2">
                  {group.options
                    .filter(option => !representedCodes.includes(option.code))
                    .map((option, j) => (
                      <li
                        key={`${option.code}:${j}`}
                        className="rounded border p-2"
                      >
                        <div className="flex items-start gap-3">
                          {option.imageUrl && (
                            <ComponentImage
                              url={option.imageUrl}
                              name={option.name}
                            />
                          )}
                          <div>
                            <p>{option.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {option.code}
                              {option.apiPrice
                                ? ` · API option price: ${option.apiPrice}`
                                : ""}
                            </p>
                            <p className="mt-1 text-xs">{option.description}</p>
                          </div>
                        </div>
                        {Object.keys(option.specifications).length > 0 && (
                          <details className="mt-2 text-xs">
                            <summary>Component specifications</summary>
                            <ul>
                              {Object.entries(option.specifications).map(
                                ([k, v]) => (
                                  <li key={k}>
                                    {k.replaceAll("_", " ")}: {v}
                                  </li>
                                )
                              )}
                            </ul>
                          </details>
                        )}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No enabled upgrades were returned.
                </p>
              )}
              {group.truncated && (
                <p className="mt-2 text-xs">
                  Showing {group.options.length} of {group.optionCount} options.
                </p>
              )}
            </details>
          ))}
        </div>
      )}
    </details>
  );
}
