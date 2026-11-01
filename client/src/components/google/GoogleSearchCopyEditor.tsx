import { useEffect, useRef, useState } from "react";
import type { GoogleAdContent } from "@shared/googleCampaigns";
import {
  searchCopyFields,
  searchCopyUrlSchema,
  type SearchCopyField,
  type SearchCopySuggestions,
} from "@shared/googleSearchCopy";
import { AdCopyWorkspace } from "../AdCopyWorkspace";
import { Button } from "../ui/button";
import { trpc } from "@/lib/trpc";
import { useGoogleFieldValidation } from "./GoogleValidation";

export function GoogleSearchCopyEditor({
  organizationId,
  connectionId,
  ad,
  onChange,
}: {
  organizationId: number;
  connectionId: string;
  ad: GoogleAdContent;
  onChange: (ad: GoogleAdContent) => void;
}) {
  const generate = trpc.googleAds.campaigns.draftSearchCopy.useMutation();
  const context = JSON.stringify([organizationId, connectionId, ad.finalUrl]);
  const latest = useRef(context);
  latest.current = context;
  const sequence = useRef(0);
  const [result, setResult] = useState<{
    context: string;
    version: number;
    copy: SearchCopySuggestions;
  } | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setResult(null);
    setNotice("");
  }, [context]);
  const validation = {
    headlines: useGoogleFieldValidation("ad.headlines"),
    descriptions: useGoogleFieldValidation("ad.descriptions"),
    path1: useGoogleFieldValidation("ad.path1"),
    path2: useGoogleFieldValidation("ad.path2"),
  };
  const values = (key: SearchCopyField): string[] =>
    key === "headlines" || key === "descriptions" ? ad[key] : [ad[key]];
  const write = (key: SearchCopyField, texts: string[]) =>
    onChange({
      ...ad,
      [key]:
        key === "headlines" || key === "descriptions"
          ? texts
          : (texts[0] ?? ""),
    });
  const suggestions = result?.context === context ? result.copy : null;
  async function run() {
    if (!searchCopyUrlSchema.safeParse(ad.finalUrl).success) {
      setNotice(
        "Add a public HTTPS landing page in Creative before generating copy."
      );
      return;
    }
    const snapshot = context;
    const version = ++sequence.current;
    setResult(null);
    setNotice("");
    try {
      const copy = await generate.mutateAsync({
        organizationId,
        url: ad.finalUrl,
        existingCopy: {
          headlines: ad.headlines,
          descriptions: ad.descriptions,
          path1: ad.path1,
          path2: ad.path2,
        },
      });
      if (latest.current === snapshot && sequence.current === version)
        setResult({ context: snapshot, version, copy });
    } catch (error) {
      if (latest.current === snapshot && sequence.current === version)
        setNotice(
          error instanceof Error
            ? error.message
            : "Generation failed. Your draft is unchanged."
        );
    }
  }
  return (
    <>
      <p>
        Search needs 3–15 headlines and 2–4 descriptions. Display paths are
        optional.
      </p>
      <p>
        AI uses your campaign landing page, Brand Kit and workspace AI credits.
        Review suggestions before adding them.
      </p>
      <p className="activation-help">
        Landing page: {ad.finalUrl || "Not set — add it in Creative"}
      </p>
      <Button
        type="button"
        disabled={generate.isPending}
        onClick={() => void run()}
      >
        {generate.isPending
          ? "Reading page and generating…"
          : "AI generate all copy"}
      </Button>
      {notice && <p role="alert">{notice}</p>}
      <AdCopyWorkspace
        busy={generate.isPending}
        generationKey={`${context}:${result?.version ?? sequence.current}`}
        fields={(Object.keys(searchCopyFields) as SearchCopyField[]).map(
          key => {
            const spec = searchCopyFields[key];
            const errors = validation[key];
            return {
              id: key,
              ...spec,
              suggestions: suggestions?.[key] ?? [],
              occupied: values(key).filter(text => text.trim()).length,
              drafts: values(key).map((text, index) => ({
                id: String(index),
                text,
              })),
              validationPath: `ad.${key}`,
              invalid: errors.invalid,
              errorId: errors.errorId,
              error: errors.invalid ? (
                <p id={errors.errorId} role="alert">
                  {errors.messages.join(" ")}
                </p>
              ) : undefined,
            };
          }
        )}
        onEditSuggestion={(field, index, text) =>
          setResult(previous =>
            previous && previous.context === context
              ? {
                  ...previous,
                  copy: {
                    ...previous.copy,
                    [field]: previous.copy[field as SearchCopyField].map(
                      (value, i) => (i === index ? text : value)
                    ),
                  },
                }
              : previous
          )
        }
        onEditDraft={(field, id, text) => {
          const key = field as SearchCopyField;
          const lines = text.split(/\r?\n/);
          if (
            (key === "headlines" || key === "descriptions") &&
            lines.length > 1
          ) {
            const next = [...values(key)];
            next.splice(Number(id), 1, ...lines.filter(line => line.trim()));
            if (next.length > searchCopyFields[key].maximum)
              setNotice(
                "Pasted copy exceeds the available slots. Your draft is unchanged; paste fewer lines."
              );
            else write(key, next);
          } else
            write(
              key,
              values(key).map((value, index) =>
                index === Number(id) ? text : value
              )
            );
        }}
        onRemoveDraft={(field, id) =>
          write(
            field as SearchCopyField,
            values(field as SearchCopyField).filter(
              (_, index) => index !== Number(id)
            )
          )
        }
        onWrite={field => {
          const key = field as SearchCopyField;
          if (values(key).length < searchCopyFields[key].maximum)
            write(key, [...values(key), ""]);
        }}
        onAdd={(field, texts) => {
          const key = field as SearchCopyField;
          const next = [...values(key)];
          for (const text of texts) {
            const blank = next.findIndex(value => !value.trim());
            if (blank >= 0) next[blank] = text;
            else next.push(text);
          }
          write(key, next);
        }}
        onReplace={(field, texts) => write(field as SearchCopyField, texts)}
      />
    </>
  );
}
