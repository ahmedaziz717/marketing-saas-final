// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ArtStyleInfluenceControl } from "./ArtStyleInfluenceControl";
import { changeField } from "@/test/choiceControls";
afterEach(cleanup);
it("uses the shared choice control and explains honest prompt influence", () => {
  const change = vi.fn();
  render(<ArtStyleInfluenceControl onChange={change} />);
  changeField(
    screen.getByLabelText("Art Style Influence", { selector: "select" }),
    { target: { value: "strong" } }
  );
  expect(change).toHaveBeenCalledWith("strong");
  expect(screen.getByText(/not a guaranteed percentage/)).toBeTruthy();
});
it("does not allow an ordinary enhancement to silently change style", () => {
  const change = vi.fn();
  render(
    <ArtStyleInfluenceControl
      value="strong"
      onChange={change}
      preserveSourceStyle
    />
  );
  expect(screen.getByText(/Enhance preserves the source artwork/)).toBeTruthy();
  const select = screen.getByLabelText("Art Style Influence", {
    selector: "select",
  });
  expect(
    select.hasAttribute("disabled") ||
      select.getAttribute("aria-disabled") === "true"
  ).toBe(true);
});
