import { ActionCredits } from "./ActionCredits";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Sparkles } from "lucide-react";
import {
  adCopyFields,
  canGenerateAssetCopy,
  copyFieldLabels,
  copyFieldLimits,
  copySets,
  copyVariantKeys,
  type AdCopyField,
  type CopyContent,
  type CopySet,
  type CopyRegeneration,
} from "@shared/adCopy";
import type { PublicationContent } from "@shared/channels";
import { useAssetCopy } from "@/hooks/useAssetCopy";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { channelInput } from "./ChannelConnections";
import { AdCopyWorkspace } from "./AdCopyWorkspace";

// The Meta copy request and publication contract allow five options per field.
const maximum = 5;
export function AdTextOptionsEditor({
  organizationId,
  assetKeys,
  promotion,
  copyDirection,
  callToAction,
  value,
  onChange,
  studioCategory,
  generationTarget,
  instructions,
  onGenerated,
  defaultInstructions,
  onBusyChange,
}: {
  defaultInstructions?: string;
  onBusyChange?: (busy: boolean) => void;
  generationTarget?: HTMLElement | null;
  instructions?: string;
  onGenerated?: () => void;
  studioCategory?: "setup" | AdCopyField;
  organizationId: number;
  assetKeys: string[];
  promotion?: PublicationContent["promotion"];
  copyDirection?: PublicationContent["copyDirection"];
  callToAction?: PublicationContent["callToAction"];
  value: CopyContent;
  onChange: (value: CopyContent) => void;
}) {
  const [localDirection, setDirection] = useState("");
  const direction = instructions ?? localDirection;
  const studio = generationTarget !== undefined;
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [active, setActive] = useState<AdCopyField>("message");
  const shownField =
    studioCategory && studioCategory !== "setup" ? studioCategory : active;
  const [suggestions, setSuggestions] = useState<CopySet[]>([]);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const context = JSON.stringify({
    organizationId,
    assetKeys,
    promotion,
    copyDirection,
    callToAction,
    direction,
    defaultInstructions,
  });
  const draftKey = JSON.stringify(value);
  const latestDraft = useRef(draftKey);
  latestDraft.current = draftKey;
  const requestedDraft = useRef(draftKey);
  useEffect(() => {
    setSuggestions([]);
    setRevision(r => r + 1);
    setNotice("");
  }, [context]);
  const generator = useAssetCopy(
    {
      organizationId,
      channel: "meta_ads",
      assetKeys,
      promotion,
      copyDirection,
      callToAction,
      direction,
      defaultInstructions,
      currentOptions: suggestions.length ? suggestions : copySets(value),
    },
    (generated, target) => {
      if (latestDraft.current !== requestedDraft.current) {
        setNotice(
          "Your draft changed while copy was generating. Your edits were kept; generate again when ready."
        );
        return;
      }
      setSuggestions(previous =>
        target
          ? previous.map((option, index) =>
              index === target.index
                ? target.field === "set"
                  ? generated[0]
                  : { ...option, [target.field]: generated[0][target.field] }
                : option
            )
          : generated
      );
      setRevision(r => r + 1);
      if (!target) onGenerated?.();
    }
  );
  const busy = generator.isPending;
  useLayoutEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const canGenerate = canGenerateAssetCopy({ assetKeys, promotion, direction });
  function generate(target?: CopyRegeneration) {
    if (busy || !canGenerate) return;
    requestedDraft.current = latestDraft.current;
    setRevision(r => r + 1);
    setNotice("");
    generator.generate(target);
  }
  const valuesFor = (field: AdCopyField) => [
    value[field],
    ...(value.textVariants?.[copyVariantKeys[field]] ?? []),
  ];
  function update(field: AdCopyField, values: string[]) {
    onChange({
      ...value,
      [field]: values[0] ?? "",
      textVariants: {
        messages: [],
        headlines: [],
        descriptions: [],
        ...value.textVariants,
        [copyVariantKeys[field]]: values.slice(1),
      },
    });
  }
  function add(fieldId: string, texts: string[]) {
    const field = fieldId as AdCopyField;
    const values = [...valuesFor(field)];
    const seen = new Set(values.map(v => v.trim().toLowerCase()));
    let added = false;
    for (const raw of texts) {
      const text = raw.trim();
      if (
        !text ||
        text.length > copyFieldLimits[field] ||
        seen.has(text.toLowerCase())
      )
        continue;
      const blank = values.findIndex(v => !v.trim());
      if (blank >= 0) values[blank] = text;
      else if (values.length < maximum) values.push(text);
      else break;
      added = true;
      seen.add(text.toLowerCase());
    }
    if (added) update(field, values);
  }
  const generateButton = (
    <Button
      type="button"
      variant="outline"
      disabled={!canGenerate || busy}
      onClick={() => generate()}
    >
      {suggestions.length ? (
        <RefreshCw className="size-4" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {busy
        ? "Creating suggestions…"
        : suggestions.length
          ? "Regenerate"
          : "Generate copy"}
      <ActionCredits
        organizationId={organizationId}
        operation="channels.draftAssetCopy"
      />
    </Button>
  );
  const workspace = (
    <AdCopyWorkspace
      fields={[
        {
          id: shownField,
          label: copyFieldLabels[shownField],
          singular: copyFieldLabels[shownField].toLowerCase(),
          characters: copyFieldLimits[shownField],
          maximum,
          suggestions: suggestions.map(option => option[shownField]),
          drafts: valuesFor(shownField).map((text, index) => ({
            id: String(index),
            text,
          })),
          occupied: valuesFor(shownField).filter(text => text.trim()).length,
        },
      ]}
      busy={busy}
      generationKey={`${context}:${revision}`}
      headerAction={!studio ? generateButton : undefined}
      onEditSuggestion={(field, index, text) =>
        setSuggestions(previous =>
          previous.map((option, i) =>
            i === index ? { ...option, [field]: text } : option
          )
        )
      }
      onAdd={add}
      onEditDraft={(field, id, text) =>
        update(
          field as AdCopyField,
          valuesFor(field as AdCopyField).map((old, i) =>
            i === Number(id) ? text : old
          )
        )
      }
      onRemoveDraft={(field, id) =>
        update(
          field as AdCopyField,
          valuesFor(field as AdCopyField).filter((_, i) => i !== Number(id))
        )
      }
      onWrite={field => {
        const values = valuesFor(field as AdCopyField);
        if (values.length < maximum)
          update(field as AdCopyField, [...values, ""]);
      }}
      onRegenerate={(field, index) =>
        generate({ field: field as AdCopyField, index })
      }
    />
  );
  return (
    <section
      className="min-w-0 space-y-3"
      aria-label="Ad copy options"
      aria-busy={busy}
    >
      {studio &&
        generationTarget &&
        createPortal(generateButton, generationTarget)}
      {!studio && instructions === undefined && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Optional AI direction
          </summary>
          <textarea
            aria-label="AI copy direction"
            className={channelInput + " mt-2"}
            value={direction}
            onChange={e => setDirection(e.target.value)}
            maxLength={2000}
          />
        </details>
      )}
      {!studioCategory ? (
        <Tabs
          value={shownField}
          onValueChange={field => setActive(field as AdCopyField)}
          orientation={narrow ? "horizontal" : "vertical"}
          className="grid min-w-0 grid-cols-1 items-start gap-3 md:grid-cols-[150px_minmax(0,1fr)]"
        >
          <TabsList
            aria-label="Meta copy fields"
            className="grid h-auto w-full grid-cols-3 gap-1 bg-transparent p-0 md:grid-cols-1"
          >
            {adCopyFields.map(field => (
              <TabsTrigger
                key={field}
                value={field}
                className="min-h-9 justify-start whitespace-normal rounded-md px-3 py-2 text-xs data-[state=active]:bg-accent data-[state=active]:text-primary data-[state=active]:shadow-none sm:text-sm"
              >
                {copyFieldLabels[field]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent
            key={shownField}
            value={shownField}
            className="min-w-0 m-0"
          >
            {workspace}
          </TabsContent>
        </Tabs>
      ) : studioCategory !== "setup" ? (
        workspace
      ) : null}
      {(notice || generator.error) && (
        <p role="status" className="text-sm">
          {notice || generator.error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Suggestions never replace your draft automatically. Meta may combine
        options and may not show every description. Text length guidance varies
        by placement.
      </p>
    </section>
  );
}
