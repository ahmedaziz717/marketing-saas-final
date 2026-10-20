// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CatalogFactsFields } from "./CatalogFactsFields";
import { specificationsFromLines } from "@shared/catalogFacts";
afterEach(cleanup);
it("edits specification bullets and shows one canonical tile for legacy stock values", () => {
  function Fixture() {
    const [facts, setFacts] = useState({
      specifications: "Power: 12 W",
      features: ["Dimmable"],
      availability: "https://schema.org/OutOfStock",
    });
    return (
      <>
        <CatalogFactsFields
          {...facts}
          onChange={patch => setFacts({ ...facts, ...patch })}
        />
        <output>
          {JSON.stringify(specificationsFromLines(facts.specifications))}
        </output>
      </>
    );
  }
  render(<Fixture />);
  expect(screen.getAllByRole("radio", { name: "Out of stock" })).toHaveLength(
    1
  );
  expect(
    screen
      .getByRole("radio", { name: "Out of stock" })
      .getAttribute("aria-checked")
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Add specification" }));
  fireEvent.change(screen.getByLabelText("Specification 2 name"), {
    target: { value: "Memory" },
  });
  fireEvent.change(screen.getByLabelText("Specification 2 value"), {
    target: { value: "64 GB DDR5" },
  });
  expect(screen.getByRole("status").textContent).toContain(
    '"Memory":"64 GB DDR5"'
  );
});
