import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AssetWorkflowActions } from "../../client/src/components/AssetWorkflowActions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../client/src/components/ui/dialog";
import type { AssetState } from "../../shared/assetLibrary";
import type { AssetSurface } from "../../shared/assetWorkflow";
const query = new URLSearchParams(
  (window as any).__fixtureQuery ?? location.search
);
const role = query.get("role") ?? "owner";
const canCreate = ["owner", "admin", "creator"].includes(role);
const canReview = ["owner", "admin", "reviewer"].includes(role);
const initialState: AssetState =
  query.get("state") === "needs_review" ? "needs_review" : "draft";
function Fixture() {
  const [state, setState] = useState<AssetState>(initialState);
  const [surface, setSurface] = useState<AssetSurface>(
    canCreate && initialState === "draft" ? "studio" : "library"
  );
  const [note, setNote] = useState("");
  return (
    <Dialog open>
      <DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>Bracelet creative - Square</DialogTitle>
          <DialogDescription>
            Studio drafts are submitted to Asset Library for approval. Nothing
            is published by this action.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <div
              className="grid min-h-52 place-items-center rounded-xl bg-muted/50 p-4"
              style={{ aspectRatio: "1", maxHeight: "50vh" }}
            >
              Asset preview
            </div>
            <h2 className="mt-4">Gold Luxury starts here</h2>
            <p className="mt-2 text-sm">
              Discover the details that make this moment stand out.
            </p>
          </section>
          <section
            className="min-w-0 space-y-4"
            aria-label="Asset review actions"
          >
            <p data-current-state={state} data-surface={surface}>
              {surface} / {state}
            </p>
            <AssetWorkflowActions
              surface={surface}
              state={state}
              role={role}
              busy={false}
              note={note}
              onNoteChange={setNote}
              onSubmit={() => {
                setState("needs_review");
                setSurface("library");
              }}
              onApproveAndAdd={() => {
                setState("approved");
                setSurface("library");
              }}
              onReview={setState}
              onComment={() => undefined}
              onRevise={() => setSurface("studio")}
              onViewSubmission={() => setSurface("library")}
            />
            <div className="border-t pt-4">
              <h3>Review history</h3>
              <p>Submitted versions keep their history.</p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
const requireThat = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const findButton = (name: string) =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'section[aria-label="Asset review actions"] button'
    )
  ).find(button => button.textContent?.trim() === name);
function checkLayout() {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const panel = document.querySelector<HTMLElement>(
    'section[aria-label="Asset review actions"]'
  )!;
  requireThat(dialog && panel, "The dialog and workflow actions must render");
  const bounds = dialog.getBoundingClientRect();
  requireThat(
    bounds.left >= -1 &&
      bounds.right <= innerWidth + 1 &&
      bounds.top >= -1 &&
      bounds.bottom <= innerHeight + 1,
    "Dialog must remain inside viewport"
  );
  requireThat(
    dialog.scrollWidth <= dialog.clientWidth + 1,
    "Dialog must not overflow horizontally"
  );
  const controls = Array.from(
    panel.querySelectorAll<HTMLElement>("button, textarea")
  );
  const rectangles = controls.map(control => {
    const style = getComputedStyle(control),
      rect = control.getBoundingClientRect(),
      parent = panel.getBoundingClientRect();
    requireThat(
      !["fixed", "absolute"].includes(style.position),
      `Review action is removed from normal flow: ${control.textContent}`
    );
    requireThat(
      rect.width > 0 &&
        rect.height > 0 &&
        rect.left >= parent.left - 1 &&
        rect.right <= parent.right + 1,
      `Control must fit its column: ${control.textContent}`
    );
    return rect;
  });
  for (let a = 0; a < rectangles.length; a++)
    for (let b = a + 1; b < rectangles.length; b++) {
      const x = rectangles[a],
        y = rectangles[b];
      requireThat(
        !(
          Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
          Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
        ),
        "Workflow controls must not overlap"
      );
    }
  return controls.length;
}
async function clickButton(name: string) {
  const button = findButton(name);
  requireThat(button && !button.disabled, `${name} must be enabled`);
  button!.scrollIntoView({ block: "center", behavior: "instant" });
  await pause();
  const rect = button!.getBoundingClientRect(),
    hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  requireThat(hit && button!.contains(hit), `${name} must be reachable`);
  button!.click();
  await pause();
}
(
  window as unknown as { runDialogRegression: () => Promise<unknown> }
).runDialogRegression = async () => {
  try {
    await pause();
    let controls = checkLayout();
    if (canCreate && initialState === "draft") {
      requireThat(
        !findButton("Approve"),
        "Ordinary library approval must not appear in Studio"
      );
      requireThat(
        !!findButton("Approve & add to library") ===
          (role === "owner" || role === "admin"),
        "Only owners/admins have direct approval"
      );
      await clickButton("Submit for approval");
      requireThat(
        document
          .querySelector("[data-current-state]")
          ?.getAttribute("data-current-state") === "needs_review",
        "Submission changes the rendered status"
      );
      requireThat(
        document
          .querySelector("[data-surface]")
          ?.getAttribute("data-surface") === "library",
        "Submission hands off to the library"
      );
      requireThat(
        !findButton("Submit for approval"),
        "The library must not show Submit"
      );
      controls = checkLayout();
    }
    if (canReview && (canCreate || initialState === "needs_review")) {
      await clickButton("Approve");
      requireThat(
        document
          .querySelector("[data-current-state]")
          ?.getAttribute("data-current-state") === "approved",
        "Approval completes the library stage"
      );
      controls = checkLayout();
    } else
      requireThat(
        !findButton("Approve"),
        "No approval control without the right role and stage"
      );
    document.querySelector<HTMLElement>('[role="dialog"]')!.scrollTop = 0;
    return {
      passed: true,
      width: innerWidth,
      height: innerHeight,
      role,
      initialState,
      controls,
    };
  } catch (error) {
    return {
      passed: false,
      width: innerWidth,
      height: innerHeight,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
