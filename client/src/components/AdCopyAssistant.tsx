import { ActionCredits } from "./ActionCredits";
import { useState } from "react";
import { useAssetCopy } from "@/hooks/useAssetCopy";
import { canGenerateAssetCopy } from "@shared/adCopy";
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
  copyDirection,
  callToAction,
  onUse,
}: {
  organizationId: number;
  channel?: "facebook" | "meta_ads";
  assetKeys: string[];
  promotion?: PublicationContent["promotion"];
  copyDirection?: PublicationContent["copyDirection"];
  callToAction?: PublicationContent["callToAction"];
  onUse: (copy: Copy) => void;
}) {
  const [direction, setDirection] = useState("");
  const [options, setOptions] = useState<Copy[]>([]);
  const [source, setSource] = useState("");
  const key = JSON.stringify({
    organizationId,
    assetKeys,
    promotion,
    channel,
    copyDirection,
    callToAction,
  });
  const generate = useAssetCopy(
    {
      organizationId,
      assetKeys,
      promotion,
      copyDirection,
      callToAction,
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
      <h3 className="font-semibold">Generate copy from your setup</h3>
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
        disabled={
          !canGenerateAssetCopy({ assetKeys, promotion, direction }) ||
          generate.isPending
        }
        onClick={() => generate.generate()}
      >
        {generate.isPending
          ? "Creating suggestions…"
          : channel === "facebook"
            ? "Generate post copy"
            : source === key && options.length
              ? "Regenerate all 5 sets"
              : "Generate 5 copy sets"}{" "}
        <ActionCredits
          organizationId={organizationId}
          operation="channels.draftAssetCopy"
        />
      </Button>
      <p className="text-xs text-muted-foreground">
        Uses your setup, saved brand context, and selected images when
        available. Review facts and claims before using a suggestion.
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
                <ActionCredits
                  organizationId={organizationId}
                  operation="channels.draftAssetCopy"
                />
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
