// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { generationModel } from "@shared/modelCatalog";
const routes = ["image-to-video", "reference-to-video", "video-extend"];
vi.mock("@/lib/trpc", () => ({
  trpc: {
    models: {
      catalog: {
        useQuery: () => ({
          data: ["image-to-video", "reference-to-video", "video-extend"].map(
            route => {
              const id = `higgsfield:bytedance/seedance-2.5/${route}`;
              return {
                ...generationModel(id)!,
                routeId: id,
                available: true,
                enabled: true,
              };
            }
          ),
          isSuccess: true,
        }),
      },
    },
  },
}));
import { ModelPicker } from "./ModelPicker";
afterEach(cleanup);
it.each([1, 2, 6, 10])(
  "retains and explains incompatible cards for %s images",
  images => {
    const change = vi.fn();
    render(
      <ModelPicker
        organizationId={3}
        kind="video"
        value={`higgsfield:bytedance/seedance-2.5/${routes[0]}`}
        onChange={change}
        inputState={{ images, hasVideo: false }}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /First \/ last frame/ })
    );
    const first = screen.getByRole("button", {
      name: /First \/ last frame.*1 start image/,
    });
    expect((first as HTMLButtonElement).disabled).toBe(images > 2);
    const extend = screen.getByRole("button", {
      name: /Extend an existing video.*Requires an existing source video/,
    });
    expect((extend as HTMLButtonElement).disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /Multiple reference images.*Up to 30/,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    fireEvent.click(extend);
    expect(change).not.toHaveBeenCalled();
  }
);
it("reacts to added/removed video without changing saved choice and allows empty discovery", () => {
  const change = vi.fn();
  const props = {
    organizationId: 3,
    kind: "video" as const,
    value: `higgsfield:bytedance/seedance-2.5/${routes[0]}`,
    onChange: change,
  };
  const { rerender } = render(
    <ModelPicker {...props} inputState={{ images: 0, hasVideo: false }} />
  );
  fireEvent.click(screen.getByRole("button", { name: /First \/ last frame/ }));
  expect(
    (
      screen.getByRole("button", {
        name: /Extend an existing video.*Existing video required/,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
  rerender(
    <ModelPicker {...props} inputState={{ images: 1, hasVideo: true }} />
  );
  expect(
    (
      screen.getByRole("button", {
        name: /First \/ last frame.*Does not accept a source video/,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  rerender(
    <ModelPicker {...props} inputState={{ images: 1, hasVideo: false }} />
  );
  expect(
    (
      screen.getByRole("button", {
        name: /First \/ last frame.*1 start image/,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
  expect(change).not.toHaveBeenCalled();
});
