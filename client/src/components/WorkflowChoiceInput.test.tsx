// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { appFieldSchema, type AppField } from "@shared/workflowInputs";
import { WorkflowChoiceInput } from "./WorkflowChoiceInput";
import { StudioCategories } from "./configurator/StudioCategories";
import { copyTaxonomy } from "@shared/copyTaxonomy";
afterEach(cleanup);

it("reuses Activation Studio artwork for a workflow's curated copy directions", () => {
  render(
    <WorkflowChoiceInput
      field={appFieldSchema.parse({
        kind: "choice",
        source: "curated",
        studio: { category: "Messaging style" },
        options: copyTaxonomy.messaging_style.values.map(v => ({
          id: v.id,
          label: v.label,
          direction: v.description,
        })),
      })}
      title="Our writing preferences"
      value="direct"
      onChange={vi.fn()}
    />
  );
  expect(
    screen
      .getByRole("img", { name: "Direct visual inspiration" })
      .getAttribute("src")
  ).toBe("/studio-art/spotlight.webp");
  expect(
    screen
      .getByRole("button", { name: "Select Direct" })
      .getAttribute("aria-pressed")
  ).toBe("true");
});

function Harness({ field }: { field: AppField }) {
  const [value, setValue] = useState(field.defaultValue);
  return (
    <>
      <WorkflowChoiceInput
        field={field}
        title="Theme"
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

it("keeps theme IDs, images and selections while filtering a curated multi-select", () => {
  render(
    <Harness
      field={appFieldSchema.parse({
        kind: "theme",
        source: "curated",
        multiple: true,
        maxSelections: 2,
        options: [
          { id: "spotlight", label: "Spotlight" },
          { id: "launch", label: "Launch" },
          { id: "dark-cinematic", label: "Cinematic" },
        ],
      })}
    />
  );
  expect(
    screen.queryByRole("button", { name: "Select Flash Sale" })
  ).toBeNull();
  expect(
    screen
      .getByRole("img", { name: "Product Spotlight visual inspiration" })
      .getAttribute("src")
  ).toBe("/studio-art/spotlight.webp");
  fireEvent.click(screen.getByRole("button", { name: "Select Spotlight" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search theme choices" }),
    { target: { value: "Launch" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Select Launch" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear theme search" }));
  expect(screen.getByTestId("value").textContent).toBe(
    '["spotlight","launch"]'
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Select Cinematic",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Select Spotlight" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Cinematic" }));
  expect(screen.getByTestId("value").textContent).toBe(
    '["launch","dark-cinematic"]'
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.getByTestId("value").textContent).toBe("[]");
});

it("preserves a locked default and never introduces an unavailable system choice", () => {
  const change = vi.fn();
  render(
    <WorkflowChoiceInput
      field={appFieldSchema.parse({
        kind: "art_style",
        source: "curated",
        locked: true,
        options: [{ id: "realistic", label: "Photographic" }],
      })}
      title="Art style"
      value="realistic"
      onChange={change}
    />
  );
  const choice = screen.getByRole("button", { name: "Select Photographic" });
  expect(choice.getAttribute("aria-pressed")).toBe("true");
  expect((choice as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(choice);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Select Cinematic" })).toBeNull();
});

it("uses the visual size choice without changing its saved aspect-ratio value", () => {
  const change = vi.fn();
  render(
    <WorkflowChoiceInput
      field={appFieldSchema.parse({ kind: "size" })}
      title="Format"
      value="1:1"
      onChange={change}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Select Portrait · 4:5 · 1080 × 1350" })
  );
  expect(change).toHaveBeenCalledWith("4:5");
  expect(
    screen.getByRole("img", {
      name: "Portrait · 4:5 · 1080 × 1350 illustration",
    })
  ).toBeTruthy();
});

it("keeps disabled category behavior and accessible labels alongside decorative icons", () => {
  const change = vi.fn();
  render(
    <StudioCategories
      items={[
        { id: "theme", title: "Theme" },
        {
          id: "assets",
          title: "Approved assets",
          disabled: true,
          reason: "Choose a destination",
        },
      ]}
      current="theme"
      onSelect={change}
    />
  );
  const active = screen.getByRole("button", { name: "Theme" });
  expect(active.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  expect(active.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Approved assets" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(active);
  expect(change).toHaveBeenCalledWith("theme");
});
