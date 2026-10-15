// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { CopyDirection } from "@shared/copyDirection";
import { CopyDirectionTiles } from "./CopyDirectionTiles";
afterEach(cleanup);
function Harness() {
  const [value, setValue] = useState<CopyDirection>({});
  return (
    <>
      <CopyDirectionTiles value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}
const current = () => JSON.parse(screen.getByTestId("value").textContent!);
it("selects multiple styles, switches dimensions without losing choices, and replaces a single-choice value", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Select Playful" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Educational" }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "Copy attributes" })).getByRole(
      "button",
      { name: "Copy length" }
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Select 6–15 words" }));
  fireEvent.click(screen.getByRole("button", { name: "Select 31–60 words" }));
  expect(current()).toEqual({
    messaging_style: ["playful", "educational"],
    copy_length: ["long"],
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Messaging style: Playful" })
  );
  expect(current().messaging_style).toEqual(["educational"]);
});
it("keeps selections while searching and offers contradictory None values as replacements", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Select Playful" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search messaging style" }),
    { target: { value: "question" } }
  );
  expect(screen.queryByRole("button", { name: "Select Playful" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Select Question led" })
  ).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("group", { name: "Copy attributes" })).getByRole(
      "button",
      { name: "Offer" }
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Select Free trial" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Select No explicit offer" })
  );
  expect(current().offer).toEqual(["no_explicit_offer"]);
  expect(current().messaging_style).toEqual(["playful"]);
});
