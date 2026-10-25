// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { resolveMarketingCategory } from "@shared/catalogCategories";
import { ProductCategoryContext } from "./ProductCategoryContext";

const category = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Home",
  audience: "Families",
  useCases: "",
  vocabulary: "",
  cta: "",
  avoid: "",
};
const confirmed = (id: number, categoryId = category.id) => ({
  id,
  name: `Product ${id}`,
  marketingCategory: resolveMarketingCategory(
    { id, category: "source" },
    {
      categories: [{ ...category, id: categoryId }],
      mappings: [{ sourceId: null, sourceCategory: "source", categoryId }],
    }
  ),
});
const unmapped = { id: 1, name: "Product 1" };
function Selection({
  products,
}: {
  products: Parameters<typeof ProductCategoryContext>[0]["products"];
}) {
  const [handling, setHandling] = useState<"require_mapping" | "neutral">(
    "require_mapping"
  );
  return (
    <>
      <ProductCategoryContext
        products={products}
        handling={handling}
        onChange={setHandling}
      />
      <output aria-label="Request category handling">{handling}</output>
    </>
  );
}
afterEach(cleanup);
it.each([
  [
    "unmapped product replaced by confirmed product",
    [unmapped],
    [confirmed(2)],
  ],
  ["same product mapped in Catalog", [unmapped], [confirmed(1)]],
  [
    "mixed selection reduced to one category",
    [confirmed(1), confirmed(2, "10000000-0000-4000-8000-000000000002")],
    [confirmed(1)],
  ],
] as const)(
  "keeps neutral choice visible and reversible after %s",
  (_description, before, after) => {
    const view = render(<Selection products={[...before]} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Use neutral wording/ })
    );
    view.rerender(<Selection products={[...after]} />);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Use neutral wording/,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(screen.getByText(/Neutral wording is active/)).toBeTruthy();
    expect(
      screen.queryByText(/Confirmed category guidance controls/)
    ).toBeNull();
    expect(screen.getByLabelText("Request category handling").textContent).toBe(
      "neutral"
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Use neutral wording/ })
    );
    expect(screen.getByLabelText("Request category handling").textContent).toBe(
      "require_mapping"
    );
    expect(
      screen.getByText(/Confirmed category guidance controls/)
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: /Use neutral wording/ })
    ).toBeNull();
  }
);
