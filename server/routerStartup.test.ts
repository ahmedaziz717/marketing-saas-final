import { expect, it } from "vitest";
// Deliberately import the real root router, without mocking tRPC or child routers.
// Compilation and isolated domain-service tests do not construct this object.
import { appRouter } from "./routers";

it("constructs the root app router with the draft-authoring procedures", async () => {
  expect(
    appRouter._def.procedures["workflowAuthoring.applyDraft"]
  ).toBeDefined();
  expect(
    appRouter._def.procedures["workflowAuthoring.chatStatus"]
  ).toBeDefined();
  const caller = appRouter.createCaller({
    user: null,
    req: {},
    res: {},
  } as any);
  await expect(
    caller.workflowAuthoring.discover({ organizationId: 1 })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
