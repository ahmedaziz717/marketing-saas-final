import React from "react";
import {
  Sparkles,
  Radio,
  ChartNoAxesCombined,
  SlidersHorizontal,
  ArrowUpRight,
} from "lucide-react";
export function EvokeLoopLogo({
  reversed = false,
  symbol = false,
  className = "",
}: {
  reversed?: boolean;
  symbol?: boolean;
  className?: string;
}) {
  return (
    <img
      className={(symbol ? "evoke-symbol " : "evoke-wordmark ") + className}
      src={
        symbol
          ? "/website/evokeloop-symbol.svg"
          : `/website/evokeloop-wordmark${reversed ? "-reversed" : ""}.svg`
      }
      alt="EvokeLoop"
      width={symbol ? 137 : 487}
      height={symbol ? 137 : 115}
    />
  );
}
const stages = [
  {
    name: "Create",
    icon: Sparkles,
    state: "Preview",
    web: "/product/create",
    app: "/app/creatives/overview",
  },
  {
    name: "Activate",
    icon: Radio,
    state: "Connect",
    web: "/product/activate",
    app: "/app/publishing",
  },
  {
    name: "Measure",
    icon: ChartNoAxesCombined,
    state: "With data",
    web: "/product/measure",
    app: "/app/analytics",
  },
  {
    name: "Optimize",
    icon: SlidersHorizontal,
    state: "Roadmap",
    web: "/product/optimize",
    app: "/app/optimize",
  },
];
/** The product vision, not a fabricated report or an autonomous execution control. */
export function MarketingLoop({
  context = "public",
  compact = false,
}: {
  context?: "public" | "app";
  compact?: boolean;
}) {
  return (
    <figure
      className={`evoke-loop ${compact ? "loop-compact" : ""}`}
      aria-label="The EvokeLoop cycle: create, activate, measure, optimize, then return to create"
    >
      <div className="loop-map">
        <svg className="loop-orbit" viewBox="0 0 600 600" aria-hidden="true">
          <circle className="loop-track" cx="300" cy="300" r="211" />
          <circle className="loop-current" cx="300" cy="300" r="211" />
          {[45, 135, 225, 315].map(angle => (
            <path
              key={angle}
              className="loop-arrow"
              transform={`rotate(${angle} 300 300)`}
              d="M290 82L305 89L290 96Z"
            />
          ))}
        </svg>
        <div className="loop-heart">
          <EvokeLoopLogo symbol />
          <strong>
            Better next
            <br />
            decisions.
          </strong>
          <span>THE EVOKELOOP VISION</span>
        </div>
        <ol className="loop-stages">
          {stages.map((stage, i) => (
            <li key={stage.name} className={`loop-stage stage-${i + 1}`}>
              <a href={context === "app" ? stage.app : stage.web}>
                <span className="loop-stage-top">
                  <span>0{i + 1}</span>
                  <stage.icon size={18} aria-hidden="true" />
                </span>
                <strong>{stage.name}</strong>
                <small>{stage.state}</small>
                <ArrowUpRight
                  className="stage-go"
                  size={14}
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="loop-caption">
        Create. Activate. Measure. Optimize. <strong>Repeat.</strong>
      </figcaption>
      {!compact && (
        <label className="loop-motion-control">
          <input type="checkbox" /> Pause loop motion
        </label>
      )}
    </figure>
  );
}
