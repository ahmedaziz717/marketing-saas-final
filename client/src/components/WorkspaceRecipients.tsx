import { useState } from "react";

export function WorkspaceRecipients({
  recipients,
  selected,
  onChange,
  loading,
  error,
  onRefresh,
}: {
  recipients: Array<{
    userId: number;
    name: string | null;
    email: string | null;
  }>;
  selected: number[];
  onChange: (ids: number[]) => void;
  loading?: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const matches = recipients.filter(r =>
    `${r.name ?? ""} ${r.email ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  const unavailable = selected.filter(
    id => !recipients.some(r => r.userId === id)
  );
  return (
    <section aria-label="Workspace recipients" className="space-y-4">
      <div className="insight-recipient-toolbar">
        <input
          type="search"
          aria-label="Search recipients"
          placeholder="Search by name or email"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border bg-background p-3"
        />
        <button type="button" onClick={onRefresh} disabled={loading}>
          Refresh members
        </button>
      </div>
      <p className="insight-caption">
        {selected.length} selected · {recipients.length} active workspace
        members
      </p>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading members…</p>}
      {!loading && !error && unavailable.length > 0 && (
        <p role="alert">
          {unavailable.length} selected recipient(s) are no longer available.{" "}
          <button
            type="button"
            onClick={() =>
              onChange(selected.filter(id => !unavailable.includes(id)))
            }
          >
            Remove unavailable recipients
          </button>
        </p>
      )}
      <div className="insight-recipient-grid">
        {matches.map(r => (
          <label className="insight-check" key={r.userId}>
            <input
              type="checkbox"
              checked={selected.includes(r.userId)}
              onChange={e =>
                onChange(
                  e.target.checked
                    ? Array.from(new Set([...selected, r.userId]))
                    : selected.filter(id => id !== r.userId)
                )
              }
            />
            <span>
              <strong>{r.name || r.email}</strong>
              <small>{r.email}</small>
            </span>
          </label>
        ))}
      </div>
      {!loading && !error && !matches.length && (
        <p className="insight-caption">
          {search
            ? "No members match your search."
            : "No active members with email addresses are available in this workspace."}
        </p>
      )}
      <div className="flex gap-4">
        <button
          type="button"
          disabled={!matches.length}
          onClick={() =>
            onChange(
              Array.from(new Set([...selected, ...matches.map(r => r.userId)]))
            )
          }
        >
          Select {search ? "matching" : "all"} members
        </button>
        <button
          type="button"
          disabled={!selected.length}
          onClick={() => onChange([])}
        >
          Clear recipients
        </button>
      </div>
    </section>
  );
}
