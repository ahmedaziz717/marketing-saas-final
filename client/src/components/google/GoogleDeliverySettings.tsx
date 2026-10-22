import {
  googleBiddingStrategies,
  type GoogleChange,
  type GoogleCampaignCreate,
} from "@shared/googleCampaigns";
import { Field, ResourcePicker, label } from "./GoogleCampaignFields";

export function GoogleDeliverySettings({
  organizationId,
  connectionId,
  section,
  change,
  onChange,
  currency,
  disabled,
}: {
  organizationId: number;
  connectionId: string;
  section: string;
  change: GoogleChange;
  onChange: (change: GoogleChange) => void;
  currency?: string;
  disabled: boolean;
}) {
  const scope = { organizationId, connectionId };
  const edit = onChange;
  const patch = (value: Partial<GoogleCampaignCreate>) => {
    if (change.kind === "campaign_create") onChange({ ...change, ...value });
  };
  return (
    <fieldset disabled={disabled}>
      {section === "settings" &&
        (change.kind === "campaign_create" ||
        change.kind === "campaign_update" ? (
          <>
            <div className="google-form-grid">
              <Field title="Campaign name">
                <input
                  value={change.name}
                  onChange={e => edit({ ...change, name: e.target.value })}
                />
              </Field>
              <Field title={`Daily budget · ${currency ?? "account currency"}`}>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={change.dailyBudget || ""}
                  onChange={e =>
                    edit({
                      ...change,
                      dailyBudget: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field title="Launch status">
                <select
                  value={change.status}
                  onChange={e =>
                    edit({
                      ...change,
                      status: e.target.value as "ENABLED" | "PAUSED",
                    })
                  }
                >
                  <option value="ENABLED">Active</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </Field>
            </div>
            <p>
              An active campaign may start spending when Google approves its
              ads. The daily budget is an average; Google may spend more on
              individual days.
            </p>
          </>
        ) : (
          <p>This change uses the existing campaign budget and targeting.</p>
        ))}
      {change.kind === "campaign_create" && (
        <>
          {section === "settings" && (
            <div className="google-form-grid">
              <Field title="Bidding strategy">
                <select
                  value={change.bidding.strategy}
                  onChange={e =>
                    patch({
                      bidding: {
                        strategy: e.target
                          .value as GoogleCampaignCreate["bidding"]["strategy"],
                      },
                    })
                  }
                >
                  {googleBiddingStrategies[change.type].map(s => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                title={
                  change.bidding.strategy.includes("ROAS") ||
                  change.bidding.strategy.includes("VALUE")
                    ? "Target ROAS · multiple, e.g. 4 = 400%"
                    : "Bid target · account currency"
                }
              >
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={change.bidding.target ?? ""}
                  onChange={e =>
                    patch({
                      bidding: {
                        ...change.bidding,
                        target: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      },
                    })
                  }
                />
              </Field>
              <Field title="Start date · optional">
                <input
                  type="date"
                  value={change.startDate ?? ""}
                  onChange={e =>
                    patch({
                      startDate: e.target.value || undefined,
                    })
                  }
                />
              </Field>
              <Field title="End date · optional">
                <input
                  type="date"
                  value={change.endDate ?? ""}
                  onChange={e =>
                    patch({ endDate: e.target.value || undefined })
                  }
                />
              </Field>
            </div>
          )}
          {section === "targeting" && (
            <>
              <ResourcePicker
                {...scope}
                kind="locations"
                title="Locations"
                value={change.locationIds}
                onChange={locationIds => patch({ locationIds })}
              />
              <ResourcePicker
                {...scope}
                kind="languages"
                title="Languages"
                value={change.languageIds}
                onChange={languageIds => patch({ languageIds })}
              />
            </>
          )}
          {section === "options" && (
            <>
              <Field title="EU political advertising declaration">
                <select
                  value={change.politicalAdvertising}
                  onChange={e =>
                    patch({
                      politicalAdvertising: e.target
                        .value as GoogleCampaignCreate["politicalAdvertising"],
                    })
                  }
                >
                  <option value="DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING">
                    Does not contain EU political advertising
                  </option>
                  <option value="CONTAINS_EU_POLITICAL_ADVERTISING">
                    Contains EU political advertising
                  </option>
                </select>
              </Field>
              {change.type === "SEARCH" && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={change.searchPartners}
                      onChange={e =>
                        patch({ searchPartners: e.target.checked })
                      }
                    />{" "}
                    Search partners
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={change.displayExpansion}
                      onChange={e =>
                        patch({
                          displayExpansion: e.target.checked,
                        })
                      }
                    />{" "}
                    Display expansion
                  </label>
                  <Field title="Keyword match type">
                    <select
                      value={
                        change.keywords.find(k => !k.negative)?.match ?? "EXACT"
                      }
                      onChange={e =>
                        patch({
                          keywords: change.keywords.map(k =>
                            k.negative
                              ? k
                              : {
                                  ...k,
                                  match: e.target.value as
                                    | "EXACT"
                                    | "PHRASE"
                                    | "BROAD",
                                }
                          ),
                        })
                      }
                    >
                      <option value="EXACT">Exact</option>
                      <option value="PHRASE">Phrase</option>
                      <option value="BROAD">Broad</option>
                    </select>
                  </Field>
                  <Field title="Keywords · one per line">
                    <textarea
                      rows={4}
                      value={change.keywords
                        .filter(k => !k.negative)
                        .map(k => k.text)
                        .join("\n")}
                      onChange={e =>
                        patch({
                          keywords: [
                            ...change.keywords.filter(k => k.negative),
                            ...e.target.value.split("\n").map(text => ({
                              text,
                              match:
                                change.keywords.find(k => !k.negative)?.match ??
                                ("EXACT" as const),
                              negative: false,
                            })),
                          ],
                        })
                      }
                    />
                  </Field>
                  <Field title="Negative keywords · one per line">
                    <textarea
                      rows={2}
                      value={change.keywords
                        .filter(k => k.negative)
                        .map(k => k.text)
                        .join("\n")}
                      onChange={e =>
                        patch({
                          keywords: [
                            ...change.keywords.filter(k => !k.negative),
                            ...e.target.value
                              .split("\n")
                              .filter(Boolean)
                              .map(text => ({
                                text,
                                match: "PHRASE" as const,
                                negative: true,
                              })),
                          ],
                        })
                      }
                    />
                  </Field>
                </>
              )}
              {change.type === "PERFORMANCE_MAX" && (
                <label>
                  <input
                    type="checkbox"
                    checked={change.urlExpansion}
                    onChange={e => patch({ urlExpansion: e.target.checked })}
                  />{" "}
                  Let Google expand final URLs
                </label>
              )}
              {["SHOPPING", "PERFORMANCE_MAX"].includes(change.type) && (
                <>
                  <p>
                    {change.type === "PERFORMANCE_MAX"
                      ? "Optional product feed for retail campaigns"
                      : "Shopping product feed"}
                  </p>
                  <ResourcePicker
                    {...scope}
                    kind="merchants"
                    title="Merchant Center account"
                    value={change.merchantId ? [change.merchantId] : []}
                    onChange={v => patch({ merchantId: v[0] })}
                  />
                  <Field title="Feed label">
                    <input
                      value={change.feedLabel ?? ""}
                      onChange={e => patch({ feedLabel: e.target.value })}
                    />
                  </Field>
                  <p>This setup includes all products in the selected feed.</p>
                </>
              )}
              {change.type === "DEMAND_GEN" && (
                <>
                  <ResourcePicker
                    {...scope}
                    kind="audiences"
                    title="Audience"
                    value={change.audienceId ? [change.audienceId] : []}
                    onChange={v => patch({ audienceId: v[0] })}
                  />
                  <Field title="Demand Gen surfaces">
                    <select
                      value={
                        change.demandChannels?.length === 1 &&
                        change.demandChannels[0] === "youtubeShorts"
                          ? "shorts"
                          : change.demandChannels?.includes("display") === false
                            ? "owned"
                            : "all"
                      }
                      onChange={e =>
                        patch({
                          demandChannels:
                            e.target.value === "shorts"
                              ? ["youtubeShorts"]
                              : e.target.value === "owned"
                                ? [
                                    "youtubeInStream",
                                    "youtubeInFeed",
                                    "youtubeShorts",
                                    "discover",
                                    "gmail",
                                    "maps",
                                  ]
                                : undefined,
                        })
                      }
                    >
                      <option value="all">All supported channels</option>
                      <option value="owned">Google owned channels</option>
                      <option value="shorts">YouTube Shorts</option>
                    </select>
                  </Field>
                </>
              )}
              {change.type === "APP" && (
                <>
                  <Field title="App ID">
                    <input
                      value={change.appId ?? ""}
                      onChange={e => patch({ appId: e.target.value })}
                    />
                  </Field>
                  <Field title="App store">
                    <select
                      value={change.appStore ?? ""}
                      onChange={e =>
                        patch({
                          appStore: e.target
                            .value as GoogleCampaignCreate["appStore"],
                        })
                      }
                    >
                      <option value="">Choose…</option>
                      <option value="GOOGLE_APP_STORE">Google Play</option>
                      <option value="APPLE_APP_STORE">Apple App Store</option>
                    </select>
                  </Field>
                </>
              )}
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
