// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DialogActionFooter, readableFormError } from "./DialogActionFooter";
afterEach(cleanup);
it("announces validation beside the actions and supports keyboard-accessible field navigation", () => {
  const go = vi.fn();
  render(
    <div>
      <div data-dialog-scroll>Form fields</div>
      <DialogActionFooter
        message="Choose a future start date."
        onGoToField={go}
      >
        <button>Review settings</button>
      </DialogActionFooter>
    </div>
  );
  expect(screen.getByRole("alert").closest("[data-dialog-scroll]")).toBeNull();
  expect(screen.getByRole("alert").closest("[data-dialog-actions]")).toBe(
    screen.getByText("Review settings").closest("[data-dialog-actions]")
  );
  fireEvent.click(screen.getByRole("button", { name: "Go to the field" }));
  expect(go).toHaveBeenCalledOnce();
});
it("shows readable field validation rather than serialized error objects", () => {
  expect(
    readableFormError(
      new Error(JSON.stringify([{ path: ["name"], message: "Enter a name" }]))
    )
  ).toBe("name: Enter a name");
});
