import { VisualSelect } from "@/components/choices/VisualSelect";
import { useState } from "react";
import { CalendarDays, Layers3, Palette, Users, X } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PersonPortrait } from "@/components/LifestylePersonPicker";
import {
  HAIR_COLORS,
  MODEL_AGES,
  LIFESTYLE_PEOPLE,
  findLifestylePerson,
  filterLifestylePeople,
} from "@shared/lifestylePeople";
import {
  personReferenceKey,
  type PersonReference,
} from "@shared/creativeBuilder";
import { StudioFilterTabs } from "./StudioFilterTabs";
import { StudioCard } from "./StudioCard";

export function StudioPeople({
  organizationId,
  selected,
  onChange,
}: {
  organizationId: number;
  selected: PersonReference[];
  onChange: (people: PersonReference[]) => void;
}) {
  const [gender, setGender] = useState("female"),
    [age, setAge] = useState("any"),
    [hair, setHair] = useState("any");
  const [search, setSearch] = useState(""),
    [source, setSource] = useState("library"),
    [visible, setVisible] = useState(24);
  const saved = trpc.creativeBuilder.people.useQuery({ organizationId });
  const identity = (ref: PersonReference) =>
    ref.kind === "asset"
      ? saved.data?.find(a => a.id === ref.assetId)?.libraryId ||
        personReferenceKey(ref)
      : ref.id;
  const chosen = (ref: PersonReference) =>
    selected.some(p => identity(p) === identity(ref));
  function toggle(ref: PersonReference) {
    onChange(
      chosen(ref)
        ? selected.filter(p => identity(p) !== identity(ref))
        : selected.length < 4
          ? [...selected, ref]
          : selected
    );
  }
  function reset() {
    setGender("female");
    setSource("library");
    setAge("any");
    setHair("any");
    setSearch("");
    setVisible(24);
  }
  const entries =
    source === "library"
      ? filterLifestylePeople({
          shot: "multiple",
          gender,
          age,
          hair,
          search,
        }).map(p => ({
          ref: { kind: "library", id: p.id } as PersonReference,
          name: p.name,
          age: p.age,
          hair: p.hair,
          approved: true,
          media: <PersonPortrait person={p} />,
        }))
      : (saved.data ?? [])
          .filter(p => {
            const model =
              typeof p.libraryId === "string"
                ? findLifestylePerson(p.libraryId)
                : undefined;
            return (
              (model?.gender ?? p.gender) === gender &&
              (age === "any" || (model?.age ?? p.age) === age) &&
              (hair === "any" || model?.hair === hair) &&
              p.name.toLowerCase().includes(search.toLowerCase())
            );
          })
          .map(p => ({
            ref: { kind: "asset", assetId: p.id } as PersonReference,
            name: p.name,
            age: p.age,
            hair:
              typeof p.libraryId === "string"
                ? findLifestylePerson(p.libraryId)?.hair
                : undefined,
            approved: p.status === "approved",
            media: <img src={p.url} alt={p.name} loading="lazy" />,
          }));
  const title = (ref: PersonReference) =>
    ref.kind === "library"
      ? findLifestylePerson(ref.id)?.name
      : saved.data?.find(p => p.id === ref.assetId)?.name;
  return (
    <div className="cfg-people-browser">
      <StudioFilterTabs
        label="People filters"
        defaultValue="gender"
        items={[
          {
            id: "collection",
            title: "Collection",
            summary: source === "library" ? "Studio models" : "My saved people",
            icon: Layers3,
            content: (
              <VisualSelect
                aria-label="Collection"
                value={source}
                onChange={e => {
                  setSource(e.target.value);
                  setVisible(24);
                }}
              >
                <option value="library">Studio models</option>
                <option value="saved">My saved people</option>
              </VisualSelect>
            ),
          },
          {
            id: "gender",
            title: "Gender",
            summary: gender === "female" ? "Female" : "Male",
            icon: Users,
            content: (
              <VisualSelect
                aria-label="People gender"
                value={gender}
                onChange={e => {
                  setGender(e.target.value);
                  setVisible(24);
                }}
              >
                {(["female", "male"] as const).map(value => (
                  <option
                    key={value}
                    value={value}
                    data-description={`${LIFESTYLE_PEOPLE.filter(p => p.gender === value).length} studio models`}
                  >
                    {value === "female" ? "Female" : "Male"}
                  </option>
                ))}
              </VisualSelect>
            ),
          },
          {
            id: "age",
            title: "Age group",
            summary: MODEL_AGES.find(a => a.id === age)?.label ?? "All ages",
            icon: CalendarDays,
            content: (
              <VisualSelect
                aria-label="Age group"
                value={age}
                onChange={e => {
                  setAge(e.target.value);
                  setVisible(24);
                }}
              >
                <option value="any">All ages</option>
                {MODEL_AGES.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </VisualSelect>
            ),
          },
          {
            id: "hair",
            title: "Hair color",
            summary:
              HAIR_COLORS.find(h => h.id === hair)?.label ?? "All hair colors",
            icon: Palette,
            content: (
              <VisualSelect
                aria-label="Hair color"
                value={hair}
                onChange={e => {
                  setHair(e.target.value);
                  setVisible(24);
                }}
              >
                <option value="any" data-visual="hair:any">
                  All hair colors
                </option>
                {HAIR_COLORS.map(h => (
                  <option key={h.id} value={h.id} data-visual={`hair:${h.id}`}>
                    {h.label}
                  </option>
                ))}
              </VisualSelect>
            ),
          },
        ]}
      />
      <div className="cfg-people-toolbar">
        <label>
          Find a person
          <input
            aria-label="Search people"
            value={search}
            placeholder="Name or model number…"
            onChange={e => {
              setSearch(e.target.value);
              setVisible(24);
            }}
          />
        </label>
        <button type="button" onClick={reset}>
          Reset filters
        </button>
      </div>
      <div className="cfg-selection-strip" aria-label="Selected people">
        <strong>{selected.length} / 4 selected</strong>
        {selected.map(ref => (
          <button
            key={personReferenceKey(ref)}
            onClick={() => toggle(ref)}
            aria-label={`Remove ${title(ref)}`}
          >
            {title(ref) || "Saved person"}
            <X size={14} />
          </button>
        ))}
      </div>
      <p className="cfg-help">
        {entries.length} matches · Fictional AI portraits. Select up to four;
        your selections stay when you change filters.
      </p>
      {source === "saved" && saved.isLoading && (
        <p role="status">Loading saved people…</p>
      )}
      {source === "saved" && saved.error && (
        <p role="alert">
          Could not load your people.{" "}
          <button onClick={() => saved.refetch()}>Retry</button>
        </p>
      )}
      <div className="cfg-card-grid cfg-people-grid">
        {entries.slice(0, visible).map(p => (
          <StudioCard
            key={personReferenceKey(p.ref)}
            title={p.name}
            media={p.media}
            description={[
              MODEL_AGES.find(a => a.id === p.age)?.label,
              HAIR_COLORS.find(h => h.id === p.hair)?.label,
            ]
              .filter(Boolean)
              .join(" · ")}
            badge={!p.approved ? "Needs approval" : undefined}
            selected={chosen(p.ref)}
            disabled={!p.approved || (selected.length >= 4 && !chosen(p.ref))}
            onSelect={() => toggle(p.ref)}
          />
        ))}
      </div>
      {!entries.length && (
        <div className="cfg-empty">
          No people match. <button onClick={reset}>Reset filters</button>
        </div>
      )}
      {entries.length > visible && (
        <button
          className="cfg-load-more"
          onClick={() => setVisible(n => n + 24)}
        >
          Show more people · {entries.length - visible} remaining
        </button>
      )}
      <p className="cfg-help">
        <Link href="/app/brand">
          Manage your own portrait references in Brand
        </Link>
        . Age and hair filters use saved attributes; untagged attributes are not
        guessed.
      </p>
    </div>
  );
}
