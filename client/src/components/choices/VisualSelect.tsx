import {
  Children,
  createContext,
  Fragment,
  forwardRef,
  isValidElement,
  useId,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
  type LabelHTMLAttributes,
  type OptionHTMLAttributes,
} from "react";
import { Check, Search, X } from "lucide-react";
import { ChoiceVisual } from "./ChoiceVisual";
import { ConnectedAccountIdentity } from "../AccountIdentity";
import "@/styles/visualChoices.css";

type Choice = {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
  description?: string;
  image?: string;
  visual?: string;
  accountId?: string;
};
type OptionProps = OptionHTMLAttributes<HTMLOptionElement> & {
  "data-description"?: string;
  "data-image"?: string;
  "data-visual"?: string;
  "data-account-id"?: string;
};
type ChoiceDensity = "tiles" | "compact" | "segmented" | "select";
const ChoiceDensityContext = createContext<ChoiceDensity>("tiles");
/** Narrow editors use ordinary form controls; visual pickers can opt in explicitly. */
export const ChoiceDensityProvider = ChoiceDensityContext.Provider;
type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  density?: ChoiceDensity;
  searchable?: boolean;
  showAll?: boolean;
  imageOrganizationId?: number;
  visual?: string;
  /** The native control keeps submission and change events; visuals use this wrapper class. */
  tileClassName?: string;
  onValueChange?: (value: string) => void;
};
const plainText = (node: ReactNode): string =>
  Children.toArray(node)
    .map(child =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plainText(child.props.children)
          : ""
    )
    .join("");
const ChoiceLabel = createContext<string | undefined>(undefined);
/** A tile group needs a group label, rather than a label containing many controls. */
export function ChoiceField({
  children,
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  const hasTiles = (nodes: ReactNode): boolean =>
    Children.toArray(nodes).some(
      child =>
        isValidElement<{ children?: ReactNode }>(child) &&
        (child.type === VisualSelect || hasTiles(child.props.children))
    );
  if (!hasTiles(children))
    return (
      <label {...props} className={className}>
        {children}
      </label>
    );
  const fieldText = (nodes: ReactNode): string =>
    Children.toArray(nodes)
      .map(child => {
        if (typeof child === "string" || typeof child === "number")
          return String(child);
        if (
          !isValidElement<{ children?: ReactNode }>(child) ||
          child.type === VisualSelect ||
          ["input", "textarea", "button", "small"].includes(String(child.type))
        )
          return "";
        return fieldText(child.props.children);
      })
      .join("")
      .trim();
  const { htmlFor, ...attributes } = props;
  return (
    <ChoiceLabel.Provider value={fieldText(children)}>
      <div
        {...(attributes as React.HTMLAttributes<HTMLDivElement>)}
        className={`choice-field ${className ?? ""}`}
      >
        {children}
      </div>
    </ChoiceLabel.Provider>
  );
}
function optionsFrom(
  children: ReactNode,
  group?: string,
  disabled = false
): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<OptionProps>(child)) return [];
    const p = child.props;
    if (child.type === Fragment)
      return optionsFrom(p.children, group, disabled);
    if (child.type === "optgroup")
      return optionsFrom(p.children, p.label, disabled || p.disabled);
    if (child.type !== "option") return [];
    const label = plainText(p.children);
    return [
      {
        value: String(p.value ?? label),
        label,
        group,
        disabled: disabled || p.disabled,
        description: p["data-description"] ?? p.title,
        image: p["data-image"],
        visual: p["data-visual"],
        accountId: p["data-account-id"],
      },
    ];
  });
}

/** Native form controls or inline choices, preserving the same selection and event contract. */
export const VisualSelect = forwardRef<HTMLSelectElement, Props>(
  function VisualSelect(
    {
      children,
      value,
      defaultValue,
      multiple,
      onChange,
      onValueChange,
      disabled,
      required,
      density: requestedDensity,
      searchable = true,
      showAll = false,
      imageOrganizationId,
      visual,
      tileClassName = "",
      className,
      style,
      ...props
    },
    forwardedRef
  ) {
    const uid = useId();
    const inheritedDensity = useContext(ChoiceDensityContext);
    const density = requestedDensity ?? inheritedDensity;
    const fieldLabel = useContext(ChoiceLabel);
    const native = useRef<HTMLSelectElement>(null);
    const root = useRef<HTMLSpanElement>(null);
    useImperativeHandle(forwardedRef, () => native.current!);
    const options = optionsFrom(children);
    const initial = defaultValue ?? (multiple ? [] : (options[0]?.value ?? ""));
    const [internal, setInternal] = useState<string | readonly string[]>(
      Array.isArray(initial) ? initial : String(initial)
    );
    const selection = value ?? internal;
    const selectedValues = Array.isArray(selection)
      ? selection.map(String)
      : [String(selection)];
    const selected = selectedValues[0] ?? "";
    const [query, setQuery] = useState("");
    const [limit, setLimit] = useState(8);
    const [label, setLabel] = useState(
      props["aria-label"] ?? fieldLabel ?? props.title ?? "Choices"
    );
    const [invalid, setInvalid] = useState(false);
    useLayoutEffect(() => {
      const select = native.current;
      if (!select) return;
      const named = props["aria-labelledby"]
        ?.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      const labels = Array.from(select.labels ?? [])
        .map(element => {
          const copy = element.cloneNode(true) as HTMLElement;
          copy
            .querySelectorAll(".choice-select, small, input, textarea, button")
            .forEach(n => n.remove());
          return copy.textContent?.trim() ?? "";
        })
        .join(" ");
      setLabel(
        props["aria-label"] ??
          named ??
          fieldLabel ??
          (labels || props.title || "Choices")
      );
      const form = select.form;
      const reset = () => {
        setInternal(Array.isArray(initial) ? initial : String(initial));
        setQuery("");
        setLimit(8);
        setInvalid(false);
      };
      form?.addEventListener("reset", reset);
      return () => form?.removeEventListener("reset", reset);
    }, [
      props["aria-label"],
      props["aria-labelledby"],
      props.title,
      fieldLabel,
      defaultValue,
      multiple,
      children,
    ]);
    const missing = selectedValues.filter(
      v => v && !options.some(o => o.value === v)
    );
    const all: Choice[] = [
      ...missing.map(v => ({
        value: v,
        label: "Selected item unavailable",
        description: "Choose another option to replace it.",
        disabled: true,
      })),
      ...options,
    ];
    const placeholder = all.find(
      o => o.value === "" && /^(select|choose|loading|pick)\b/i.test(o.label)
    );
    const selectable = all.filter(o => o !== placeholder);
    const matches = selectable.filter(o =>
      `${o.label} ${o.group ?? ""} ${o.description ?? ""} ${o.value}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
    const visible = showAll ? [...matches] : matches.slice(0, limit);
    const retained = selectable.filter(
      o => selectedValues.includes(o.value) && !visible.includes(o)
    );
    visible.unshift(...retained);
    const enabled = visible.filter(o => !disabled && !o.disabled);
    const tabValue = enabled.some(o => o.value === selected)
      ? selected
      : enabled[0]?.value;
    function choose(next: string) {
      const select = native.current;
      if (!select || select.matches(":disabled")) return;
      if (multiple) {
        const values = selectedValues.includes(next)
          ? selectedValues.filter(v => v !== next)
          : [...selectedValues, next];
        Array.from(select.options).forEach(o => {
          o.selected = values.includes(o.value);
        });
      } else select.value = next;
      // React receives the genuine select event: target/currentTarget, form and name stay intact.
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (density === "select")
      return (
        <span
          ref={root}
          className={`choice-select ${tileClassName}`}
          data-density={density}
          style={style}
        >
          <select
            {...props}
            ref={native}
            className={className}
            aria-label={props["aria-label"] ?? label}
            value={multiple ? selectedValues : selected}
            multiple={multiple}
            disabled={disabled}
            required={required}
            onChange={event => {
              setInternal(
                multiple
                  ? Array.from(event.target.selectedOptions, o => o.value)
                  : event.target.value
              );
              onChange?.(event);
              onValueChange?.(event.target.value);
            }}
          >
            {missing.map(v => (
              <option key={v} value={v}>
                Selected item unavailable
              </option>
            ))}
            {children}
          </select>
        </span>
      );
    return (
      <span
        ref={root}
        className={`choice-select ${tileClassName}`}
        data-choice-label={label}
        data-density={density}
        data-disabled={disabled || undefined}
        style={style}
      >
        <select
          {...props}
          className={className}
          ref={native}
          value={multiple ? selectedValues : selected}
          multiple={multiple}
          disabled={disabled}
          required={required}
          aria-hidden="true"
          aria-label={undefined}
          aria-labelledby={undefined}
          tabIndex={-1}
          hidden
          onChange={event => {
            setInternal(
              multiple
                ? Array.from(event.target.selectedOptions, o => o.value)
                : event.target.value
            );
            setInvalid(false);
            onChange?.(event);
            onValueChange?.(event.target.value);
          }}
          onInvalid={event => {
            props.onInvalid?.(event);
            event.preventDefault();
            setInvalid(true);
            root.current
              ?.querySelector<HTMLButtonElement>(".choice-tile:not(:disabled)")
              ?.focus();
          }}
        >
          {missing.map(v => (
            <option key={v} value={v}>
              Selected item unavailable
            </option>
          ))}
          {children}
        </select>
        {searchable && (selectable.length > 8 || query) && (
          <span className="choice-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder="Search choices…"
              value={query}
              disabled={disabled}
              onChange={event => {
                setQuery(event.target.value);
                setLimit(8);
              }}
            />
            {query && (
              <button
                type="button"
                aria-label={`Clear ${label.toLowerCase()} search`}
                onClick={() => {
                  setQuery("");
                  setLimit(8);
                }}
              >
                <X size={14} />
              </button>
            )}
          </span>
        )}
        {placeholder && !selected && (
          <span className="choice-prompt">{placeholder.label}</span>
        )}
        <span
          className="choice-grid"
          role={multiple ? "group" : "radiogroup"}
          aria-label={label}
          aria-disabled={!!disabled}
          aria-describedby={props["aria-describedby"]}
          aria-required={required || undefined}
          aria-invalid={invalid || props["aria-invalid"]}
        >
          {visible.map((option, index) => (
            <button
              type="button"
              role={multiple ? "checkbox" : "radio"}
              key={option.value}
              data-value={option.value}
              aria-label={option.label}
              aria-checked={selectedValues.includes(option.value)}
              aria-describedby={
                option.description || option.disabled
                  ? `${uid}-${index}`
                  : undefined
              }
              disabled={disabled || option.disabled}
              tabIndex={multiple || option.value === tabValue ? 0 : -1}
              className="choice-tile"
              onClick={() => choose(option.value)}
              onKeyDown={event => {
                if (
                  ![
                    "ArrowRight",
                    "ArrowLeft",
                    "ArrowDown",
                    "ArrowUp",
                    "Home",
                    "End",
                  ].includes(event.key) ||
                  !enabled.length
                )
                  return;
                event.preventDefault();
                const i = enabled.findIndex(o => o.value === option.value);
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? enabled.length - 1
                      : (i +
                          (event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? -1
                            : 1) +
                          enabled.length) %
                        enabled.length;
                const target = enabled[next];
                if (!multiple) choose(target.value);
                Array.from(
                  root.current?.querySelectorAll<HTMLButtonElement>(
                    ".choice-tile"
                  ) ?? []
                )
                  .find(b => b.dataset.value === target.value)
                  ?.focus();
              }}
            >
              {density !== "segmented" && (
                <span className="choice-tile-art" aria-hidden="true">
                  {option.accountId && imageOrganizationId ? (
                    <ConnectedAccountIdentity
                      organizationId={imageOrganizationId}
                      id={option.accountId}
                      name={option.label}
                      imageUrl={option.image}
                    />
                  ) : (
                    <ChoiceVisual
                      label={option.label}
                      context={`${option.group ?? ""} ${label}`}
                      visual={option.visual ?? visual}
                      image={option.image}
                    />
                  )}
                </span>
              )}
              <span className="choice-tile-copy">
                {option.group && <small>{option.group}</small>}
                <strong>{option.label}</strong>
                {(option.description || option.disabled) && (
                  <span id={`${uid}-${index}`}>
                    {option.description || "Unavailable"}
                  </span>
                )}
              </span>
              <span className="choice-tile-check" aria-hidden="true">
                {selectedValues.includes(option.value) && <Check size={12} />}
              </span>
            </button>
          ))}
        </span>
        {!matches.length && !disabled && (
          <span className="choice-empty">
            {query
              ? "No matching choices. Try another search."
              : placeholder?.label || "No choices available."}
          </span>
        )}
        {((!showAll && matches.length > limit) ||
          (!!placeholder && !!selected && !required && !disabled)) && (
          <span className="choice-actions">
            {!showAll && matches.length > limit && (
              <button type="button" onClick={() => setLimit(n => n + 16)}>
                Show more · {matches.length - limit} remaining
              </button>
            )}
            {placeholder && selected && !required && !disabled && (
              <button type="button" onClick={() => choose("")}>
                Clear selection
              </button>
            )}
          </span>
        )}
        {invalid && (
          <span className="choice-error" role="alert">
            Choose an option to continue.
          </span>
        )}
      </span>
    );
  }
);
