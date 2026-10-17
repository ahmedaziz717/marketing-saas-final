// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const cid = "00000000-0000-4000-8000-000000000099";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channels: {
      connections: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "00000000-0000-4000-8000-000000000099",
                name: "Connected account",
                channel: "meta_ads",
                status: "connected",
                details: { timezone: "America/Los_Angeles" },
              },
              {
                id: "social",
                name: "Organic Page",
                channel: "facebook",
                status: "connected",
                details: {},
              },
              {
                id: "old",
                name: "Disconnected account",
                channel: "meta_ads",
                status: "disconnected",
                details: {},
              },
            ],
          },
        }),
      },
    },
  },
}));
import { WorkflowPerformanceInput } from "./WorkflowPerformanceInput";
afterEach(cleanup);
it("asks for a connected ad account, carries preset and custom dates, and shows the account timezone", () => {
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <>
        <WorkflowPerformanceInput
          organizationId={1}
          value={value}
          onChange={setValue}
        />
        <output data-testid="value">{value}</output>
      </>
    );
  }
  render(<Harness />);
  expect(screen.queryByRole("option", { name: "Organic Page" })).toBeNull();
  expect(
    screen.queryByRole("option", { name: "Disconnected account" })
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Meta ad account"), {
    target: { value: cid },
  });
  expect(
    screen.getByText(/Preset dates use America\/Los_Angeles/)
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Date range"), {
    target: { value: "7" },
  });
  let selected = JSON.parse(screen.getByTestId("value").textContent!);
  expect(selected.connectionId).toBe(cid);
  expect(
    Date.parse(selected.range.until) - Date.parse(selected.range.since)
  ).toBe(6 * 86400000);
  fireEvent.change(screen.getByLabelText("Date range"), {
    target: { value: "custom" },
  });
  fireEvent.change(screen.getByLabelText("Date range start date"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.change(screen.getByLabelText("Date range end date"), {
    target: { value: "2026-09-30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply date range" }));
  selected = JSON.parse(screen.getByTestId("value").textContent!);
  expect(selected.range).toEqual({ since: "2026-09-01", until: "2026-09-30" });
});
