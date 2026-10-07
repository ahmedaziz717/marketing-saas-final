import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "./ui/input";
import { datePresets } from "@shared/reportDates";
import { dateInZone, localScheduleToUtc } from "@shared/channels";
import { workflowNodes, type WorkflowNode } from "@shared/creativeWorkflow";

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
  const connections = trpc.channels.connections.useQuery({ organizationId });
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
      c => c.status === "connected" && c.channel === meta.channel
    ) ?? [];
  const timezone =
    config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      {meta.channel && (
        <>
          <label>
            {meta.channel === "facebook"
              ? "Connected Facebook Page"
              : "Connected Meta ad account"}
            <select
              value={config.connectionId ?? ""}
              onChange={e =>
                onChange({
                  connectionId: e.target.value || undefined,
                  campaignId: undefined,
                  adSetId: undefined,
                  adId: undefined,
                })
              }
            >
              <option value="">Choose a connected account</option>
              {choices.map(c => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!connections.isLoading && !choices.length && (
            <Link href="/app/settings/integrations" className="wf-setting-help">
              Connect{" "}
              {meta.channel === "facebook" ? "a Facebook Page" : "Meta Ads"} in
              Integrations
            </Link>
          )}
          {connections.error && <p role="alert">{connections.error.message}</p>}
        </>
      )}
      {["meta_ad", "meta_activate", "meta_report"].includes(node.type) &&
        config.connectionId && (
          <>
            <label>
              Show campaigns and ads
              <select
                value={status}
                onChange={e => setStatus(e.target.value as typeof status)}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="all">All statuses</option>
              </select>
            </label>
            <label>
              Campaign
              <select
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
              </select>
            </label>
            {node.type === "meta_ad" && (
              <label>
                Existing ad set
                <select
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
                </select>
              </label>
            )}
            {node.type === "meta_activate" && (
              <label>
                Existing ad
                <select
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
                </select>
              </label>
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
          <label>
            Delivery time
            <select
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
            </select>
          </label>
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
      {["meta_report", "facebook_report"].includes(node.type) && (
        <>
          <label>
            Reporting period
            <select
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
            </select>
          </label>
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
            Relative periods are resolved when the step runs. Meta Ads uses the
            account time zone; Facebook post reporting uses UTC.
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
          <label>
            Objective metric
            <select
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
            </select>
          </label>
          <label>
            Target direction
            <select
              value={config.goalDirection ?? "at_least"}
              onChange={e =>
                onChange({
                  goalDirection: e.target.value as "at_least" | "at_most",
                })
              }
            >
              <option value="at_least">At least</option>
              <option value="at_most">At most</option>
            </select>
          </label>
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
