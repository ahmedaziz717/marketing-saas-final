// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { defaultInsightConfig, TODAY_REPORT_NOTE } from "@shared/insights";
import { InsightDateControls } from "./InsightDateControls";
afterEach(cleanup);
it("offers Today without changing saved include-today or comparison preferences", () => {
  const config = defaultInsightConfig("America/Los_Angeles");
  const onChange = vi.fn();
  const { rerender } = render(
    <InsightDateControls config={config} label="Report" onChange={onChange} />
  );
  fireEvent.change(screen.getByLabelText("Report period"), {
    target: { value: "today" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ period: "today" });
  rerender(
    <InsightDateControls
      config={{ ...config, period: "today" }}
      label="Report"
      onChange={onChange}
    />
  );
  expect(screen.getByText(TODAY_REPORT_NOTE)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Report period"), {
    target: { value: "7" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ period: "7" });
  expect(config.includeToday).toBe(false);
});
