// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { generationModel, DEFAULT_VIDEO_MODEL } from "@shared/modelCatalog";
import { appFieldSchema } from "@shared/workflowInputs";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    models: {
      catalog: {
        useQuery: () => ({
          data: [
            DEFAULT_VIDEO_MODEL,
            "higgsfield:bytedance/seedance-2.5/image-to-video",
          ].map(id => ({ ...generationModel(id), available: true })),
        }),
      },
      textCatalog: { useQuery: () => ({ data: [] }) },
    },
  },
}));
vi.mock("./ModelPicker", () => ({ ModelSettings: () => null }));
import { WorkflowModelInput } from "./WorkflowModelField";
afterEach(cleanup);
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
    screen.getByText(/Multiple reference images · up to 30 · video optional/, {
      selector: "option",
    })
  ).toBeTruthy();
  expect(
    screen.getByText(/First \/ last frame · 1–2 images/, { selector: "option" })
  ).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});
