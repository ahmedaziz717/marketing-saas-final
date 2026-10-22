import { useEffect, useState } from "react";
import { reportPeriods, type InsightConfig } from "@shared/insights";
export type InsightDates = Pick<
  InsightConfig,
  "period" | "rollingDays" | "customRange" | "compare" | "includeToday"
>;
export function InsightDateControls({
  config,
  disabled,
  label,
  onChange,
}: {
  config: InsightDates;
  disabled?: boolean;
  label: string;
  onChange: (patch: Partial<InsightDates>) => void;
}) {
  const [period, setPeriod] = useState(config.period),
    [days, setDays] = useState(config.rollingDays ?? 30);
  const [since, setSince] = useState(config.customRange.since),
    [until, setUntil] = useState(config.customRange.until);
  useEffect(() => {
    setPeriod(config.period);
    setDays(config.rollingDays ?? 30);
    setSince(config.customRange.since);
    setUntil(config.customRange.until);
  }, [
    config.period,
    config.rollingDays,
    config.customRange.since,
    config.customRange.until,
  ]);
  return (
    <div className="insight-quick-dates">
      <label>
        {label}
        <select
          aria-label={`${label} period`}
          disabled={disabled}
          value={period}
          onChange={e => {
            const period = e.target.value as InsightConfig["period"];
            setPeriod(period);
            if (period !== "custom" && period !== "days") onChange({ period });
          }}
        >
          {reportPeriods.map(([value, title]) => (
            <option value={value} key={value}>
              {title}
            </option>
          ))}
        </select>
      </label>
      {period === "custom" && (
        <>
          <label>
            From
            <input
              type="date"
              disabled={disabled}
              value={since}
              onChange={e => setSince(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              disabled={disabled}
              value={until}
              onChange={e => setUntil(e.target.value)}
            />
          </label>
          <button
            disabled={disabled || !since || !until || since > until}
            onClick={() => {
              onChange({ period: "custom", customRange: { since, until } });
            }}
          >
            Apply dates
          </button>
        </>
      )}
      {period === "days" && (
        <>
          <label>
            Days
            <input
              type="number"
              min={1}
              max={366}
              disabled={disabled}
              value={days}
              onChange={e => setDays(Number(e.target.value))}
            />
          </label>
          <button
            disabled={
              disabled || !Number.isInteger(days) || days < 1 || days > 366
            }
            onClick={() => onChange({ period: "days", rollingDays: days })}
          >
            Apply days
          </button>
        </>
      )}
      <label>
        <input
          type="checkbox"
          disabled={disabled}
          checked={config.compare}
          onChange={e => onChange({ compare: e.target.checked })}
        />
        Compare previous period
      </label>
    </div>
  );
}
