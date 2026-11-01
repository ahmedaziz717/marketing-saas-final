import { ArrowUpRight, Ban } from "lucide-react";
import {
  metaWebsiteCallToActions,
  type MetaCallToAction,
} from "@shared/metaCallToAction";
import { StudioCard } from "../configurator/StudioCard";

export function MetaCallToActionTiles({
  value,
  onChange,
}: {
  value: MetaCallToAction;
  onChange: (value: MetaCallToAction) => void;
}) {
  return (
    <section aria-label="Meta call to action">
      <h3>Call to action</h3>
      <p className="activation-help">
        Choose a Meta website button. Available delivery depends on the campaign
        objective and placements.
      </p>
      <div className="cfg-card-grid activation-cta-grid">
        {metaWebsiteCallToActions.map(option => (
          <StudioCard
            key={option.id}
            title={option.label}
            description={option.description}
            selected={value === option.id}
            onSelect={() => onChange(option.id)}
            media={
              <div className="activation-cta-art">
                <span>
                  {option.id === "NO_BUTTON" ? (
                    <Ban size={16} />
                  ) : (
                    <ArrowUpRight size={16} />
                  )}{" "}
                  {option.label}
                </span>
              </div>
            }
          />
        ))}
      </div>
    </section>
  );
}
