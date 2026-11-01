// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceRecipients } from "./WorkspaceRecipients";
afterEach(cleanup);
const members = [
  { userId: 1, name: "Owner", email: "owner@example.test" },
  { userId: 2, name: "New teammate", email: "new@example.test" },
];
function Fixture({ recipients = members }) {
  const [selected, onChange] = useState([1, 99]);
  return (
    <WorkspaceRecipients
      recipients={recipients}
      selected={selected}
      onChange={onChange}
      onRefresh={() => {}}
    />
  );
}
it("searches all active workspace members, preserves selections, and removes departed members", () => {
  const { rerender } = render(<Fixture recipients={[members[0]]} />);
  expect(screen.getByRole("alert").textContent).toContain(
    "no longer available"
  );
  rerender(<Fixture />);
  fireEvent.change(screen.getByLabelText("Search recipients"), {
    target: { value: "new@" },
  });
  fireEvent.click(screen.getByText("Select matching members"));
  expect(screen.getByRole("checkbox")).toHaveProperty("checked", true);
  expect(screen.getByText(/3 selected/)).toBeTruthy();
  fireEvent.click(screen.getByText("Remove unavailable recipients"));
  expect(screen.getByText(/2 selected/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search recipients"), {
    target: { value: "" },
  });
  expect(
    screen
      .getAllByRole("checkbox")
      .every(el => (el as HTMLInputElement).checked)
  ).toBe(true);
});
