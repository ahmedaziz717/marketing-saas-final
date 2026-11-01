// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioAccountPicker } from "./StudioAccountPicker";

afterEach(cleanup);
it.each(["Meta Ads", "Google Ads"])(
  "uses the same account cards and permission state for %s",
  channelLabel => {
    const onChange = vi.fn();
    render(
      <StudioAccountPicker
        channelLabel={channelLabel}
        value="first"
        onChange={onChange}
        accounts={[
          {
            id: "first",
            name: "First account",
            accountId: "123",
            currency: "USD",
            timezone: "America/New_York",
          },
          {
            id: "second",
            name: "Second account",
            disabled: true,
            disabledReason: "Publishing permission required",
          },
        ]}
      />
    );
    expect(screen.getByLabelText(`${channelLabel} accounts`).className).toBe(
      "cfg-card-grid"
    );
    expect(screen.getByText("123 · USD · America/New_York")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Select First account" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      (
        screen.getByRole("button", {
          name: "Select Second account",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Select First account" })
    );
    expect(onChange).toHaveBeenCalledWith("first");
    expect(screen.getByText("Publishing permission required")).toBeTruthy();
  }
);
