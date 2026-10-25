import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CatalogGallery } from "../CatalogGallery";
import { StudioCard } from "../configurator/StudioCard";
import "../../index.css";
import "../../styles/configurator.css";
const art = (angle: number, color = "#176e80") =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="900" viewBox="0 0 1000 900"><rect width="1000" height="900" fill="#edf3f4"/><ellipse cx="510" cy="765" rx="245" ry="35" fill="#c8d3d7"/><g transform="translate(${angle * 8},0)"><path d="M290 175 L620 120 L730 230 L730 710 L400 770 L290 665Z" fill="#172c37"/><path d="M400 280 L730 230 L730 710 L400 770Z" fill="${color}"/><path d="M420 305 L690 264 L690 675 L420 726Z" fill="#14202c"/>${[355, 480, 605].map(y => `<ellipse cx="550" cy="${y}" rx="65" ry="45" fill="none" stroke="#62dbdc" stroke-width="14"/>`).join("")}<path d="M290 175 L400 280 L400 770 L290 665Z" fill="#3c535d"/></g><text x="500" y="840" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#244654">View ${angle + 1} · fixture artwork</text></svg>`)}`;
const groups = [
  {
    id: "system",
    name: "Complete system",
    role: "system" as const,
    eligible: true,
    declaredImages: 6,
  },
  {
    id: "option",
    name: "Optional white enclosure",
    role: "optional_component" as const,
    eligible: true,
    referenceOnly: true,
    declaredImages: 2,
  },
  {
    id: "retired-option",
    name: "Unavailable cooling option",
    role: "optional_component" as const,
    eligible: false,
    declaredImages: 1,
  },
];
const images = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  url: art(i, i < 6 ? "#176e80" : "#d7e1e4"),
  isPrimary: i === 2,
  media: {
    width: 1000,
    height: 900,
    hasAlpha: false,
    candidates: [],
    selectedSourceUrl: "",
    unavailableCandidates: 0,
    references: [
      {
        groupId: i < 6 ? "system" : i < 8 ? "option" : "retired-option",
        imageId: String(i + 1),
        position: i,
      },
    ],
  },
}));
function Fixture() {
  const [selected, setSelected] = useState<number[]>([]);
  const [mobile, setMobile] = useState(false);
  return (
    <main
      style={{
        padding: 20,
        fontFamily: "sans-serif",
        maxWidth: 1100,
        margin: "auto",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>
        Studio gallery · local fixture
      </h1>
      <p>
        Mock product imagery. No network generation or saved catalog changes.
      </p>
      <div style={{ display: "flex", gap: 20, padding: "16px 0" }}>
        <button
          onClick={() => setMobile(!mobile)}
          className="rounded border p-2"
        >
          {mobile ? "Desktop layout" : "Mobile layout (375px)"}
        </button>
        <output aria-live="polite">
          {selected.length} / 4 images selected
        </output>
        <button className="rounded border p-2" onClick={() => setSelected([])}>
          Clear selection
        </button>
      </div>
      <div
        className="cfg-root"
        style={
          {
            width: mobile ? 335 : "100%",
            maxWidth: "100%",
            "--studio-card-columns": mobile
              ? "minmax(0, 1fr)"
              : "repeat(3, minmax(0, 1fr))",
          } as React.CSSProperties
        }
      >
        <div className="cfg-card-grid">
          <StudioCard
            title="Atlas gaming workstation"
            description="ATLAS-4090 · Product catalog"
            selected={!!selected.length}
            onSelect={() => setSelected(selected.length ? [] : [3])}
            gallery={
              <CatalogGallery
                name="Atlas"
                images={images}
                groups={groups}
                selectedIds={selected}
                disabled={selected.length >= 4}
                onSelect={id =>
                  setSelected(old =>
                    old.includes(id)
                      ? old.filter(v => v !== id)
                      : old.length < 4
                        ? [...old, id]
                        : old
                  )
                }
              />
            }
          />
          <StudioCard
            title="Compact workstation"
            description="Same compact card dimensions"
            onSelect={() => {}}
            gallery={
              <CatalogGallery
                name="Compact"
                images={images.slice(0, 6)}
                groups={[groups[0]]}
              />
            }
          />
        </div>
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
