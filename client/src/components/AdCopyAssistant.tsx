import { ActionCredits } from "./ActionCredits";
import { useState } from "react";
import { useAssetCopy } from "@/hooks/useAssetCopy";
import type { CopySet } from "@shared/adCopy";
import { Button } from "./ui/button";
import { channelInput } from "./ChannelConnections";
import type { PublicationContent } from "@shared/channels";
type Copy = CopySet;
export function AdCopyAssistant({
  organizationId,
  channel = "meta_ads",
  assetKeys,
  promotion,
  onUse,
}: {
  organizationId: number;
  channel?: "facebook" | "meta_ads";
  assetKeys: string[];
  promotion?: PublicationContent["promotion"];
  onUse: (copy: Copy) => void;
}) {
  const [direction, setDirection] = useState("");
  const [options, setOptions] = useState<Copy[]>([]);
  const [source, setSource] = useState("");
  const key = JSON.stringify({ organizationId, assetKeys, promotion, channel });
  const generate = useAssetCopy(
    {
      organizationId,
      assetKeys,
      promotion,
      channel,
      direction,
      currentOptions: source === key ? options : [],
    },
    (generated, target) => {
      setSource(key);
      setOptions(previous =>
        target
          ? previous.map((option, i) =>
              i === target.index ? generated[0] : option
            )
          : generated
      );
    }
  );
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold">Create copy from selected images</h3>
      <label className="block text-sm">
        Optional direction
        <textarea
          className={channelInput + " mt-1"}
          value={direction}
          onChange={e => setDirection(e.target.value)}
          maxLength={2000}
          placeholder="For example: invite education providers to start a listing."
        />
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={!assetKeys.length || generate.isPending}
        onClick={() => generate.generate()}
      >
        {generate.isPending
          ? "Creating suggestions…"
          : channel === "facebook"
            ? "Generate post copy"
            : source === key && options.length
              ? "Regenerate all 5 sets"
              : "Generate 5 copy sets"}{" "}
        <ActionCredits organizationId={organizationId} />
      </Button>
      <p className="text-xs text-muted-foreground">
        Uses the actual selected images and saved business/brand context. Review
        facts and claims before using a suggestion.
      </p>
      {source === key &&
        options.map((o, i) => (
          <div className="rounded-lg bg-muted p-3 space-y-2" key={i}>
            <strong>{o.headline}</strong>
            <p className="text-sm whitespace-pre-wrap">{o.message}</p>
            <p className="text-xs">{o.description}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={generate.isPending}
                onClick={() => onUse(o)}
              >
                Use option {i + 1}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={generate.isPending}
                onClick={() => generate.generate({ index: i, field: "set" })}
              >
                Regenerate option {i + 1}{" "}
                <ActionCredits organizationId={organizationId} />
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
