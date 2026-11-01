// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StudioFonts } from "./StudioFonts";
afterEach(cleanup);
function Fixture() {
  const [value, setValue] = useState({ fontFamily: "", preserveFont: false });
  return (
    <>
      <StudioFonts
        font={value.fontFamily}
        preserve={value.preserveFont}
        brandFonts={[]}
        search=""
        onChange={patch => setValue(v => ({ ...v, ...patch }))}
      />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}
it("keeps preserve off by default, saves the selected family with the lock, and clears the lock for Automatic", () => {
  render(<Fixture />);
  const checkbox = screen.getByRole("checkbox", {
    name: "Preserve selected font",
  }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  expect(checkbox.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Select Bungee" }));
  fireEvent.click(checkbox);
  expect(screen.getByRole("status").textContent).toBe(
    '{"fontFamily":"Bungee","preserveFont":true}'
  );
  fireEvent.click(screen.getByRole("button", { name: "Select Rubik" }));
  expect(screen.getByRole("status").textContent).toBe(
    '{"fontFamily":"Rubik","preserveFont":true}'
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Select Automatic typography" })
  );
  expect(checkbox.checked).toBe(false);
});
