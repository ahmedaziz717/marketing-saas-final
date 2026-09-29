import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { channelInput } from "./ChannelConnections";
import {
  businessProfileSchema,
  businessModels,
  businessModelLabels,
  type BusinessProfile,
} from "@shared/businessProfile";
export function BusinessProfileForm({
  organizationId,
  onSaved,
  disabled = false,
}: {
  organizationId: number;
  onSaved?: () => void;
  disabled?: boolean;
}) {
  const utils = trpc.useUtils();
  const query = trpc.brand.get.useQuery({ organizationId });
  const [profile, setProfile] = useState<BusinessProfile>(() =>
    businessProfileSchema.parse({})
  );
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (query.data && !dirty)
      setProfile(businessProfileSchema.parse(query.data.businessProfile ?? {}));
  }, [query.data, dirty]);
  const save = trpc.brand.saveProfile.useMutation({
    onSuccess: async () => {
      setDirty(false);
      await utils.brand.get.invalidate({ organizationId });
      toast.success("Business profile saved");
      onSaved?.();
    },
    onError: e => toast.error(e.message),
  });
  const suggest = trpc.brand.suggestProfile.useMutation({
    onSuccess: p => {
      setDirty(true);
      setProfile(p);
      toast.success("Suggested answers ready. Review and save them.");
    },
    onError: e => toast.error(e.message),
  });
  const update = (key: keyof BusinessProfile, value: string) => {
    setDirty(true);
    setProfile(p => ({ ...p, [key]: value }));
  };
  if (query.isLoading) return <p>Loading business profile…</p>;
  if (query.error) return <p role="alert">Could not load business profile.</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        const result = businessProfileSchema.safeParse(profile);
        if (!result.success) {
          toast.error(result.error.issues[0].message);
          return;
        }
        save.mutate({ organizationId, profile: result.data });
      }}
    >
      <h3 className="text-lg font-semibold">
        Business profile & onboarding answers
      </h3>
      <p className="text-sm text-muted-foreground">
        Edit these anytime in Settings → Company & brand. They guide website
        discovery and new creative suggestions. Existing approved content stays
        as reviewed.
      </p>
      <fieldset
        disabled={disabled || save.isPending || suggest.isPending}
        className="grid gap-4 sm:grid-cols-2"
      >
        <label className="text-sm">
          Business model
          <select
            className={channelInput + " mt-1"}
            value={profile.model}
            onChange={e => update("model", e.target.value)}
          >
            {businessModels.map(m => (
              <option key={m} value={m}>
                {businessModelLabels[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Website
          <input
            className={channelInput + " mt-1"}
            type="url"
            value={profile.website}
            onChange={e => update("website", e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!profile.website}
          onClick={() =>
            suggest.mutate({ organizationId, website: profile.website })
          }
        >
          {suggest.isPending
            ? "Reading website…"
            : "Suggest answers from website"}
        </Button>
        {(
          [
            ["summary", "What does your business do?"],
            ["audiences", "Who do you serve?"],
            ["goals", "What should marketing achieve?"],
            ["primaryOffer", "What are you promoting?"],
          ] as const
        ).map(([key, label]) => (
          <label className="text-sm sm:col-span-2" key={key}>
            {label}
            <textarea
              className={channelInput + " mt-1 min-h-20"}
              value={profile[key]}
              onChange={e => update(key, e.target.value)}
              placeholder={
                key === "audiences"
                  ? "For example: parents and educators; education providers"
                  : key === "goals"
                    ? "For example: directory visits, listing claims, trial starts, paid subscriptions"
                    : ""
              }
            />
          </label>
        ))}
        <label className="text-sm">
          Time zone
          <input
            className={channelInput + " mt-1"}
            value={profile.timezone}
            onChange={e => update("timezone", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Currency
          <input
            className={channelInput + " mt-1"}
            value={profile.currency}
            maxLength={3}
            onChange={e => update("currency", e.target.value.toUpperCase())}
          />
        </label>
        <Button type="submit" className="justify-self-start">
          {save.isPending
            ? "Saving…"
            : onSaved
              ? "Save and continue"
              : "Save business profile"}
        </Button>
      </fieldset>
    </form>
  );
}
