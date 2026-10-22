import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { OptimizationNodeSettings } from "./OptimizationNodeSettings";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "./ui/input";
import { datePresets } from "@shared/reportDates";
import { dateInZone, localScheduleToUtc } from "@shared/channels";
import { workflowNodes, type WorkflowNode } from "@shared/creativeWorkflow";
import {
  workflowChannels,
  workflowNodeChannels,
} from "@shared/workflowChannels";

export function WorkflowBusinessSettings({
  node,
  organizationId,
  onChange,
}: {
  node: WorkflowNode;
  organizationId: number;
  onChange: (value: Partial<WorkflowNode["config"]>) => void;
}) {
  const meta = workflowNodes[node.type],
    config = node.config;
  const [status, setStatus] = useState<"active" | "paused" | "all">(
    node.type === "meta_activate" ? "paused" : "active"
  );
  const [scheduleError, setScheduleError] = useState("");
  const advertisingHistory = [
    "meta_history",
    "classify_history",
    "analyze_history",
  ].includes(node.type);
  const channels =
    node.type === "meta_history"
      ? ["meta_ads", "google_ads"]
      : workflowNodeChannels(node.type);
  const connections = trpc.channels.connections.useQuery({
    organizationId,
    includeGoogle: channels.includes("google_ads"),
  });
  const objects = trpc.channels.adObjects.useQuery(
    {
      organizationId,
      connectionId: config.connectionId ?? "",
      filters: { status },
    },
    {
      enabled:
        !!config.connectionId &&
        ["meta_ad", "meta_activate", "meta_report"].includes(node.type),
    }
  );
  const choices =
    connections.data?.items.filter(
      c =>
        c.status === "connected" && !c.expired && channels.includes(c.channel)
    ) ?? [];
  const timezone =
    config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      <OptimizationNodeSettings
        node={node}
        onChange={onChange}
        channel={choices.find(c => c.id === config.connectionId)?.channel}
      />
      {meta.channel && (
        <>
          <ChoiceField>
            {advertisingHistory
              ? "Connected advertising account"
              : meta.channel === "facebook"
                ? "Connected Facebook Page"
                : `Connected ${workflowChannels[meta.channel].account}`}
            <VisualSelect
              value={config.connectionId ?? ""}
              onChange={e =>
                onChange({
                  connectionId: e.target.value || undefined,
                  campaignId: undefined,
                  adSetId: undefined,
                  adId: undefined,
                  measurePublishedOnly: false,
                })
              }
            >
              <option value="">Choose a connected account</option>
              {choices.map(c => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </VisualSelect>
          </ChoiceField>
          {!connections.isLoading && !choices.length && (
            <Link href="/app/settings/integrations" className="wf-setting-help">
              Connect{" "}
              {channels.length > 1
                ? "an advertising account"
                : workflowChannels[meta.channel].account}{" "}
              in Integrations
            </Link>
          )}
          {connections.error && <p role="alert">{connections.error.message}</p>}
        </>
      )}
      {["google_report", "google_inventory"].includes(node.type) &&
        config.connectionId && (
          <GoogleWorkflowSettings
            node={node}
            organizationId={organizationId}
            onChange={onChange}
          />
        )}
      {["meta_ad", "meta_activate", "meta_report"].includes(node.type) &&
        config.connectionId && (
          <>
            <ChoiceField>
              Show campaigns and ads
              <VisualSelect
                value={status}
                onChange={e => setStatus(e.target.value as typeof status)}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="all">All statuses</option>
              </VisualSelect>
            </ChoiceField>
            <ChoiceField>
              Campaign
              <VisualSelect
                value={config.campaignId ?? ""}
                onChange={e =>
                  onChange({
                    campaignId: e.target.value || undefined,
                    adSetId: undefined,
                    adId: undefined,
                  })
                }
              >
                <option value="">
                  {node.type === "meta_report"
                    ? "Whole account"
                    : "Choose a campaign"}
                </option>
                {objects.data?.campaigns.map(c => (
                  <option value={String(c.id)} key={String(c.id)}>
                    {String(c.name)}
                  </option>
                ))}
              </VisualSelect>
            </ChoiceField>
            {node.type === "meta_ad" && (
              <ChoiceField>
                Existing ad set
                <VisualSelect
                  value={config.adSetId ?? ""}
                  onChange={e =>
                    onChange({ adSetId: e.target.value || undefined })
                  }
                >
                  <option value="">Choose an ad set</option>
                  {objects.data?.adsets
                    .filter(
                      a =>
                        !config.campaignId ||
                        String(a.campaign_id) === config.campaignId
                    )
                    .map(a => (
                      <option key={String(a.id)} value={String(a.id)}>
                        {String(a.name)}
                      </option>
                    ))}
                </VisualSelect>
              </ChoiceField>
            )}
            {node.type === "meta_activate" && (
              <ChoiceField>
                Existing ad
                <VisualSelect
                  value={config.adId ?? ""}
                  onChange={e =>
                    onChange({ adId: e.target.value || undefined })
                  }
                >
                  <option value="">Choose an ad</option>
                  {objects.data?.ads
                    .filter(
                      a =>
                        !config.campaignId ||
                        String(a.campaign_id) === config.campaignId
                    )
                    .map(a => (
                      <option key={String(a.id)} value={String(a.id)}>
                        {String(a.name)} · {String(a.status)}
                      </option>
                    ))}
                </VisualSelect>
              </ChoiceField>
            )}
            {objects.isLoading && <small>Loading from Meta…</small>}
            {objects.error && <p role="alert">{objects.error.message}</p>}
            {node.type === "meta_activate" && (
              <p className="wf-setting-help">
                Activation requires a separate review during the run and can
                begin spending under the existing ad-set and campaign settings.
              </p>
            )}
          </>
        )}
      {["facebook_post", "meta_ad"].includes(node.type) && (
        <>
          <label>
            {node.type === "meta_ad" ? "Ad copy" : "Post caption"}
            <textarea
              value={config.text}
              onChange={e => onChange({ text: e.target.value })}
              maxLength={5000}
              rows={4}
              placeholder="Use connected copy, write here, or combine both."
            />
          </label>
          <label>
            {node.type === "meta_ad"
              ? "Destination URL"
              : "Website link (optional)"}
            <Input
              value={config.destinationUrl ?? ""}
              placeholder="https://"
              onChange={e => onChange({ destinationUrl: e.target.value })}
            />
          </label>
          {node.type === "meta_ad" && (
            <label>
              Headline
              <Input
                value={config.headline ?? ""}
                onChange={e => onChange({ headline: e.target.value })}
                maxLength={200}
              />
            </label>
          )}
          <ChoiceField>
            Delivery time
            <VisualSelect
              value={config.scheduledAtMs ? "scheduled" : "now"}
              onChange={e =>
                onChange({
                  scheduledAtMs:
                    e.target.value === "now" ? null : Date.now() + 3600000,
                  timezone,
                })
              }
            >
              <option value="now">After publication approval</option>
              <option value="scheduled">Schedule for later</option>
            </VisualSelect>
          </ChoiceField>
          {!!config.scheduledAtMs && (
            <>
              <label>
                Scheduled date and time
                <Input
                  type="datetime-local"
                  value={dateInZone(config.scheduledAtMs, timezone)}
                  onChange={e => {
                    try {
                      onChange({
                        scheduledAtMs: localScheduleToUtc(
                          e.target.value,
                          timezone
                        ),
                        timezone,
                      });
                      setScheduleError("");
                    } catch (error) {
                      setScheduleError((error as Error).message);
                    }
                  }}
                />
              </label>
              <small>{timezone}</small>
              {scheduleError && <p role="alert">{scheduleError}</p>}
            </>
          )}
          <p className="wf-setting-help">
            The publication is submitted for review. Connect “Publish or
            schedule” to continue after approval.
            {node.type === "meta_ad"
              ? " New Meta ads are delivered paused."
              : ""}
          </p>
        </>
      )}
      {["meta_report", "facebook_report", "google_report"].includes(
        node.type
      ) && (
        <>
          <ChoiceField>
            Reporting period
            <VisualSelect
              value={config.datePreset ?? "30"}
              onChange={e =>
                onChange({
                  datePreset: e.target.value as typeof config.datePreset,
                })
              }
            >
              {datePresets.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
              <option value="custom">Custom date range</option>
            </VisualSelect>
          </ChoiceField>
          {config.datePreset === "custom" && (
            <div className="wf-date-fields">
              <label>
                From
                <Input
                  type="date"
                  value={config.range?.since ?? ""}
                  onChange={e =>
                    onChange({
                      range: {
                        since: e.target.value,
                        until: config.range?.until || e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                To
                <Input
                  type="date"
                  value={config.range?.until ?? ""}
                  onChange={e =>
                    onChange({
                      range: {
                        since: config.range?.since || e.target.value,
                        until: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          )}
          <label className="wf-checkbox">
            <input
              type="checkbox"
              checked={!!config.previousPeriod}
              onChange={e => onChange({ previousPeriod: e.target.checked })}
            />
            Use the preceding period as a baseline
          </label>
          <small>
            Relative periods are resolved when the step runs. Advertising uses
            the account time zone; Facebook post reporting uses UTC.
          </small>
        </>
      )}
      {node.type === "wait" && (
        <label>
          Wait (minutes)
          <Input
            type="number"
            min={1}
            max={43200}
            value={config.waitMinutes ?? 60}
            onChange={e => onChange({ waitMinutes: Number(e.target.value) })}
          />
          <small>The run resumes automatically after this wait.</small>
        </label>
      )}
      {node.type === "review" && (
        <p className="wf-setting-help">
          The run pauses here. An owner, admin, or publisher can inspect the
          exact incoming results and approve or reject this step.
        </p>
      )}
      {node.type === "optimize_metric" && (
        <>
          <ChoiceField>
            Objective metric
            <VisualSelect
              value={config.metric ?? "roas"}
              onChange={e =>
                onChange({ metric: e.target.value as typeof config.metric })
              }
            >
              {[
                "roas",
                "spend",
                "clicks",
                "linkClicks",
                "impressions",
                "purchases",
                "purchaseValue",
                "leads",
                "registrations",
                "trials",
                "subscriptions",
                "page_post_engagements",
                "page_media_view",
              ].map(m => (
                <option key={m} value={m}>
                  {m.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}
                </option>
              ))}
            </VisualSelect>
          </ChoiceField>
          <ChoiceField>
            Target direction
            <VisualSelect
              value={config.goalDirection ?? "at_least"}
              onChange={e =>
                onChange({
                  goalDirection: e.target.value as "at_least" | "at_most",
                })
              }
            >
              <option value="at_least">At least</option>
              <option value="at_most">At most</option>
            </VisualSelect>
          </ChoiceField>
          <label>
            Target value
            <Input
              type="number"
              min={0}
              step="any"
              value={config.goal ?? ""}
              onChange={e =>
                onChange({
                  goal:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Minimum impressions
            <Input
              type="number"
              min={0}
              value={config.minimumImpressions ?? 1000}
              onChange={e =>
                onChange({ minimumImpressions: Number(e.target.value) })
              }
            />
            <small>Use 0 when the source does not report impressions.</small>
          </label>
          <label>
            Wait after period ends (hours)
            <Input
              type="number"
              min={0}
              max={8760}
              value={config.minimumAgeHours ?? 24}
              onChange={e =>
                onChange({ minimumAgeHours: Number(e.target.value) })
              }
            />
          </label>
          <p className="wf-setting-help">
            Outputs Retain, Propose test, or Insufficient evidence. A decision
            does not change campaigns or spending.
          </p>
        </>
      )}
    </>
  );
}

function GoogleWorkflowSettings({
  node,
  organizationId,
  onChange,
}: {
  node: WorkflowNode;
  organizationId: number;
  onChange: (value: Partial<WorkflowNode["config"]>) => void;
}) {
  const config = node.config;
  const inventory = trpc.googleAds.campaigns.inventory.useQuery({
    organizationId,
    connectionId: config.connectionId!,
    includeInactive: config.includeInactiveCampaigns ?? false,
  });
  return (
    <>
      <label className="wf-checkbox">
        <input
          type="checkbox"
          checked={config.includeInactiveCampaigns ?? false}
          onChange={e =>
            onChange({
              includeInactiveCampaigns: e.target.checked,
              campaignId: undefined,
            })
          }
        />
        Include inactive campaigns
      </label>
      <ChoiceField>
        Google campaign
        <VisualSelect
          value={config.campaignId ?? ""}
          onChange={e => onChange({ campaignId: e.target.value || undefined })}
        >
          <option value="">Whole account</option>
          {inventory.data?.campaigns.map(({ campaign }) => (
            <option key={campaign.id} value={String(campaign.id)}>
              {campaign.name} · {campaign.advertisingChannelType}
            </option>
          ))}
        </VisualSelect>
      </ChoiceField>
      {config.campaignId &&
        inventory.data &&
        !inventory.data.campaigns.some(
          c => String(c.campaign.id) === config.campaignId
        ) && (
          <p role="alert">
            The selected campaign is not in this account’s current list. Choose
            a campaign or the whole account.
          </p>
        )}
      {inventory.isLoading && <small>Loading Google campaigns…</small>}
      {inventory.error && <p role="alert">{inventory.error.message}</p>}
      {inventory.data?.limited && (
        <small>
          This list reached its retrieval limit; some campaigns may be
          unavailable.
        </small>
      )}
      {node.type === "google_report" && (
        <ChoiceField>
          Breakdown
          <VisualSelect
            value={config.googleDetail ?? "campaign"}
            onChange={e =>
              onChange({
                googleDetail: e.target
                  .value as WorkflowNode["config"]["googleDetail"],
              })
            }
          >
            <option value="campaign">Campaigns</option>
            <option value="ad_group">Ad groups</option>
            <option value="asset_group">Asset groups (Performance Max)</option>
            <option value="ad">Ads</option>
            <option value="device">Devices</option>
            <option value="country">Countries</option>
            <option value="hour">Hours</option>
          </VisualSelect>
        </ChoiceField>
      )}
      <small>
        {node.type === "google_inventory"
          ? "Choose a campaign to include its native ad groups, ads, or Performance Max asset groups and asset associations."
          : "Metrics retain Google’s attribution and account currency. Unsupported breakdowns are reported as unavailable."}{" "}
        This step reads account data and does not change delivery.
      </small>
    </>
  );
}
