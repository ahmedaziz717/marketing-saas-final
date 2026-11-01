// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioPeople } from "./StudioPeople";
import { LIFESTYLE_PEOPLE } from "@shared/lifestylePeople";
import type { PersonReference } from "@shared/creativeBuilder";
vi.mock("@/lib/trpc", () => ({
  trpc: { creativeBuilder: { people: { useQuery: () => ({ data: [] }) } } },
}));
vi.mock("@/components/LifestylePersonPicker", () => ({
  PersonPortrait: ({ person }: any) => <img alt={person.name} />,
}));
vi.mock("wouter", () => ({
  Link: ({ children }: any) => <span>{children}</span>,
}));
afterEach(cleanup);
it("keeps four selections across gender filters and allows replacing one", () => {
  function Harness() {
    const [selected, setSelected] = useState<PersonReference[]>([]);
    return (
      <StudioPeople
        organizationId={1}
        selected={selected}
        onChange={setSelected}
      />
    );
  }
  render(<Harness />);
  const females = LIFESTYLE_PEOPLE.filter(p => p.gender === "female").slice(
    0,
    4
  );
  for (const p of females)
    fireEvent.click(screen.getByRole("button", { name: "Select " + p.name }));
  expect(screen.getByText("4 / 4 selected")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Male" }));
  const male = screen.getAllByRole("button", {
    name: /^Select /,
  })[0] as HTMLButtonElement;
  expect(male.disabled).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Remove " + females[0].name })
  );
  expect(male.disabled).toBe(false);
  fireEvent.click(male);
  expect(screen.getByText("4 / 4 selected")).toBeTruthy();
});
it("combines age, hair and search filters without inventing attributes", () => {
  render(<StudioPeople organizationId={1} selected={[]} onChange={vi.fn()} />);
  const person = LIFESTYLE_PEOPLE.find(p => p.gender === "female")!;
  fireEvent.click(screen.getByRole("tab", { name: /^Age group/ }));
  changeField(screen.getByRole("radiogroup", { name: "Age group" }), {
    target: { value: person.age },
  });
  fireEvent.click(screen.getByRole("tab", { name: /^Hair color/ }));
  changeField(screen.getByRole("radiogroup", { name: "Hair color" }), {
    target: { value: person.hair },
  });
  changeField(screen.getByLabelText("Search people"), {
    target: { value: person.name },
  });
  expect(
    screen.getAllByRole("button", { name: /^Select / }).length
  ).toBeLessThan(24);
  expect(
    screen.getByRole("button", { name: "Select " + person.name })
  ).toBeTruthy();
});

it("shows each filter's selection in its tab and supports keyboard navigation and resetting", async () => {
  render(<StudioPeople organizationId={1} selected={[]} onChange={vi.fn()} />);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  fireEvent.click(screen.getByRole("radio", { name: "Male" }));
  expect(screen.getByRole("tab", { name: "Gender Male" })).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: /^Hair color/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Blonde" }));
  const hair = screen.getByRole("tab", { name: "Hair color Blonde" });
  hair.focus();
  fireEvent.keyDown(hair, { key: "Home" });
  await waitFor(() =>
    expect(
      screen
        .getByRole("tab", { name: /^Collection/ })
        .getAttribute("aria-selected")
    ).toBe("true")
  );
  expect(screen.queryByRole("radiogroup", { name: "Hair color" })).toBeNull();
  expect(screen.getByRole("tab", { name: "Hair color Blonde" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "My saved people" }));
  expect(
    screen.getByRole("tab", { name: "Collection My saved people" })
  ).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Reset filters" })[0]);
  expect(
    screen.getByRole("tab", { name: "Collection Studio models" })
  ).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Gender Female" })).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "Hair color All hair colors" })
  ).toBeTruthy();
});
