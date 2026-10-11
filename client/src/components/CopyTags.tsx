import { useState } from "react";
import {
  copyDimensions,
  copyTaxonomy,
  type CopyTextTags,
  type CopyTags,
} from "@shared/copyTaxonomy";
import { copyFieldNames } from "@shared/copyEvidence";

export function CopyTagTable({ tags }: { tags: CopyTextTags }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            <th className="p-2">Attribute</th>
            <th className="p-2">Assigned values</th>
            <th className="p-2">Supporting copy</th>
          </tr>
        </thead>
        <tbody>
          {tags.dimensions.map(d => (
            <tr key={d.dimension} className="border-t align-top">
              <th className="p-2 font-medium">
                {copyTaxonomy[d.dimension].label}
              </th>
              <td className="p-2">
                {d.labels.length ? (
                  <div className="flex flex-wrap gap-1">
                    {d.labels.map(l => (
                      <span
                        key={l.value}
                        className="rounded bg-muted px-2 py-1"
                      >
                        {l.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  "Unclassified"
                )}
              </td>
              <td className="p-2 text-muted-foreground">
                {d.labels.flatMap(l => l.evidence).join(" · ") ||
                  d.unknownReason ||
                  "No explicit signal detected."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function CopyTaxonomyReference() {
  const [search, setSearch] = useState("");
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Attribute definitions & allowed values
      </summary>
      <p className="my-3 text-muted-foreground">
        Automatic labels use English text signals. A missing match means
        unclassified, not a confident interpretation. Word and character counts
        are measured. Multiple values may apply.
      </p>
      <input
        aria-label="Search copy attributes and values"
        placeholder="Search values, e.g. savings or trust"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded border bg-background p-2"
      />
      {copyDimensions.map(d => {
        const spec = copyTaxonomy[d];
        const values = spec.values.filter(v =>
          `${spec.label} ${v.label} ${v.description}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );
        return values.length ? (
          <div key={d} className="mt-4">
            <h4 className="font-semibold">{spec.label}</h4>
            <p className="text-xs text-muted-foreground">
              {spec.question}{" "}
              {spec.multiple
                ? "Multiple values allowed."
                : "One value per text."}
            </p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {values.map(v => (
                <div key={v.id} className="rounded bg-muted/50 p-2">
                  <dt className="text-xs font-medium">{v.label}</dt>
                  <dd className="text-xs text-muted-foreground">
                    {v.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null;
      })}
    </details>
  );
}
export function SavedCopyTags({ tags }: { tags: CopyTags }) {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Copy attributes · automatically tagged
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Saved with this draft. Tags update when the copy is edited and saved.
        Text signals are suggestions to review, not performance confidence.
      </p>
      {Object.entries(tags.fields).map(([field, variants]) =>
        variants.length ? (
          <details key={field} className="my-3">
            <summary>
              {copyFieldNames[field as keyof typeof copyFieldNames]} ·{" "}
              {variants.length} variant(s)
            </summary>
            {variants.map((tag, i) => (
              <div key={i} className="my-3">
                <p className="rounded bg-muted p-2 whitespace-pre-wrap">
                  {tag.text}
                </p>
                <CopyTagTable tags={tag} />
              </div>
            ))}
          </details>
        ) : null
      )}
      <CopyTaxonomyReference />
    </details>
  );
}
