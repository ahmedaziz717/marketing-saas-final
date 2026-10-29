// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { generationModel, DEFAULT_VIDEO_MODEL } from "@shared/modelCatalog";
import { appFieldSchema } from "@shared/workflowInputs";
const routing = vi.hoisted(() => ({ override: "" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    models: {
      catalog: {
        useQuery: () => ({
          data: [
            DEFAULT_VIDEO_MODEL,
            "higgsfield:bytedance/seedance-2.5/image-to-video",
            "higgsfield:bytedance/seedance-2.5/video-extend",
          ].map(id => ({
            ...generationModel(id),
            routeId: routing.override || id,
            available: true,
          })),
        }),
      },
      textCatalog: { useQuery: () => ({ data: [] }) },
    },
  },
}));
vi.mock("./ModelPicker", () => ({ ModelSettings: () => null }));
import { WorkflowModelInput } from "./WorkflowModelField";
afterEach(() => {
  cleanup();
  routing.override = "";
});
it("shows shared roles in an existing App model field without changing its saved value", () => {
  const onChange = vi.fn();
  const field = appFieldSchema.parse({
    kind: "model",
    modelKind: "video",
    allowedModelIds: [
      DEFAULT_VIDEO_MODEL,
      "higgsfield:bytedance/seedance-2.5/image-to-video",
    ],
  });
  render(
    <WorkflowModelInput
      field={field}
      title="Video model"
      value={DEFAULT_VIDEO_MODEL}
      onChange={onChange}
      organizationId={3}
    />
  );
  expect(
    screen.getByText(/Multiple reference images/, {
      selector: "option",
    })
  ).toBeTruthy();
  expect(
    screen.getByText(/First \/ last frame/, { selector: "option" })
  ).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

it.each([1, 2, 6, 10])(
  "keeps incompatible choices visible with readable reasons for %s selected images",
  images => {
    const field = appFieldSchema.parse({
      kind: "model",
      modelKind: "video",
      allowedModelIds: [
        DEFAULT_VIDEO_MODEL,
        "higgsfield:bytedance/seedance-2.5/image-to-video",
      ],
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <WorkflowModelInput
        field={field}
        title="Video model"
        value="higgsfield:bytedance/seedance-2.5/image-to-video"
        onChange={onChange}
        organizationId={3}
        inputStates={[{ images, hasVideo: false }]}
      />
    );
    const first = screen.getByText(/First \/ last frame/, {
      selector: "option",
    }) as HTMLOptionElement;
    expect(first.disabled).toBe(images > 2);
    expect(
      (
        screen.getByText(/Multiple reference images/, {
          selector: "option",
        }) as HTMLOptionElement
      ).disabled
    ).toBe(false);
    if (images > 2)
      expect(screen.getByText(new RegExp(`${images} selected`))).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    rerender(
      <WorkflowModelInput
        field={field}
        title="Video model"
        value="higgsfield:bytedance/seedance-2.5/image-to-video"
        onChange={onChange}
        organizationId={3}
        inputStates={[{ images: 1, hasVideo: false }]}
      />
    );
    expect(
      (
        screen.getByText(/First \/ last frame/, {
          selector: "option",
        }) as HTMLOptionElement
      ).disabled
    ).toBe(false);
    rerender(
      <WorkflowModelInput
        field={field}
        title="Video model"
        value="higgsfield:bytedance/seedance-2.5/image-to-video"
        onChange={onChange}
        organizationId={3}
        inputStates={[{ images: 1, hasVideo: true }]}
      />
    );
    expect(
      (
        screen.getByText(/First \/ last frame/, {
          selector: "option",
        }) as HTMLOptionElement
      ).disabled
    ).toBe(true);
    expect(screen.getByText(/Does not accept a source video/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  }
);
it("does not block authoring from unknown bindings or change a saved legacy value", () => {
  const field = appFieldSchema.parse({
    kind: "model",
    modelKind: "video",
    allowedModelIds: [
      DEFAULT_VIDEO_MODEL,
      "higgsfield:bytedance/seedance-2.5/image-to-video",
    ],
  });
  const onChange = vi.fn();
  render(
    <WorkflowModelInput
      field={field}
      title="Video model"
      value="legacy:saved-model"
      onChange={onChange}
      organizationId={3}
      inputStates={[{ images: null, hasVideo: null }]}
    />
  );
  expect(
    (
      screen.getByText(/First \/ last frame/, {
        selector: "option",
      }) as HTMLOptionElement
    ).disabled
  ).toBe(false);
  expect(screen.getByRole("alert").textContent).toMatch(
    /selected model is unavailable/
  );
  expect(onChange).not.toHaveBeenCalled();
});

it("requires a source clip only once seeds are chosen, and responds to adding/removing it", () => {
  const extend = "higgsfield:bytedance/seedance-2.5/video-extend";
  const field = appFieldSchema.parse({
    kind: "model",
    modelKind: "video",
    allowedModelIds: [DEFAULT_VIDEO_MODEL, extend],
  });
  const onChange = vi.fn();
  const props = {
    field,
    title: "Video model",
    value: extend,
    onChange,
    organizationId: 3,
  };
  const { rerender } = render(
    <WorkflowModelInput
      {...props}
      inputStates={[{ images: 0, hasVideo: false }]}
    />
  );
  const option = () =>
    screen.getByText(/Extend an existing video/, {
      selector: "option",
    }) as HTMLOptionElement;
  expect(option().disabled).toBe(false);
  rerender(
    <WorkflowModelInput
      {...props}
      inputStates={[{ images: 1, hasVideo: false }]}
    />
  );
  expect(option().disabled).toBe(true);
  expect(screen.getByText(/Requires an existing source video/)).toBeTruthy();
  rerender(
    <WorkflowModelInput
      {...props}
      inputStates={[{ images: 1, hasVideo: true }]}
    />
  );
  expect(option().disabled).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

it("shows actual routed input requirements while retaining the saved choice identity", () => {
  routing.override = "higgsfield:bytedance/seedance-2.5/image-to-video";
  const field = appFieldSchema.parse({
    kind: "model",
    modelKind: "video",
    allowedModelIds: [DEFAULT_VIDEO_MODEL],
  });
  render(
    <WorkflowModelInput
      field={field}
      title="Video model"
      value={DEFAULT_VIDEO_MODEL}
      onChange={vi.fn()}
      organizationId={3}
      inputStates={[{ images: 6, hasVideo: false }]}
    />
  );
  expect(
    screen.getByText(/Multiple reference images/, { selector: "option" })
  ).toHaveProperty("value", DEFAULT_VIDEO_MODEL);
  expect(screen.getByText("1 start image · optional end image")).toBeTruthy();
  expect(screen.getByText(/Accepts up to 2 images; 6 selected/)).toBeTruthy();
});
