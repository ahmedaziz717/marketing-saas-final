import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Field } from "./GoogleCampaignFields";
import type { GoogleAssetInput } from "@shared/googleCampaigns";

export function GooglePmaxAi({
  organizationId,
  onAdd,
}: {
  organizationId: number;
  onAdd: (asset: GoogleAssetInput) => void;
}) {
  const { membership } = useWorkspace();
  const prompts = trpc.prompts.list.useQuery({ organizationId });
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
  const generate = trpc.googleAds.campaigns.draftPmaxCopy.useMutation();
  const save = trpc.prompts.change.useMutation();
  const prompt = prompts.data?.find(p => p.id === "google.pmax.copy");
  const value = override ?? prompt?.value ?? "";
  const maySave = ["owner", "admin"].includes(membership?.role ?? "");
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
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not update the prompt."
      );
    }
  }
  return (
    <details className="google-pmax-ai">
      <summary>Create PMax copy with AI</summary>
      <p>
        Generate draft suggestions using your Brand Kit and selected approved
        products. Apply suggestions individually; existing text stays unchanged.
      </p>
      <Field title="Find approved products (optional)">
        <input value={search} onChange={e => setSearch(e.target.value)} />
      </Field>
      <p>{productIds.length}/10 selected. Leave empty for brand-only copy.</p>
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
        />{" "}
        Use neutral wording if selected categories are mixed or unmapped.
      </label>
      <Field title="Direction for this run">
        <textarea
          value={direction}
          maxLength={2000}
          onChange={e => setDirection(e.target.value)}
        />
      </Field>
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
      <Button
        disabled={!prompt || generate.isPending || !value.trim()}
        onClick={() => {
          setNotice("");
          generate.mutate({
            organizationId,
            productIds,
            neutralCategories,
            direction,
            defaultInstructions: value,
          });
        }}
      >
        {generate.isPending
          ? "Creating suggestions…"
          : "Create suggestions with AI"}
      </Button>
      <p>
        Uses workspace AI credits. Suggestions are never published
        automatically.
      </p>
      {(prompts.error || catalog.error || generate.error) && (
        <p role="alert">
          {(prompts.error ?? catalog.error ?? generate.error)?.message}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {generate.data &&
        (
          [
            ["HEADLINE", generate.data.headlines],
            ["LONG_HEADLINE", generate.data.longHeadlines],
            ["DESCRIPTION", generate.data.descriptions],
          ] as const
        ).map(([field, texts]) => (
          <div key={field}>
            <h4>{field.toLowerCase().replaceAll("_", " ")}</h4>
            {texts.map(text => (
              <p key={text}>
                {text} <small>({text.length} characters)</small>{" "}
                <Button
                  variant="outline"
                  onClick={() => {
                    onAdd({ field, source: { kind: "text", text } });
                  }}
                >
                  Add to draft
                </Button>
              </p>
            ))}
          </div>
        ))}
    </details>
  );
}
