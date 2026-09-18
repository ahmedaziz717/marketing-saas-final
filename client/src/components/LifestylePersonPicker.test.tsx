// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  defaultCreativeSetup,
  type CreativeSetup,
} from "@shared/creativeBuilder";
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1 }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    creativeBuilder: {
      people: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
      savePerson: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));
import { LifestylePersonPicker } from "./LifestylePersonPicker";
function Harness() {
  const [setup, setSetup] = useState<CreativeSetup>({
    ...defaultCreativeSetup(),
    shot: "female",
  });
  return <LifestylePersonPicker setup={setup} onChange={setSetup} />;
}
afterEach(cleanup);
it("keeps the selected identity pinned when filters and pages change", () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox", { name: "Hair color" }), {
    target: { value: "brown" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Woman · Brown 1\b/ }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh options" }));
  expect(
    screen.queryByRole("button", { name: /Woman · Brown 1\b/ })
  ).toBeNull();
  expect(screen.getByRole("button", { name: /Woman · Brown 6/ })).toBeTruthy();
  expect(screen.getByText("Selected person · pinned")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Hair color" }), {
    target: { value: "blonde" },
  });
  expect(screen.getByText("Woman · Brown 1")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Woman · Blonde 1/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Let AI choose" }));
  expect(screen.queryByText("Selected person · pinned")).toBeNull();
});
it("requires a file and permission confirmation before uploading a real-person reference", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Upload reference" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Upload for approval",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.getByRole("checkbox")).toBeTruthy();
});
