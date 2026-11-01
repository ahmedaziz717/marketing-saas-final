import { useEffect, useId, useState } from "react";
import { ArrowRight, Check, ChevronDown, Compass } from "lucide-react";
import { configuratorSections } from "@shared/creativeConfigurator";

type Trail = { image: string[]; video: string[] };
const emptyTrail = (): Trail => ({ image: [], video: [] });
const known = new Set<string>(
  configuratorSections.flatMap(s => s.categories.map(c => c.id))
);

export function useStudioExploration(
  storageKey: string,
  kind: "image" | "video",
  category: string,
  hasPeople: boolean
) {
  const [trail, setTrail] = useState<Trail>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey + ":explored") ?? "null"
      );
      const read = (value: unknown) =>
        Array.isArray(value)
          ? value.filter(
              (id): id is string => typeof id === "string" && known.has(id)
            )
          : [];
      return { image: read(stored?.image), video: read(stored?.video) };
    } catch {
      return emptyTrail();
    }
  });
  const sections = configuratorSections.map(section => ({
    ...section,
    categories: section.categories
      .filter(c =>
        kind === "image"
          ? !["audio", "subtitles"].includes(c.id)
          : c.id !== "fonts"
      )
      .map(c => ({
        ...c,
        available: c.id !== "people" || hasPeople,
        explored: trail[kind].includes(c.id),
      })),
  }));
  const eligible = sections.flatMap(s =>
    s.categories.filter(c => c.available).map(c => ({ ...c, section: s.id }))
  );
  useEffect(() => {
    if (category === "people" && !hasPeople) return;
    setTrail(previous =>
      previous[kind].includes(category)
        ? previous
        : { ...previous, [kind]: [...previous[kind], category] }
    );
  }, [kind, category, hasPeople, trail]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey + ":explored", JSON.stringify(trail));
    } catch {
      /* Optional navigation memory; saving a creative is unaffected. */
    }
  }, [storageKey, trail]);
  const index = eligible.findIndex(c => c.id === category);
  const ordered = [
    ...eligible.slice(index + 1),
    ...eligible.slice(0, index + 1),
  ];
  return {
    sections,
    total: eligible.length,
    explored: eligible.filter(c => c.explored).length,
    next: ordered.find(c => !c.explored && c.id !== category),
    following: eligible[index + 1],
    reset: (target?: "image" | "video") =>
      setTrail(previous =>
        target ? { ...previous, [target]: [] } : emptyTrail()
      ),
  };
}

export function StudioDiscovery({
  discovery,
  current,
  onSelect,
}: {
  discovery: ReturnType<typeof useStudioExploration>;
  current: string;
  onSelect: (section: string, category: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mapId = useId();
  return (
    <div className="cfg-discovery">
      <div className="cfg-discovery-bar">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={mapId}
          onClick={() => setOpen(!open)}
        >
          <Compass size={17} aria-hidden="true" />
          <span>
            Options map{" "}
            <small>
              {discovery.explored}/{discovery.total} explored
            </small>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {discovery.next ? (
          <button
            type="button"
            className="cfg-discovery-next"
            onClick={() =>
              onSelect(discovery.next!.section, discovery.next!.id)
            }
          >
            <span>
              Explore next: <strong>{discovery.next.title}</strong>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <span className="cfg-discovery-done">
            <Check size={16} aria-hidden="true" />
            All categories explored
          </span>
        )}
      </div>
      {open && (
        <div
          id={mapId}
          className="cfg-discovery-map"
          role="region"
          aria-label="All creative categories"
        >
          <p>
            See what you’ve opened and discover the options still ahead.
            Exploring is optional; your current choices stay in place.
          </p>
          {discovery.sections.map(section => (
            <div key={section.id}>
              <h3>{section.title}</h3>
              <div>
                {section.categories.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    aria-label={`Explore ${item.title}`}
                    aria-current={current === item.id ? "true" : undefined}
                    onClick={() => {
                      onSelect(section.id, item.id);
                      setOpen(false);
                    }}
                  >
                    <span
                      className={`cfg-exploration-mark${item.explored && item.available ? " is-explored" : ""}`}
                      aria-hidden="true"
                    >
                      {item.explored && item.available ? (
                        <Check size={12} />
                      ) : null}
                    </span>
                    {item.title}
                    <small>
                      {!item.available
                        ? "Needs people scene"
                        : item.explored
                          ? "Explored"
                          : "Not explored"}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
