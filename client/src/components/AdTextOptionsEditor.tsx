import { ActionCredits } from "./ActionCredits";
import { useState } from "react";
import { MoreHorizontal, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import {
  adCopyFields,
  copyContentFromSets,
  copyFieldLabels,
  copyFieldLimits,
  copySets,
  copyVariantKeys,
  replaceCopyOption,
  type AdCopyField,
  type CopyContent,
} from "@shared/adCopy";
import type { PublicationContent } from "@shared/channels";
import { useAssetCopy } from "@/hooks/useAssetCopy";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { channelInput } from "./ChannelConnections";

export function AdTextOptionsEditor({
  organizationId,
  assetKeys,
  promotion,
  value,
  onChange,
}: {
  organizationId: number;
  assetKeys: string[];
  promotion?: PublicationContent["promotion"];
  value: CopyContent;
  onChange: (value: CopyContent) => void;
}) {
  const [direction, setDirection] = useState("");
  const [active, setActive] = useState<AdCopyField>("message");
  const [undo, setUndo] = useState<{
    before: CopyContent;
    after: string;
    context: string;
  }>();
  const options = copySets(value);
  const snapshot: CopyContent = {
    message: value.message,
    headline: value.headline,
    description: value.description,
    textVariants: value.textVariants,
  };
  const context = JSON.stringify({ organizationId, assetKeys, promotion });
  const generator = useAssetCopy(
    {
      organizationId,
      channel: "meta_ads",
      assetKeys,
      promotion,
      direction,
      currentOptions: options,
    },
    (generated, target) => {
      const next = target
        ? replaceCopyOption(snapshot, target, generated[0])
        : copyContentFromSets(generated);
      setUndo({ before: snapshot, after: JSON.stringify(next), context });
      onChange(next);
    }
  );
  const canUndo =
    undo?.context === context && undo.after === JSON.stringify(snapshot);
  const hasCopy = options.some(option =>
    adCopyFields.some(field => option[field].trim())
  );
  const busy = generator.isPending;
  const label = (field: AdCopyField, index: number) =>
    `${copyFieldLabels[field]} option ${index + 1}`;
  return (
    <section
      className="rounded-xl border p-4 space-y-4 min-w-0"
      aria-label="Ad copy options"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Ad copy</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Five primary texts, five headlines, and five descriptions.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!assetKeys.length || busy}
          onClick={() => generator.generate()}
        >
          <Sparkles className="size-4" />
          {busy && !generator.target
            ? "Generating 5 copy sets…"
            : hasCopy
              ? "Regenerate all 5 sets"
              : "Generate 5 copy sets"}{" "}
          <ActionCredits
            organizationId={organizationId}
            operation="channels.draftAssetCopy"
          />
        </Button>
      </div>
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
          placeholder="For example: focus on everyday elegance with a warm, concise voice."
        />
      </details>
      <p className="text-xs text-muted-foreground">
        {assetKeys.length
          ? "Regenerate any option, or use its ⋯ menu for the full set."
          : "Select an approved image to generate copy, or write your own."}
      </p>
      <Tabs
        value={active}
        onValueChange={field => setActive(field as AdCopyField)}
      >
        <TabsList className="grid h-auto w-full grid-cols-3">
          {adCopyFields.map(field => (
            <TabsTrigger
              key={field}
              value={field}
              className="flex-col gap-0.5 px-1 py-2 text-xs sm:text-sm"
            >
              {field === "message"
                ? "Primary text"
                : field === "headline"
                  ? "Headlines"
                  : "Descriptions"}
              <span className="text-xs text-muted-foreground">
                {options.filter(o => o[field].trim()).length}/5
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {adCopyFields.map(field => {
          const variantKey = copyVariantKeys[field];
          const values = [
            value[field],
            ...(value.textVariants?.[variantKey] ?? []),
          ];
          return (
            <TabsContent
              key={field}
              value={field}
              forceMount
              hidden={active !== field}
              className="space-y-3 mt-4"
            >
              {values.map((text, index) => {
                const regenerating =
                  busy &&
                  generator.target?.index === index &&
                  (generator.target.field === field ||
                    generator.target.field === "set");
                return (
                  <div
                    key={index}
                    className="rounded-lg border p-3 space-y-2 bg-background/60"
                  >
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <label
                        htmlFor={
                          index === 0 ? `pub-${field}` : `pub-${field}-${index}`
                        }
                        className="text-sm font-medium"
                      >
                        {label(field, index)}
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Regenerate ${label(field, index).toLowerCase()}`}
                          disabled={!assetKeys.length || busy}
                          onClick={() => generator.generate({ index, field })}
                        >
                          <RefreshCw
                            className={`size-3.5 ${regenerating ? "animate-spin" : ""}`}
                          />
                          {regenerating ? "Regenerating…" : "Regenerate"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={busy}
                              aria-label={`More actions for ${label(field, index).toLowerCase()}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!assetKeys.length}
                              onSelect={() =>
                                generator.generate({ index, field: "set" })
                              }
                            >
                              Regenerate full set {index + 1} (all 3 fields){" "}
                              <ActionCredits
                                organizationId={organizationId}
                                operation="channels.draftAssetCopy"
                              />
                            </DropdownMenuItem>
                            {index > 0 && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  onChange({
                                    ...snapshot,
                                    textVariants: {
                                      messages: [],
                                      headlines: [],
                                      descriptions: [],
                                      ...value.textVariants,
                                      [variantKey]: values
                                        .slice(1)
                                        .filter((_, i) => i !== index - 1),
                                    },
                                  })
                                }
                              >
                                Remove this{" "}
                                {copyFieldLabels[field].toLowerCase()} option
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <textarea
                      id={
                        index === 0 ? `pub-${field}` : `pub-${field}-${index}`
                      }
                      aria-label={label(field, index)}
                      className={
                        channelInput +
                        (field === "message" ? " min-h-24" : " min-h-16")
                      }
                      rows={field === "message" ? 3 : 2}
                      maxLength={copyFieldLimits[field]}
                      value={text}
                      onChange={e =>
                        onChange(
                          replaceCopyOption(
                            snapshot,
                            { index, field },
                            { ...options[index], [field]: e.target.value }
                          )
                        )
                      }
                    />
                    <p className="text-right text-xs text-muted-foreground">
                      {text.length}/{copyFieldLimits[field]}
                    </p>
                  </div>
                );
              })}
              {values.length < 5 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onChange({
                      ...snapshot,
                      textVariants: {
                        messages: [],
                        headlines: [],
                        descriptions: [],
                        ...value.textVariants,
                        [variantKey]: [...values.slice(1), ""],
                      },
                    })
                  }
                >
                  Add {copyFieldLabels[field].toLowerCase()} option
                </Button>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
      {canUndo && (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            onChange(undo.before);
            setUndo(undefined);
          }}
        >
          <Undo2 className="size-4" />
          Undo last generation
        </Button>
      )}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {busy
          ? "Creating fresh copy. Your edits will be kept if you change anything while it generates."
          : "AI uses your images and brand context. Review all copy before approval. Meta may combine options and may not show every description."}
      </p>
    </section>
  );
}
