import { useLocation } from "wouter";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import { learningHandoffSchema } from "@shared/learningHandoff";
import type { OptimizerOutput } from "@shared/optimizerLibrary";
import { Button } from "./ui/button";
export function LearningHandoffButton({ result }: { result: OptimizerOutput }) {
  const { organizationId } = useWorkspace();
  const [, navigate] = useLocation();
  return (
    <Button
      disabled={!organizationId}
      onClick={() => {
        try {
          const id = crypto.randomUUID();
          const draft = learningHandoffSchema.parse({
            id,
            organizationId,
            createdAtMs: Date.now(),
            kind: result.kind,
            sourceAdIds: result.sourceAdIds.slice(0, 100),
            hypothesis: result.generationBrief.slice(0, 8000),
          });
          sessionStorage.setItem(
            `evokeloop:learning:${organizationId}:${id}`,
            JSON.stringify(draft)
          );
          navigate(`/app/creatives/studio?learning=${id}`);
        } catch {
          toast.error("Could not open the learning brief. Try again.");
        }
      }}
    >
      Create a test from this evidence
    </Button>
  );
}
