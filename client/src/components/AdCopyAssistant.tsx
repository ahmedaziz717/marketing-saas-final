import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { channelInput } from "./ChannelConnections";
import type { PublicationContent } from "@shared/channels";
type Copy = { message: string; headline: string; description: string };
export function AdCopyAssistant({
  organizationId,
  assetKeys,
  promotion,
  allowVariants,
  onUse,
}: {
  organizationId: number;
  assetKeys: string[];
  promotion?: PublicationContent["promotion"];
  allowVariants: boolean;
  onUse: (copy: Copy, rest?: Copy[]) => void;
}) {
  const [direction, setDirection] = useState("");
  const [options, setOptions] = useState<Copy[]>([]);
  const [source, setSource] = useState("");
  const key = JSON.stringify({ assetKeys, promotion });
  const current = useRef(key);
  current.current = key;
  const generate = trpc.channels.draftAssetCopy.useMutation({
    onSuccess: (data, variables) => {
      const requested = JSON.stringify({
        assetKeys: variables.assetKeys,
        promotion: variables.promotion,
      });
      if (current.current !== requested) {
        toast.info("Selection changed. Generate fresh copy for these assets.");
        return;
      }
      setSource(requested);
      setOptions(data.options);
    },
    onError: e => toast.error(e.message),
  });
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
        onClick={() =>
          generate.mutate({ organizationId, assetKeys, promotion, direction })
        }
      >
        {generate.isPending ? "Creating suggestions…" : "Generate ad copy"}
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
            <Button type="button" variant="outline" onClick={() => onUse(o)}>
              Use option {i + 1}
            </Button>
          </div>
        ))}
      {source === key && options.length > 1 && allowVariants && (
        <Button
          type="button"
          onClick={() => onUse(options[0], options.slice(1))}
        >
          Use all as Meta text options
        </Button>
      )}
    </div>
  );
}
export function TextVariantFields({
  value,
  onChange,
}: {
  value: PublicationContent["textVariants"];
  onChange: (value: NonNullable<PublicationContent["textVariants"]>) => void;
}) {
  const variants = value ?? { messages: [], headlines: [], descriptions: [] };
  return (
    <div className="rounded-xl border p-4 space-y-4">
      <h3 className="font-semibold">Additional Meta text options</h3>
      <p className="text-xs text-muted-foreground">
        Up to 5 of each, including the primary fields above. Meta may combine
        these options and may not display every description. Approval covers
        every option.
      </p>
      {(["messages", "headlines", "descriptions"] as const).map(key => (
        <div className="space-y-2" key={key}>
          <p className="text-sm font-medium">
            {key === "messages"
              ? "Primary text"
              : key === "headlines"
                ? "Headlines"
                : "Descriptions"}
          </p>
          {variants[key].map((text, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                aria-label={`${key} option ${i + 2}`}
                className={channelInput}
                value={text}
                maxLength={
                  key === "messages" ? 5000 : key === "headlines" ? 200 : 300
                }
                onChange={e =>
                  onChange({
                    ...variants,
                    [key]: variants[key].map((v, n) =>
                      n === i ? e.target.value : v
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ${key} option ${i + 2}`}
                onClick={() =>
                  onChange({
                    ...variants,
                    [key]: variants[key].filter((_, n) => n !== i),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={variants[key].length >= 4}
            onClick={() =>
              onChange({ ...variants, [key]: [...variants[key], ""] })
            }
          >
            Add{" "}
            {key === "messages"
              ? "primary text"
              : key === "headlines"
                ? "headline"
                : "description"}
          </Button>
        </div>
      ))}
    </div>
  );
}
