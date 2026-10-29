import { AdTextOptionsEditor } from "../AdTextOptionsEditor";
import { TaskPromptField } from "../TaskPromptField";
import { useState, useEffect, useLayoutEffect, type ReactNode } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { Channel, PublicationContent } from "@shared/channels";
import {
  adCopyFields,
  canGenerateAssetCopy,
  copyFieldLabels,
  copyFieldLimits,
  copyVariantKeys,
  type AdCopyField,
  type CopySet,
} from "@shared/adCopy";
import { copyDirectionBrief } from "@shared/copyDirection";
import { replaceSocialCaption } from "@shared/socialPost";
import { useAssetCopy } from "@/hooks/useAssetCopy";
import { ActionCredits } from "../ActionCredits";
import { SocialPostFields } from "../SocialPostFields";
import { MetaCallToActionTiles } from "./MetaCallToActionTiles";

// A small persisted fingerprint lets a reopened draft detect changed directions.
function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `v1-${(hash >>> 0).toString(16)}`;
}
function SocialStudioCopyComposer({
  organizationId,
  channel,
  assetKeys,
  hasMedia,
  content,
  onChange,
  errors,
  onEditChoices,
  onEditBrief,
  preview,
  onBusyChange,
}: {
  organizationId: number;
  channel: Channel;
  assetKeys: string[];
  hasMedia: boolean;
  content: PublicationContent;
  onChange: (value: PublicationContent) => void;
  errors: Record<string, string>;
  onEditChoices: () => void;
  onEditBrief: () => void;
  preview: ReactNode;
  onBusyChange?: (busy: boolean) => void;
}) {
  const meta = channel === "meta_ads";
  const choices = copyDirectionBrief(content.copyDirection);
  const context = fingerprint({
    organizationId,
    channel,
    assetKeys,
    choices,
    promotion: content.promotion,
    instructions: content.copyInstructions ?? "",
    defaultInstructions: content.copyDefaultInstructions,
    cta: meta ? content.callToAction : undefined,
  });
  const changed =
    !!content.copyGenerationContext &&
    content.copyGenerationContext !== context;
  const [notice, setNotice] = useState("");
  const input = {
    organizationId,
    channel,
    assetKeys,
    promotion: content.promotion,
    copyDirection: content.copyDirection,
    callToAction: meta ? content.callToAction : undefined,
    direction: content.copyInstructions ?? "",
    defaultInstructions: content.copyDefaultInstructions,
    currentOptions: [
      {
        message: content.message,
        headline: content.headline,
        description: content.description,
      },
    ],
  };
  const apply = (copy: CopySet) => ({
    ...content,
    ...(meta
      ? copy
      : { message: replaceSocialCaption(content.message, copy.message) }),
    textVariants: undefined,
  });
  const generator = useAssetCopy(input, (options, target) => {
    if (!options[0]) return;
    if (target && target.field !== "set") {
      const field = target.field;
      onChange({
        ...content,
        [field]:
          !meta && field === "message"
            ? replaceSocialCaption(content.message, options[0].message)
            : options[0][field],
      });
      setNotice(
        `${meta ? copyFieldLabels[field] : "Caption"} updated. Your other fields were kept.`
      );
    } else {
      onChange({
        ...apply(options[0]),
        copyAlternatives: options.slice(1, 5),
        copyGenerationContext: context,
      });
      setNotice(
        "Your first draft is ready below. Edit it or apply another version."
      );
    }
  });
  const busy = generator.isPending;
  const [elapsed, setElapsed] = useState(0);
  useLayoutEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [busy]);
  const canGenerate = canGenerateAssetCopy(input);
  const hasCopy = !!(
    content.message.trim() ||
    (meta && (content.headline.trim() || content.description.trim()))
  );
  const fields: readonly AdCopyField[] = meta ? adCopyFields : ["message"];
  const hasVariants =
    meta &&
    adCopyFields.some(
      field => content.textVariants?.[copyVariantKeys[field]].length
    );
  const regenerate = (field: AdCopyField) => (
    <button
      type="button"
      className="cfg-secondary studio-copy-field-action"
      disabled={busy || !canGenerate}
      onClick={() => generator.generate({ index: 0, field })}
    >
      <RefreshCw size={14} /> Regenerate{" "}
      {meta ? copyFieldLabels[field].toLowerCase() : "caption"}
      <ActionCredits
        organizationId={organizationId}
        operation="channels.draftAssetCopy"
      />
    </button>
  );
  return (
    <section
      className="studio-copy-compose"
      aria-label="Compose copy"
      aria-busy={busy}
    >
      <TaskPromptField
        promptId="copy.asset"
        label="Copy generation instructions"
        value={content.copyDefaultInstructions}
        onChange={copyDefaultInstructions =>
          onChange({ ...content, copyDefaultInstructions })
        }
      />
      <div className="studio-copy-context">
        <div className="studio-copy-context-heading">
          <strong>Your copy direction</strong>
          <button type="button" onClick={onEditChoices}>
            Edit choices
          </button>
        </div>
        <p>
          {choices.length
            ? choices
                .map(
                  choice =>
                    `${choice.attribute}: ${choice.values.map(value => value.label).join(", ")}`
                )
                .join(" · ")
            : "AI chooses the direction from your brief and brand."}
        </p>
        <details>
          <summary>Review brief</summary>
          <dl>
            {(
              [
                ["offer", "Promoting"],
                ["audience", "Audience"],
                ["goal", "Goal"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{content.promotion?.[key] || "Not specified"}</dd>
              </div>
            ))}
          </dl>
          {content.copyInstructions && <p>{content.copyInstructions}</p>}
          <button type="button" onClick={onEditBrief}>
            Edit brief
          </button>
        </details>
      </div>
      {changed && (
        <p role="status" className="studio-copy-changed">
          Your directions changed—update copy to use your latest choices. Your
          current text is kept until you regenerate.
        </p>
      )}
      <div className="studio-copy-generate">
        <div>
          <p>
            AI uses your direction choices, brief, brand, and selected creative.
          </p>
          <small>
            {canGenerate
              ? "The first draft fills the fields below automatically. You can also write your own."
              : "Add a brief or select an approved image to create copy with AI, or write your own below."}
          </small>
        </div>
        <button
          type="button"
          className="cfg-primary"
          disabled={busy || !canGenerate}
          onClick={() => generator.generate()}
        >
          {busy && !generator.target ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Sparkles size={18} />
          )}
          {busy && !generator.target
            ? "Creating copy…"
            : hasCopy
              ? "Regenerate copy"
              : "Create copy with AI"}
          <ActionCredits
            organizationId={organizationId}
            operation="channels.draftAssetCopy"
          />
        </button>
      </div>
      {hasVariants && (
        <p className="activation-help">
          This ad has additional saved text options below. Creating or applying
          a complete version replaces them with the displayed copy.
        </p>
      )}
      {busy ? (
        <div className="studio-generation-progress" role="status">
          <div className="studio-generation-orbit">
            <Sparkles size={26} />
          </div>
          <div>
            <strong>
              {generator.target
                ? "Updating your copy…"
                : meta
                  ? "Creating your ad copy…"
                  : "Creating your post copy…"}
            </strong>
            <p>
              Using your brief, brand, and selected direction. Your copy will
              appear in the fields below.
            </p>
            <small>
              {elapsed}s elapsed · You can move between Studio steps while we
              work.
            </small>
          </div>
          <div className="studio-generation-track">
            <span />
          </div>
        </div>
      ) : generator.error ? (
        <div className="studio-generation-error" role="alert">
          <strong>Copy wasn’t updated</strong>
          <p>{generator.error}</p>
          <button
            type="button"
            className="cfg-secondary"
            onClick={() => generator.generate()}
          >
            Try again
          </button>
        </div>
      ) : notice ? (
        <p className="studio-copy-ready" role="status">
          <strong>Copy ready.</strong> {notice}
        </p>
      ) : null}
      <div className="studio-copy-layout">
        <div
          className={`studio-copy-fields ${busy ? "is-generating" : notice ? "is-ready" : ""}`}
        >
          {busy && !hasCopy && (
            <div className="studio-copy-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          {meta ? (
            fields.map(field => (
              <div key={field} className="studio-copy-field">
                <label className="cfg-field">
                  <span>{copyFieldLabels[field]}</span>
                  <textarea
                    aria-label={copyFieldLabels[field]}
                    rows={field === "message" ? 5 : 2}
                    maxLength={copyFieldLimits[field]}
                    value={content[field]}
                    onChange={e =>
                      onChange({ ...content, [field]: e.target.value })
                    }
                  />
                </label>
                {content[field] && regenerate(field)}
              </div>
            ))
          ) : (
            <div className="studio-copy-field">
              <SocialPostFields
                content={content}
                hasMedia={hasMedia}
                onChange={onChange}
                errors={errors}
              />
            </div>
          )}
          {meta && (
            <>
              <label className="cfg-field">
                <span>Destination URL</span>
                <input
                  type="url"
                  placeholder="https://"
                  value={content.link}
                  onChange={e => onChange({ ...content, link: e.target.value })}
                />
              </label>
              <details className="studio-copy-cta">
                <summary>
                  Call to action: {content.callToAction.replaceAll("_", " ")}
                </summary>
                <MetaCallToActionTiles
                  value={content.callToAction}
                  onChange={callToAction =>
                    onChange({ ...content, callToAction })
                  }
                />
              </details>
              <p className="activation-help">
                Meta may not show the description in every placement.
              </p>
            </>
          )}
        </div>
        <aside className="studio-copy-preview" aria-label="Live copy preview">
          <span className="cfg-eyebrow">Live preview</span>
          {preview}
        </aside>
      </div>
      {hasVariants && (
        <details className="studio-copy-alternatives">
          <summary>Additional saved ad text options</summary>
          <p>Meta may combine these options with your main copy.</p>
          {adCopyFields.map(field =>
            content.textVariants?.[copyVariantKeys[field]].map(
              (value, index) => (
                <label className="cfg-field" key={`${field}-${index}`}>
                  <span>
                    {copyFieldLabels[field]} option {index + 2}
                  </span>
                  <textarea
                    value={value}
                    maxLength={copyFieldLimits[field]}
                    onChange={e =>
                      onChange({
                        ...content,
                        textVariants: {
                          ...content.textVariants!,
                          [copyVariantKeys[field]]: content.textVariants![
                            copyVariantKeys[field]
                          ].map((text, i) =>
                            i === index ? e.target.value : text
                          ),
                        },
                      })
                    }
                  />
                </label>
              )
            )
          )}
          <button
            type="button"
            className="cfg-secondary"
            onClick={() => onChange({ ...content, textVariants: undefined })}
          >
            Use only the main copy
          </button>
        </details>
      )}
      {!!content.copyAlternatives?.length && (
        <details className="studio-copy-alternatives">
          <summary>
            Other AI versions ({content.copyAlternatives.length})
          </summary>
          <p>
            Only the copy in your editable fields will be used. Applying a
            version replaces those fields.
          </p>
          {content.copyAlternatives.map((copy, index) => (
            <article key={index}>
              <h3>Version {index + 2}</h3>
              {fields.map(field => (
                <div key={field}>
                  <strong>{meta ? copyFieldLabels[field] : "Caption"}</strong>
                  <p>{copy[field]}</p>
                </div>
              ))}
              <button
                type="button"
                className="cfg-secondary"
                disabled={busy}
                onClick={() => {
                  onChange(apply(copy));
                  setNotice(
                    `Version ${index + 2} applied to your fields and preview.`
                  );
                }}
              >
                Apply this version
              </button>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}

/** Activation Studio's Meta route uses the same review-before-acceptance editor as Google. */
export function StudioCopyComposer(
  props: Parameters<typeof SocialStudioCopyComposer>[0]
) {
  if (props.channel !== "meta_ads")
    return <SocialStudioCopyComposer {...props} />;
  return <MetaStudioCopyComposer {...props} />;
}
function MetaStudioCopyComposer({
  organizationId,
  assetKeys,
  content,
  onChange,
  errors,
  onEditChoices,
  onEditBrief,
  preview,
  onBusyChange,
}: Parameters<typeof SocialStudioCopyComposer>[0]) {
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const choices = copyDirectionBrief(content.copyDirection);
  const context = fingerprint({
    organizationId,
    channel: "meta_ads",
    assetKeys,
    choices,
    promotion: content.promotion,
    instructions: content.copyInstructions ?? "",
    defaultInstructions: content.copyDefaultInstructions,
    cta: content.callToAction,
  });
  const changed =
    !!content.copyGenerationContext &&
    content.copyGenerationContext !== context;
  return (
    <section
      className="studio-copy-compose"
      aria-label="Compose copy"
      aria-busy={busy}
    >
      <details className="studio-copy-context">
        <summary>Your copy direction and instructions</summary>
        <p>
          {choices.length
            ? choices
                .map(
                  choice =>
                    `${choice.attribute}: ${choice.values.map(value => value.label).join(", ")}`
                )
                .join(" · ")
            : "AI uses your brief and brand."}
        </p>
        <button type="button" onClick={onEditChoices}>
          Edit choices
        </button>
        <button type="button" onClick={onEditBrief}>
          Edit brief
        </button>
        <TaskPromptField
          promptId="copy.asset"
          label="Copy generation instructions"
          value={content.copyDefaultInstructions}
          onChange={copyDefaultInstructions =>
            onChange({ ...content, copyDefaultInstructions })
          }
        />
      </details>
      {changed && (
        <p role="status" className="studio-copy-changed">
          Your directions changed since this draft's saved generation. Existing
          draft copy is kept. Generate suggestions and review before adding.
        </p>
      )}
      <AdTextOptionsEditor
        organizationId={organizationId}
        assetKeys={assetKeys}
        promotion={content.promotion}
        copyDirection={content.copyDirection}
        callToAction={content.callToAction}
        instructions={content.copyInstructions ?? ""}
        defaultInstructions={content.copyDefaultInstructions}
        value={content}
        onChange={copy => onChange({ ...content, ...copy })}
        onBusyChange={setBusy}
      />
      {Object.entries(errors).map(
        ([field, message]) =>
          message && (
            <p key={field} role="alert">
              {message}
            </p>
          )
      )}
      <div className="studio-copy-context">
        <label className="cfg-field">
          <span>Destination URL</span>
          <input
            type="url"
            placeholder="https://"
            value={content.link}
            onChange={e => onChange({ ...content, link: e.target.value })}
          />
        </label>
        <details className="studio-copy-cta">
          <summary>
            Call to action: {content.callToAction.replaceAll("_", " ")}
          </summary>
          <MetaCallToActionTiles
            value={content.callToAction}
            onChange={callToAction => onChange({ ...content, callToAction })}
          />
        </details>
      </div>
      {!!content.copyAlternatives?.length && (
        <details className="studio-copy-context">
          <summary>Previously saved AI alternatives</summary>
          <p>
            Reference only; these alternatives are not in your draft and may use
            older directions.
          </p>
          {content.copyAlternatives.map((copy, index) => (
            <article key={index}>
              <strong>Saved alternative {index + 1}</strong>
              {adCopyFields.map(field => (
                <p key={field}>
                  <strong>{copyFieldLabels[field]}: </strong>
                  {copy[field]}
                </p>
              ))}
            </article>
          ))}
        </details>
      )}
      <details className="studio-copy-context">
        <summary>Live preview</summary>
        {preview}
      </details>
    </section>
  );
}
