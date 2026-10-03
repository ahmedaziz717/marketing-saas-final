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
import {
  creativeSetupSchema,
  defaultCreativeSetup,
  type CreativeSetup,
} from "@shared/creativeBuilder";
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1 }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    creativeBuilder: {
      people: {
        useQuery: () => ({
          data: [
            {
              id: 42,
              name: "Favorite",
              gender: "female",
              age: "adult_unspecified",
              libraryId: "female-black-0",
              status: "approved",
            },
            {
              id: 43,
              name: "Pending model",
              gender: "female",
              age: "adult_unspecified",
              status: "pending",
            },
          ],
          refetch: vi.fn(),
        }),
      },
      savePerson: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));
import { LifestylePersonPicker } from "./LifestylePersonPicker";
function Harness({
  shot = "multiple",
  person,
}: {
  shot?: CreativeSetup["shot"];
  person?: CreativeSetup["person"];
}) {
  const [setup, setSetup] = useState<CreativeSetup>({
    ...defaultCreativeSetup(),
    shot,
    person,
  });
  return (
    <>
      <LifestylePersonPicker setup={setup} onChange={setSetup} />
      <output data-testid="setup">{JSON.stringify(setup)}</output>
    </>
  );
}
function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Browse 500 models" }));
  return within(screen.getByRole("dialog"));
}
function stored() {
  return JSON.parse(screen.getByTestId("setup").textContent!);
}
afterEach(cleanup);
it("preserves a legacy single model, allows more people, and applies only on confirmation", () => {
  render(
    <Harness shot="female" person={{ kind: "library", id: "female-black-0" }} />
  );
  const modal = openPicker();
  expect(
    modal
      .getByRole("button", { name: "Woman · Black 1" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    (modal.getByRole("combobox", { name: "Gender" }) as HTMLSelectElement)
      .disabled
  ).toBe(false);
  fireEvent.click(modal.getByRole("button", { name: "Woman · Black 2" }));
  expect(modal.getByText("2 / 4 selected")).toBeTruthy();
  expect(stored().people).toBeUndefined();
  expect(stored().person).toEqual({ kind: "library", id: "female-black-0" });
  fireEvent.change(modal.getByRole("combobox", { name: "Hair color" }), {
    target: { value: "blonde" },
  });
  expect(
    modal.getByRole("button", { name: "Remove Woman · Black 2 from selection" })
  ).toBeTruthy();
  fireEvent.click(modal.getByRole("button", { name: "Use 2 models" }));
  expect(stored().people).toEqual([
    { kind: "library", id: "female-black-0" },
    { kind: "library", id: "female-black-1" },
  ]);
  expect(stored().shot).toBe("multiple");
  expect(creativeSetupSchema.safeParse(stored()).success).toBe(true);
  openPicker();
  fireEvent.click(screen.getByRole("button", { name: "Woman · Blonde 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(stored().people).toHaveLength(2);
  expect(stored().people[0].id).toBe("female-black-0");
});
it("selects up to four across age and gender filters, disables a fifth, and restores capacity after removal", () => {
  render(<Harness shot="multiple" />);
  const modal = openPicker();
  for (let i = 1; i <= 4; i++)
    fireEvent.click(modal.getByRole("button", { name: `Woman · Black ${i}` }));
  expect(
    (
      modal.getByRole("button", {
        name: "Woman · Black 5",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(
    modal.getByRole("button", { name: "Remove Woman · Black 4 from selection" })
  );
  fireEvent.change(modal.getByRole("combobox", { name: "Age group" }), {
    target: { value: "child" },
  });
  fireEvent.change(modal.getByRole("combobox", { name: "Gender" }), {
    target: { value: "male" },
  });
  fireEvent.click(modal.getByRole("button", { name: "Boy · 126" }));
  fireEvent.click(modal.getByRole("button", { name: "Use 4 models" }));
  expect(stored().people).toHaveLength(4);
  expect(stored().people[3].id).toBe("boys-child-a-0");
  openPicker();
  expect(screen.getByText("4 / 4 selected")).toBeTruthy();
});
it("opens the full library for legacy kids setups and supports age filters, empty searches and reset", () => {
  render(<Harness shot="child" />);
  const modal = openPicker();
  expect(modal.getByText("500 matching models")).toBeTruthy();
  fireEvent.change(modal.getByRole("combobox", { name: "Age group" }), {
    target: { value: "child" },
  });
  expect(modal.getByText("100 matching models")).toBeTruthy();
  fireEvent.change(modal.getByRole("textbox", { name: "Search models" }), {
    target: { value: "does not exist" },
  });
  expect(modal.getByText("No models match these filters.")).toBeTruthy();
  fireEvent.click(modal.getAllByRole("button", { name: "Reset filters" })[0]);
  expect(modal.getByText("500 matching models")).toBeTruthy();
});
it("does not select the same identity twice through favorites, and requires upload consent", () => {
  render(<Harness shot="multiple" />);
  const modal = openPicker();
  fireEvent.click(modal.getByRole("button", { name: "Woman · Black 1" }));
  fireEvent.click(modal.getByRole("button", { name: "Saved people" }));
  expect(
    modal.getByRole("button", { name: "Favorite" }).getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    (modal.getByRole("button", { name: "Pending model" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  fireEvent.click(modal.getByRole("button", { name: "Upload reference" }));
  fireEvent.change(modal.getByRole("combobox", { name: "Model age group" }), {
    target: { value: "child" },
  });
  expect(
    modal.getByRole("checkbox", { name: /parent or guardian permission/ })
  ).toBeTruthy();
  expect(
    (
      modal.getByRole("button", {
        name: "Upload for approval",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
