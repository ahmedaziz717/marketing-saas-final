import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Field } from "./GoogleCampaignFields";
import type { GoogleAssetInput } from "@shared/googleCampaigns";
import {
  emptyGoogleCopy,
  googleCopyFields,
  googleCopySpecs,
  remainingGoogleCopy,
  type GoogleCopyField,
  type GoogleCopySet,
} from "@shared/googleCopy";

export function GooglePmaxAi({
  organizationId,
  connectionId,
  assets = [],
  occupiedFields = [],
  existingCopy = emptyGoogleCopy(),
  onAdd,
  onApply,
}: {
  organizationId: number;
  connectionId?: string;
  assets?: GoogleAssetInput[];
  occupiedFields?: string[];
  existingCopy?: GoogleCopySet;
  onAdd: (asset: GoogleAssetInput) => void;
  onApply?: (assets: GoogleAssetInput[]) => void;
}) {
  const { membership } = useWorkspace();
  const prompts = trpc.prompts.list.useQuery({ organizationId });
  const library = trpc.assetLibrary.list.useQuery({ organizationId });
  const [search, setSearch] = useState("");
  const catalog = trpc.catalog.overview.useQuery({
    organizationId,
    status: "approved",
    search,
  });
  const [productIds, setProductIds] = useState<number[]>([]);
  const [neutralCategories, setNeutral] = useState(false);
  const [direction, setDirection] = useState("");
  const [override, setOverride] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [suggestions, setSuggestions] = useState<GoogleCopySet | null>(null);
  const [counts, setCounts] = useState({
    headlines: 15,
    longHeadlines: 5,
    descriptions: 5,
  });
  const generate = trpc.googleAds.campaigns.draftPmaxCopy.useMutation();
  const save = trpc.prompts.change.useMutation();
  const prompt = prompts.data?.find(p => p.id === "google.pmax.copy");
  const value = override ?? prompt?.value ?? "";
  const maySave = ["owner", "admin"].includes(membership?.role ?? "");
  const media = assets.filter(a => a.source.kind !== "text");
  const contextKey = JSON.stringify({
    organizationId,
    connectionId,
    media,
    productIds,
    neutralCategories,
    direction,
    value,
  });
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  useEffect(() => {
    setSuggestions(null);
    setNotice("");
  }, [contextKey]);
  const remaining = remainingGoogleCopy(occupiedFields);
  const requested = Object.fromEntries(
    googleCopyFields.map(key => [key, Math.min(counts[key], remaining[key])])
  ) as typeof counts;
  const isDuplicate = (key: GoogleCopyField, text: string) =>
    existingCopy[key].some(
      v => v.trim().toLowerCase() === text.trim().toLowerCase()
    );
  const assetFor = (key: GoogleCopyField, text: string): GoogleAssetInput => ({
    field: googleCopySpecs[key].field,
    source: { kind: "text", text: text.trim() },
  });
  async function run(target?: GoogleCopyField, index?: number) {
    const snapshot = contextKey;
    setNotice("");
    const countRequest = target
      ? { headlines: 0, longHeadlines: 0, descriptions: 0, [target]: 1 }
      : requested;
    try {
      const result = await generate.mutateAsync({
        organizationId,
        connectionId,
        selectedAssets: media,
        productIds,
        neutralCategories,
        direction,
        defaultInstructions: value,
        copyRequest: { counts: countRequest, target, existingCopy },
      });
      if (currentContext.current !== snapshot) return;
      if (target && index !== undefined)
        setSuggestions(previous =>
          previous
            ? {
                ...previous,
                [target]: previous[target].map((v, i) =>
                  i === index ? result[target][0] : v
                ),
              }
            : previous
        );
      else setSuggestions(result);
    } catch (error) {
      if (currentContext.current === snapshot)
        setNotice(
          error instanceof Error
            ? error.message
            : "Suggestions could not be generated. Your draft is unchanged."
        );
    }
  }
  async function changeDefault(
    action:
      | "save"
      | "restore_system"
      | "restore_original"
      | "restore_brand_initial"
  ) {
    if (!prompt) return;
    setNotice("");
    try {
      await save.mutateAsync({
        organizationId,
        promptId: prompt.id,
        expectedRevision: prompt.revision,
        action,
        ...(action === "save" ? { value } : {}),
        reason: "PMax copy default updated from campaign composer",
      });
      await prompts.refetch();
      setOverride(null);
      setNotice("Shared prompt default updated.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not update the prompt."
      );
    }
  }
  return (
    <section
      className="google-pmax-ai"
      aria-label="Generate copy from selected assets"
    >
      <h3>Create PMax copy with AI</h3>
      <p>
        Start with your selected creative. AI uses its imagery and saved copy,
        your Brand Kit and confirmed product facts. Review and edit every
        suggestion before adding it. Existing Google text is never replaced
        automatically.
      </p>
      <div
        aria-label="Assets informing AI copy"
        className="google-current-assets"
      >
        {media.map((asset, index) => {
          const item =
            asset.source.kind === "library"
              ? library.data?.find(
                  a => a.key === (asset.source as { key: string }).key
                )
              : undefined;
          return (
            <figure key={JSON.stringify(asset)}>
              {item?.mediaType === "image" && (
                <img src={item.url} alt={item.name} />
              )}
              <figcaption>
                {item?.name ??
                  (asset.source.kind === "existing"
                    ? `Google asset ${asset.source.id}`
                    : asset.source.kind === "youtube"
                      ? `Video ${asset.source.videoId}`
                      : `Selected asset ${index + 1}`)}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {!media.length && (
        <p role="status">
          No creative selected yet. Pick images in Creative first, or explicitly
          generate brand-only copy.
        </p>
      )}
      <p>
        {media.length} selected assets inform this run. Videos use their saved
        metadata, not a video-content analysis.
      </p>
      <div className="google-form-grid">
        {googleCopyFields.map(key => (
          <Field
            key={key}
            title={`${googleCopySpecs[key].label} to generate · ${remaining[key]} slots available`}
          >
            <input
              type="number"
              min={0}
              max={remaining[key]}
              value={requested[key]}
              onChange={e =>
                setCounts(v => ({
                  ...v,
                  [key]: Math.max(
                    0,
                    Math.min(
                      remaining[key],
                      Math.trunc(Number(e.target.value) || 0)
                    )
                  ),
                }))
              }
            />
            <small>
              {googleCopySpecs[key].characters} characters each ·{" "}
              {googleCopySpecs[key].maximum} maximum per group
            </small>
          </Field>
        ))}
      </div>
      <details>
        <summary>Product facts and additional direction</summary>
        <Field title="Find approved products (optional)">
          <input value={search} onChange={e => setSearch(e.target.value)} />
        </Field>
        <p>
          {productIds.length}/10 extra products selected. Products linked to
          selected creatives are included when still approved.
        </p>
        <Button variant="ghost" onClick={() => setProductIds([])}>
          Clear products
        </Button>
        <div style={{ maxHeight: 180, overflowY: "auto" }}>
          {catalog.data?.products.map(p => (
            <label key={p.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={productIds.includes(p.id)}
                disabled={!productIds.includes(p.id) && productIds.length >= 10}
                onChange={e =>
                  setProductIds(ids =>
                    e.target.checked
                      ? [...ids, p.id]
                      : ids.filter(id => id !== p.id)
                  )
                }
              />
              {p.name} —{" "}
              {p.marketingCategory.category?.name ?? "Unmapped category"}
            </label>
          ))}
        </div>
        {catalog.data?.hasMore && <p>Search to find more products.</p>}
        <label>
          <input
            type="checkbox"
            checked={neutralCategories}
            onChange={e => setNeutral(e.target.checked)}
          />
          Use neutral wording if selected categories are mixed or unmapped.
        </label>
        <Field title="Direction for this run">
          <textarea
            value={direction}
            maxLength={2000}
            onChange={e => setDirection(e.target.value)}
          />
        </Field>
      </details>
      <details>
        <summary>Prompt settings</summary>
        <Field title="Shared PMax prompt — edits apply to this run until explicitly saved">
          <textarea
            rows={5}
            value={value}
            maxLength={6000}
            onChange={e => setOverride(e.target.value)}
          />
        </Field>
        <Button variant="ghost" onClick={() => setOverride(null)}>
          Use saved default
        </Button>
        {maySave && (
          <div>
            <Button
              variant="outline"
              disabled={!prompt || save.isPending || !value.trim()}
              onClick={() => void changeDefault("save")}
            >
              Save as shared default
            </Button>
            <Button
              variant="ghost"
              disabled={!prompt || save.isPending}
              onClick={() => void changeDefault("restore_system")}
            >
              Restore system default
            </Button>
            <Button
              variant="ghost"
              disabled={!prompt || save.isPending}
              onClick={() => void changeDefault("restore_original")}
            >
              Restore original default
            </Button>
            <Button
              variant="ghost"
              disabled={!prompt?.restorePoints?.brand || save.isPending}
              onClick={() => void changeDefault("restore_brand_initial")}
            >
              Restore initial Brand Kit default
            </Button>
          </div>
        )}
      </details>
      <Button
        disabled={
          !prompt ||
          generate.isPending ||
          !value.trim() ||
          !Object.values(requested).some(Boolean)
        }
        onClick={() => void run()}
      >
        {generate.isPending
          ? "Creating suggestions…"
          : suggestions
            ? "Regenerate all suggestions"
            : "Create suggestions with AI"}
      </Button>
      <p>
        Uses workspace AI credits. Generation never activates anything.{" "}
        {Object.values(requested).reduce((n, v) => n + v, 0)} suggestions
        requested.
      </p>
      {(prompts.error || catalog.error || generate.error || library.error) && (
        <p role="alert">
          {
            (prompts.error ?? catalog.error ?? generate.error ?? library.error)
              ?.message
          }
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {suggestions &&
        googleCopyFields.map(key => (
          <div key={key}>
            <h4>{googleCopySpecs[key].label}</h4>
            {suggestions[key].map((text, index) => (
              <div key={index} className="google-copy-suggestion">
                <Field
                  title={`${googleCopySpecs[key].label} suggestion ${index + 1}`}
                >
                  <textarea
                    disabled={generate.isPending}
                    value={text}
                    onChange={e =>
                      setSuggestions(v =>
                        v
                          ? {
                              ...v,
                              [key]: v[key].map((old, i) =>
                                i === index ? e.target.value : old
                              ),
                            }
                          : v
                      )
                    }
                  />
                </Field>
                <small>
                  {text.length}/{googleCopySpecs[key].characters} characters
                </small>
                <Button
                  variant="outline"
                  disabled={
                    !text.trim() ||
                    text.length > googleCopySpecs[key].characters ||
                    !remaining[key] ||
                    isDuplicate(key, text)
                  }
                  onClick={() => onAdd(assetFor(key, text))}
                >
                  {isDuplicate(key, text) ? "Already in draft" : "Add to draft"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={generate.isPending}
                  onClick={() => void run(key, index)}
                >
                  Regenerate this{" "}
                  {key === "descriptions" ? "description" : "headline"}
                </Button>
              </div>
            ))}
          </div>
        ))}
      {suggestions && onApply && (
        <Button
          variant="outline"
          onClick={() => {
            const additions: GoogleAssetInput[] = [];
            for (const key of googleCopyFields) {
              const seen = new Set(
                existingCopy[key].map(v => v.trim().toLowerCase())
              );
              const values = suggestions[key]
                .map(v => v.trim())
                .filter(
                  text =>
                    text &&
                    text.length <= googleCopySpecs[key].characters &&
                    !seen.has(text.toLowerCase()) &&
                    !!seen.add(text.toLowerCase())
                );
              if (values.length > remaining[key]) {
                setNotice(
                  `Only ${remaining[key]} ${googleCopySpecs[key].label.toLowerCase()} slots remain. Add individual suggestions or edit your draft; nothing was replaced.`
                );
                return;
              }
              additions.push(...values.map(text => assetFor(key, text)));
            }
            onApply(additions);
            setNotice(
              `${additions.length} suggestions added to this draft. Existing text was kept.`
            );
          }}
        >
          Add all valid suggestions to draft
        </Button>
      )}
    </section>
  );
}
