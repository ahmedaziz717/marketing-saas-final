import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { channelInput } from "@/components/ChannelConnections";
import { rangeSchema, type DateRange } from "@shared/channels";
import { datePresets, presetRange, type DatePreset } from "@shared/reportDates";

export function DateRangeFilter({
  value,
  onChange,
  allowAll = false,
  label = "Date range",
  ariaPrefix = "Date range",
  timezone = "UTC",
}: {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  allowAll?: boolean;
  label?: string;
  ariaPrefix?: string;
  timezone?: string;
}) {
  const [period, setPeriod] = useState(value ? "custom" : "all");
  const [draft, setDraft] = useState(
    value ?? presetRange("30", Date.now(), timezone)
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (value) setDraft(value);
    setPeriod(current => {
      if (!value) return "all";
      if (datePresets.some(([key]) => key === current)) {
        const expected = presetRange(
          current as DatePreset,
          Date.now(),
          timezone
        );
        if (expected.since === value.since && expected.until === value.until)
          return current;
      }
      const match = datePresets.find(([key]) => {
        const expected = presetRange(key, Date.now(), timezone);
        return expected.since === value.since && expected.until === value.until;
      });
      return match?.[0] ?? "custom";
    });
  }, [value?.since, value?.until, timezone]);
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <label className="text-sm">
        {label}
        <select
          aria-label={label}
          className={channelInput + " mt-1 block"}
          value={period}
          onChange={event => {
            const next = event.target.value;
            setPeriod(next);
            setError("");
            if (next === "all") onChange(undefined);
            else if (next !== "custom") {
              const range = presetRange(
                next as DatePreset,
                Date.now(),
                timezone
              );
              setDraft(range);
              onChange(range);
            }
          }}
        >
          {datePresets.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
          {allowAll && <option value="all">All dates</option>}
          <option value="custom">Custom date range</option>
        </select>
      </label>
      {period === "custom" && (
        <>
          <label className="text-sm">
            Start date
            <input
              aria-label={`${ariaPrefix} start date`}
              type="date"
              className={channelInput + " mt-1 block"}
              value={draft.since}
              onChange={e => setDraft({ ...draft, since: e.target.value })}
            />
          </label>
          <label className="text-sm">
            End date
            <input
              aria-label={`${ariaPrefix} end date`}
              type="date"
              className={channelInput + " mt-1 block"}
              value={draft.until}
              onChange={e => setDraft({ ...draft, until: e.target.value })}
            />
          </label>
          <Button
            onClick={() => {
              const parsed = rangeSchema.safeParse(draft);
              if (!parsed.success) {
                setError(
                  "Choose valid start and end dates in order, up to one year (366 days)."
                );
                return;
              }
              setError("");
              onChange(parsed.data);
            }}
          >
            Apply date range
          </Button>
        </>
      )}
      <p className="w-full text-xs text-muted-foreground">
        Preset dates use {timezone}. Start and end dates are inclusive.
      </p>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
