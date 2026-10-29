import { useEffect, useId, useState, type ReactNode } from "react";
import {
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import "./adCopyWorkspace.css";

export type AdCopyWorkspaceField = {
  id: string;
  label: string;
  singular: string;
  characters: number;
  maximum: number;
  suggestions: string[];
  drafts: Array<{ id: string; text: string; readOnly?: boolean }>;
  /** Occupied slots, including retained remote assets, excluding empty text. */
  occupied: number;
  error?: ReactNode;
  validationPath?: string;
  invalid?: boolean;
  errorId?: string;
};
export type CopyWorkspaceField = AdCopyWorkspaceField;
export type AdCopyWorkspaceProps = {
  fields: AdCopyWorkspaceField[];
  busy: boolean;
  /** Change for a new generation or context, not for ordinary proposal edits. */
  generationKey: string;
  onEditSuggestion: (field: string, index: number, text: string) => void;
  onAdd: (field: string, texts: string[]) => void;
  onEditDraft: (field: string, id: string, text: string) => void;
  onRemoveDraft: (field: string, id: string) => void;
  onWrite: (field: string) => void;
  onRegenerate?: (field: string, index: number) => void;
  headerAction?: ReactNode;
  renderSuggestionActions?: (field: string, index: number) => ReactNode;
};
const normalize = (text: string) => text.trim().toLowerCase();

/** A deterministic, append-only plan. Adapters also enforce their channel contract. */
export function planCopyAdditions(
  field: AdCopyWorkspaceField,
  indices: number[]
) {
  const seen = new Set(
    field.drafts.map(draft => normalize(draft.text)).filter(Boolean)
  );
  const texts: string[] = [];
  const skipped = { invalid: 0, duplicate: 0, full: 0 };
  const remaining = Math.max(0, field.maximum - field.occupied);
  for (const index of Array.from(new Set(indices)).sort((a, b) => a - b)) {
    const raw = field.suggestions[index];
    if (raw === undefined || !raw.trim() || raw.length > field.characters) {
      skipped.invalid++;
      continue;
    }
    const text = raw.trim();
    if (seen.has(normalize(text))) {
      skipped.duplicate++;
      continue;
    }
    // Mark duplicates even when the first occurrence cannot fit.
    seen.add(normalize(text));
    if (texts.length >= remaining) {
      skipped.full++;
      continue;
    }
    texts.push(text);
  }
  return { texts, skipped };
}

export function AdCopyWorkspace({
  fields,
  busy,
  generationKey,
  onEditSuggestion,
  onAdd,
  onEditDraft,
  onRemoveDraft,
  onWrite,
  onRegenerate,
  headerAction,
  renderSuggestionActions,
}: AdCopyWorkspaceProps) {
  const uid = useId();
  const [selection, setSelection] = useState<{
    key: string;
    fields: Record<string, number[]>;
  }>({ key: generationKey, fields: {} });
  const [notice, setNotice] = useState<{ key: string; text: string }>({
    key: generationKey,
    text: "",
  });
  // Derive immediately as well as clearing state: stale selections never flash or apply.
  const selected = selection.key === generationKey ? selection.fields : {};
  useEffect(() => {
    setSelection({ key: generationKey, fields: {} });
    setNotice({ key: generationKey, text: "" });
  }, [generationKey]);
  function add(field: AdCopyWorkspaceField, indices: number[]) {
    if (busy) return;
    const { texts, skipped } = planCopyAdditions(field, indices);
    if (texts.length) onAdd(field.id, texts);
    setSelection(previous => ({
      key: generationKey,
      fields: {
        ...(previous.key === generationKey ? previous.fields : {}),
        [field.id]: [],
      },
    }));
    const details = [
      skipped.invalid && `${skipped.invalid} empty or over limit`,
      skipped.duplicate && `${skipped.duplicate} duplicate`,
      skipped.full && `${skipped.full} with no remaining slot`,
    ].filter(Boolean);
    setNotice({
      key: generationKey,
      text: `${texts.length} ${field.label.toLowerCase()} added. Existing draft copy was kept.${details.length ? ` Skipped: ${details.join(", ")}.` : ""}`,
    });
  }
  return (
    <section
      className="ad-copy-workspace"
      aria-label="Ad copy workspace"
      aria-busy={busy}
    >
      <div className="ad-copy-workspace-header">
        <div className="ad-copy-column-heading">
          <Sparkles className="ad-copy-heading-icon" aria-hidden="true" />
          <div>
            <h3>AI suggestions</h3>
            <p>Suggestions tailored to your campaign and assets.</p>
          </div>
          <div className="ad-copy-header-action">{headerAction}</div>
        </div>
        <div className="ad-copy-column-heading">
          <Pencil className="ad-copy-heading-icon" aria-hidden="true" />
          <div>
            <h3>Draft copy</h3>
            <p>Write or edit ad copy for this campaign.</p>
          </div>
          <span className="ad-copy-protected">
            <LockKeyhole aria-hidden="true" />
            Manual edits protected
          </span>
        </div>
      </div>
      {fields.map(field => {
        const checked = selected[field.id] ?? [];
        const fieldLabel = `${uid}-${field.id}`;
        const remaining = Math.max(0, field.maximum - field.occupied);
        return (
          <section
            className="ad-copy-field"
            key={field.id}
            aria-labelledby={fieldLabel}
            data-google-field={field.validationPath}
            tabIndex={field.validationPath ? -1 : undefined}
          >
            <header className="ad-copy-field-heading">
              <h4 id={fieldLabel}>{field.label}</h4>
              <span>{field.characters.toLocaleString()} characters max</span>
              <span
                className="ad-copy-field-count"
                aria-label={`${field.label} draft count`}
              >
                {field.occupied} / {field.maximum}
              </span>
            </header>
            <div className="ad-copy-field-columns">
              <section
                className="ad-copy-proposals"
                aria-label={`${field.label} AI suggestions`}
              >
                {!field.suggestions.length && (
                  <p className="ad-copy-empty">
                    Generate suggestions, or write your own copy.
                  </p>
                )}
                {field.suggestions.map((text, index) => {
                  const invalid =
                    !text.trim() || text.length > field.characters;
                  const duplicate =
                    !!text.trim() &&
                    field.drafts.some(
                      draft => normalize(draft.text) === normalize(text)
                    );
                  const counterId = `${fieldLabel}-proposal-${index}-count`;
                  return (
                    <div className="ad-copy-proposal" key={index}>
                      <div className="ad-copy-text-row">
                        <input
                          type="checkbox"
                          className="ad-copy-checkbox"
                          aria-label={`Select ${field.singular} suggestion ${index + 1}`}
                          checked={checked.includes(index)}
                          disabled={busy}
                          onChange={event => {
                            const enabled = event.target.checked;
                            setSelection(previous => {
                              const current =
                                previous.key === generationKey
                                  ? previous.fields
                                  : {};
                              const indices = current[field.id] ?? [];
                              return {
                                key: generationKey,
                                fields: {
                                  ...current,
                                  [field.id]: enabled
                                    ? [...indices, index]
                                    : indices.filter(i => i !== index),
                                },
                              };
                            });
                          }}
                        />
                        <div
                          className={`ad-copy-text-control${invalid ? " is-invalid" : ""}`}
                        >
                          <textarea
                            aria-label={`${field.label} suggestion ${index + 1}`}
                            rows={1}
                            value={text}
                            disabled={busy}
                            aria-invalid={invalid}
                            aria-describedby={counterId}
                            onChange={event =>
                              onEditSuggestion(
                                field.id,
                                index,
                                event.target.value
                              )
                            }
                          />
                          <span
                            id={counterId}
                            className="ad-copy-character-count"
                          >
                            {text.length} / {field.characters}
                          </span>
                        </div>
                        {onRegenerate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="ad-copy-row-action"
                            disabled={busy}
                            aria-label={`Regenerate ${field.singular} suggestion ${index + 1}`}
                            onClick={() => {
                              setSelection(previous => ({
                                key: generationKey,
                                fields: {
                                  ...(previous.key === generationKey
                                    ? previous.fields
                                    : {}),
                                  [field.id]: (selected[field.id] ?? []).filter(
                                    i => i !== index
                                  ),
                                },
                              }));
                              onRegenerate(field.id, index);
                            }}
                          >
                            <RefreshCw aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                      {(invalid || duplicate) && (
                        <p
                          className={`ad-copy-row-hint${invalid ? " is-invalid" : ""}`}
                        >
                          {invalid
                            ? !text.trim()
                              ? "Enter text before adding."
                              : `Over ${field.characters} characters; shorten before adding.`
                            : "Already in draft"}
                        </p>
                      )}
                      {renderSuggestionActions?.(field.id, index)}
                    </div>
                  );
                })}
                {!!field.suggestions.length && (
                  <div className="ad-copy-field-actions">
                    <Button
                      type="button"
                      size="sm"
                      className="ad-copy-add-selected"
                      disabled={busy || !checked.length}
                      onClick={() => add(field, checked)}
                    >
                      Add selected{checked.length ? ` (${checked.length})` : ""}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        add(
                          field,
                          field.suggestions.map((_, index) => index)
                        )
                      }
                    >
                      Add all that fit
                    </Button>
                    <span className="ad-copy-slots">
                      {remaining} {remaining === 1 ? "slot" : "slots"} available
                    </span>
                  </div>
                )}
              </section>
              <section
                className="ad-copy-drafts"
                aria-label={`${field.label} draft editor`}
              >
                {field.drafts.map((draft, index) => {
                  const invalid = draft.text.length > field.characters;
                  const counterId = `${fieldLabel}-draft-${index}-count`;
                  return (
                    <div className="ad-copy-draft" key={draft.id}>
                      <div className="ad-copy-text-row">
                        <div
                          className={`ad-copy-text-control${invalid ? " is-invalid" : ""}`}
                        >
                          <textarea
                            aria-label={`${field.label} ${index + 1}`}
                            rows={1}
                            value={draft.text}
                            readOnly={draft.readOnly}
                            aria-invalid={invalid || field.invalid}
                            aria-describedby={[
                              counterId,
                              field.invalid ? field.errorId : undefined,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onChange={event =>
                              onEditDraft(
                                field.id,
                                draft.id,
                                event.target.value
                              )
                            }
                          />
                          <span
                            id={counterId}
                            className="ad-copy-character-count"
                          >
                            {draft.text.length} / {field.characters}
                          </span>
                        </div>
                        {draft.readOnly ? (
                          <span
                            className="ad-copy-retained"
                            title="Existing channel copy retained"
                          >
                            <LockKeyhole aria-label="Existing copy retained" />
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="ad-copy-row-action"
                            aria-label={`Remove draft ${field.singular} ${index + 1}`}
                            onClick={() => onRemoveDraft(field.id, draft.id)}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                      {invalid && (
                        <p className="ad-copy-row-hint is-invalid" role="alert">
                          Shorten this {field.singular} to {field.characters}{" "}
                          characters.
                        </p>
                      )}
                    </div>
                  );
                })}
                <div className="ad-copy-field-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ad-copy-write"
                    disabled={
                      field.drafts.length >= field.maximum || remaining === 0
                    }
                    onClick={() => onWrite(field.id)}
                  >
                    <Plus aria-hidden="true" />
                    Write {field.singular}
                  </Button>
                  {field.error && (
                    <div className="ad-copy-field-error">{field.error}</div>
                  )}
                </div>
              </section>
            </div>
          </section>
        );
      })}
      {notice.key === generationKey && notice.text && (
        <p className="ad-copy-notice" role="status">
          {notice.text}
        </p>
      )}
    </section>
  );
}
