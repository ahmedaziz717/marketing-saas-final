import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

export const label = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, c => c.toUpperCase());
export function Field({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <label className="google-field">
      <span>{title}</span>
      {children}
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
}: {
  organizationId: number;
  connectionId: string;
  kind: "locations" | "languages" | "audiences" | "merchants";
  value: string[];
  onChange: (ids: string[]) => void;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const resources = trpc.googleAds.campaigns.resources.useQuery(
    { organizationId, connectionId, kind, search },
    {
      enabled: !!connectionId && (kind !== "locations" || search.length >= 2),
      staleTime: 60000,
    }
  );
  const [names, setNames] = useState<Record<string, string>>({
    "1000": "English",
  });
  return (
    <div className="google-field">
      <span>{title}</span>
      {kind === "locations" && (
        <input
          aria-label="Search locations"
          placeholder="Search a country, city or region"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}
      <select
        aria-label={`Add ${title.toLowerCase()}`}
        value=""
        onChange={e => {
          const item = resources.data?.find(r => r.id === e.target.value);
          if (!item) return;
          setNames({ ...names, [item.id]: item.name });
          onChange(
            kind === "audiences" || kind === "merchants"
              ? [item.id]
              : Array.from(new Set([...value, item.id]))
          );
        }}
      >
        <option value="">
          {resources.isFetching ? "Loading…" : "Choose…"}
        </option>
        {resources.data
          ?.filter(r => !value.includes(r.id))
          .map(r => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.type}
            </option>
          ))}
      </select>
      <div className="google-chips">
        {value.map(id => (
          <button
            key={id}
            onClick={() => onChange(value.filter(v => v !== id))}
          >
            {names[id] ?? resources.data?.find(r => r.id === id)?.name ?? id} ×
          </button>
        ))}
      </div>
      {resources.error && <p role="alert">{resources.error.message}</p>}
    </div>
  );
}
