import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { useGoogleFieldValidation } from "./GoogleValidation";
import { trpc } from "@/lib/trpc";

export const label = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, c => c.toUpperCase());
export function Field({
  title,
  children,
  path,
}: {
  path?: string;
  title: string;
  children: ReactNode;
}) {
  const child = Children.toArray(children).find(isValidElement);
  const fieldPath =
    path ??
    ((child?.props as Record<string, unknown> | undefined)?.[
      "data-google-field"
    ] as string | undefined);
  const { messages, errorId, invalid } = useGoogleFieldValidation(fieldPath);
  return (
    <label className="google-field">
      <span>{title}</span>
      {Children.map(children, item =>
        isValidElement(item) &&
        typeof item.type === "string" &&
        ["input", "select", "textarea"].includes(item.type)
          ? cloneElement(item as React.ReactElement<Record<string, unknown>>, {
              "data-google-field": fieldPath,
              "aria-invalid":
                invalid ||
                (item.props as Record<string, unknown>)["aria-invalid"] ||
                undefined,
              "aria-describedby":
                [
                  (item.props as Record<string, unknown>)["aria-describedby"],
                  invalid ? errorId : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined,
            })
          : item
      )}
      {invalid && (
        <span id={errorId} className="google-field-error" role="alert">
          {messages.join(" ")}
        </span>
      )}
    </label>
  );
}
export function ResourcePicker({
  organizationId,
  connectionId,
  kind,
  value,
  onChange,
  title,
  path,
}: {
  path?: string;
  organizationId: number;
  connectionId: string;
  kind: "locations" | "languages" | "audiences" | "merchants";
  value: string[];
  onChange: (ids: string[]) => void;
  title: string;
}) {
  const fieldPath =
    path ??
    {
      locations: "locationIds",
      languages: "languageIds",
      audiences: "audienceId",
      merchants: "merchantId",
    }[kind];
  const { messages, errorId, invalid } = useGoogleFieldValidation(fieldPath);
  const searchable = kind === "locations" || kind === "languages";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const query = search.trim();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setSearch("");
    setDebouncedSearch("");
    setOpen(false);
  }, [connectionId, organizationId, kind]);
  const resources = trpc.googleAds.campaigns.resources.useQuery(
    {
      organizationId,
      connectionId,
      kind,
      search: kind === "locations" ? debouncedSearch : "",
    },
    {
      enabled:
        !!connectionId && (kind !== "locations" || debouncedSearch.length >= 2),
      staleTime: 60000,
    }
  );
  const [names, setNames] = useState<Record<string, string>>({});
  const nameKey = (id: string) =>
    `${organizationId}:${connectionId}:${kind}:${id}`;
  const name = (id: string) =>
    names[nameKey(id)] ??
    resources.data?.find(r => r.id === id)?.name ??
    (kind === "locations" && id === "2840"
      ? "United States"
      : kind === "languages" && id === "1000"
        ? "English"
        : id);
  const waiting = kind === "locations" && query !== debouncedSearch;
  const tooShort = kind === "locations" && query.length < 2;
  const options =
    waiting || tooShort || resources.isFetching || resources.error
      ? []
      : (resources.data ?? []).filter(
          r =>
            !value.includes(r.id) &&
            (kind !== "languages" ||
              r.name.toLowerCase().includes(query.toLowerCase()))
        );
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const select = (item: { id: string; name: string }) => {
    if (inputRef.current?.matches(":disabled")) return;
    setNames(previous => ({ ...previous, [nameKey(item.id)]: item.name }));
    onChange(
      kind === "audiences" || kind === "merchants"
        ? [item.id]
        : Array.from(new Set([...value, item.id]))
    );
    setSearch("");
    setActive(0);
    inputRef.current?.focus();
    setOpen(false);
  };
  useEffect(() => {
    if (open)
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open, listId]);
  return (
    <div className="google-field">
      <span>{title}</span>
      {searchable ? (
        <div
          className="google-resource-search"
          onBlur={event => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setOpen(false);
          }}
        >
          <input
            ref={inputRef}
            role="combobox"
            aria-label={`Search ${title.toLowerCase()}`}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open && options.length ? `${listId}-${activeIndex}` : undefined
            }
            data-google-field={fieldPath}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            disabled={!connectionId}
            placeholder={
              kind === "locations"
                ? "Search a country, city or region"
                : "Search languages"
            }
            value={search}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={event => {
              setSearch(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={event => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActive(previous =>
                  !open
                    ? event.key === "ArrowUp"
                      ? Math.max(0, options.length - 1)
                      : 0
                    : options.length
                      ? (previous +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          options.length) %
                        options.length
                      : 0
                );
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (open && options[activeIndex]) select(options[activeIndex]);
                else setOpen(true);
              }
            }}
          />
          {open && (
            <div className="google-resource-results">
              <div
                id={listId}
                role="listbox"
                aria-label={title}
                aria-busy={waiting || !!resources.isFetching}
              >
                {options.map((item, index) => (
                  <button
                    type="button"
                    tabIndex={-1}
                    key={item.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={event => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => select(item)}
                  >
                    {item.name} <small>· {item.type}</small>
                  </button>
                ))}
              </div>
              {resources.error ? (
                <div role="alert">
                  Could not load {title.toLowerCase()}.
                  <button
                    type="button"
                    onClick={() => void resources.refetch()}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                !options.length && (
                  <p role="status">
                    {!connectionId
                      ? "Choose an account first."
                      : tooShort
                        ? "Type at least 2 characters to search locations."
                        : waiting || resources.isFetching
                          ? "Loading…"
                          : "No matching options. Try another search."}
                  </p>
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <select
          aria-label={`Add ${title.toLowerCase()}`}
          data-google-field={fieldPath}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          value=""
          onChange={event => {
            const item = resources.data?.find(r => r.id === event.target.value);
            if (item) select(item);
          }}
        >
          <option value="">
            {resources.isFetching ? "Loading…" : "Choose…"}
          </option>
          {resources.data
            ?.filter(r => !value.includes(r.id))
            .map(item => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.type}
              </option>
            ))}
        </select>
      )}
      <div className="google-chips">
        {value.map(id => (
          <button
            key={id}
            type="button"
            aria-label={`Remove ${name(id)}`}
            onClick={() => onChange(value.filter(v => v !== id))}
          >
            {name(id)} ×
          </button>
        ))}
      </div>
      {invalid && (
        <p id={errorId} className="google-field-error" role="alert">
          {messages.join(" ")}
        </p>
      )}
      {!searchable && resources.error && (
        <p role="alert">{resources.error.message}</p>
      )}
    </div>
  );
}
