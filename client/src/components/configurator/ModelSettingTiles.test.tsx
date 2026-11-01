// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModelSettings } from "../ModelPicker";
import { ModelSettingTiles } from "./ModelSettingTiles";
vi.mock("@/lib/trpc", () => ({
  trpc: { models: { catalog: { useQuery: () => ({ data: [] }) } } },
}));
afterEach(cleanup);
it("renders only supported quality tiles and changes the exact selected option", () => {
  const change = vi.fn();
  const view = render(
    <ModelSettings
      presentation="tiles"
      modelId="openai:gpt-image-2.5-sunburst"
      options={{ quality: "max" }}
      onChange={change}
    />
  );
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Select Maximum" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Select High" }));
  expect(change).toHaveBeenCalledWith({ quality: "high" });
  view.rerender(
    <ModelSettings
      presentation="tiles"
      modelId="openai:gpt-image-1"
      options={{ quality: "high" }}
      onChange={change}
    />
  );
  expect(screen.queryByRole("button", { name: "Select Maximum" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Select Extra high" })
  ).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Select High" })
      .getAttribute("aria-pressed")
  ).toBe("true");
});
it("preserves numeric and boolean types and keeps unrestricted numbers editable", () => {
  const change = vi.fn();
  render(
    <ModelSettingTiles
      options={{ seed: 42 }}
      values={{ duration: 5, generate_audio: false, seed: 42 }}
      onChange={change}
      fields={[
        ["duration", { type: "integer", enum: [5, 10], default: 5 }],
        ["generate_audio", { type: "boolean", default: false }],
        ["seed", { type: "integer", minimum: 0, maximum: 2147483647 }],
      ]}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Select 10 seconds" }));
  expect(change).toHaveBeenLastCalledWith({ seed: 42, duration: 10 });
  fireEvent.click(screen.getByRole("button", { name: "Select On" }));
  expect(change).toHaveBeenLastCalledWith({ seed: 42, generate_audio: true });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Seed" }), {
    target: { value: "123" },
  });
  expect(change).toHaveBeenLastCalledWith({ seed: 123 });
});
it("disables setting tiles during generation", () => {
  render(
    <ModelSettings
      presentation="tiles"
      modelId="openai:gpt-image-1"
      onChange={vi.fn()}
      disabled
    />
  );
  expect(
    (screen.getByRole("button", { name: "Select High" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});
