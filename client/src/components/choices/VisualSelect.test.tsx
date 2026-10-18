// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VisualSelect, ChoiceField } from "./VisualSelect";
afterEach(cleanup);

it("names a choice group without nesting interactive tiles inside a label", () => {
  render(
    <>
      <ChoiceField>
        Delivery mode
        <VisualSelect defaultValue="draft">
          <option value="draft">Save draft</option>
          <option value="scheduled">Schedule</option>
        </VisualSelect>
      </ChoiceField>
      <ChoiceField>
        Caption
        <input defaultValue="Keep this text" />
      </ChoiceField>
    </>
  );
  expect(
    screen.getByRole("radiogroup", { name: "Delivery mode" })
  ).toBeTruthy();
  expect(document.querySelector("label .choice-tile")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Caption" })).toBeTruthy();
});

it("changes the real form value from tiles, retains native event semantics and skips unavailable options with the keyboard", () => {
  const events: string[] = [];
  function Form() {
    const [value, setValue] = useState("a");
    return (
      <form aria-label="Setup">
        <label htmlFor="campaign">Campaign</label>
        <VisualSelect
          id="campaign"
          name="campaign"
          value={value}
          onChange={event => {
            events.push(
              `${event.currentTarget.name}:${event.currentTarget.value}`
            );
            setValue(event.target.value);
          }}
        >
          <option value="a">Launch</option>
          <option value="b" disabled title="Archived campaign">
            Old campaign
          </option>
          <option value="c">Summer</option>
        </VisualSelect>
      </form>
    );
  }
  render(<Form />);
  const group = screen.getByRole("radiogroup", { name: "Campaign" });
  const launch = within(group).getByRole("radio", { name: "Launch" });
  launch.focus();
  fireEvent.keyDown(launch, { key: "ArrowRight" });
  const summer = within(group).getByRole("radio", { name: "Summer" });
  expect(document.activeElement).toBe(summer);
  expect(summer.getAttribute("aria-checked")).toBe("true");
  expect(events).toEqual(["campaign:c"]);
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).get("campaign")
  ).toBe("c");
  fireEvent.click(within(group).getByRole("radio", { name: "Old campaign" }));
  expect(events).toHaveLength(1);
  expect(screen.getByText("Archived campaign")).toBeTruthy();
});

it("keeps selected choices visible during search and supports long lists and optgroups", () => {
  render(
    <VisualSelect aria-label="Apps" defaultValue="0">
      <optgroup label="Creative">
        {Array.from({ length: 30 }, (_, i) => (
          <option key={i} value={String(i)}>
            App {i}
          </option>
        ))}
      </optgroup>
    </VisualSelect>
  );
  expect(screen.getAllByRole("radio")).toHaveLength(8);
  fireEvent.click(
    screen.getByRole("button", { name: "Show more · 22 remaining" })
  );
  expect(screen.getAllByRole("radio")).toHaveLength(24);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search apps" }), {
    target: { value: "App 29" },
  });
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(
    screen.getByRole("radio", { name: "App 0" }).getAttribute("aria-checked")
  ).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: "App 29" }));
  expect(
    screen.getByRole("radio", { name: "App 29" }).getAttribute("aria-checked")
  ).toBe("true");
});

it("preserves multiple selection, selectedOptions and disabled groups", () => {
  const change = vi.fn();
  render(
    <form aria-label="Metrics">
      <VisualSelect
        aria-label="Breakdowns"
        name="breakdown"
        multiple
        defaultValue={["a"]}
        onChange={e =>
          change(Array.from(e.target.selectedOptions, o => o.value))
        }
      >
        <option value="a">Audience</option>
        <option value="b">Placement</option>
        <optgroup label="Unavailable" disabled>
          <option value="c">Country</option>
        </optgroup>
      </VisualSelect>
    </form>
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Placement" }));
  expect(change).toHaveBeenLastCalledWith(["a", "b"]);
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).getAll(
      "breakdown"
    )
  ).toEqual(["a", "b"]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Audience" }));
  expect(change).toHaveBeenLastCalledWith(["b"]);
  expect(
    (screen.getByRole("checkbox", { name: "Country" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});

it("focuses a visible tile on required validation and supports reset", () => {
  render(
    <form aria-label="Required setup">
      <VisualSelect
        aria-label="Account"
        name="account"
        required
        defaultValue=""
      >
        <option value="">Choose an account</option>
        <option value="a">Demo account</option>
      </VisualSelect>
    </form>
  );
  const form = screen.getByRole("form") as HTMLFormElement;
  expect(form.checkValidity()).toBe(false);
  expect(document.activeElement).toBe(
    screen.getByRole("radio", { name: "Demo account" })
  );
  fireEvent.click(screen.getByRole("radio", { name: "Demo account" }));
  expect(form.checkValidity()).toBe(true);
  fireEvent.reset(form);
  expect(
    screen
      .getByRole("radio", { name: "Demo account" })
      .getAttribute("aria-checked")
  ).toBe("false");
});

it("retains a missing saved value and resolves to an available choice only after selection", () => {
  render(
    <form aria-label="Saved setup">
      <VisualSelect
        aria-label="Saved campaign"
        name="campaign"
        defaultValue="gone"
      >
        <option value="a">Available campaign</option>
      </VisualSelect>
    </form>
  );
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).get("campaign")
  ).toBe("gone");
  expect(
    screen
      .getByRole("radio", { name: "Selected item unavailable" })
      .getAttribute("aria-checked")
  ).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: "Available campaign" }));
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).get("campaign")
  ).toBe("a");
});
