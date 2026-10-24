import { useRef, useState } from "react";
import { AIChatBox, type Message } from "./AIChatBox";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { trpc } from "@/lib/trpc";
import type { AuthoringDraft } from "@shared/workflowAuthoring";
import type { WorkflowFamily } from "@shared/creativeWorkflow";

export function WorkflowAuthoringChat({
  organizationId,
  family,
  target,
  disabled,
  onApplied,
}: {
  organizationId: number;
  family: WorkflowFamily;
  target?: { id: string; revision: number };
  disabled?: boolean;
  onApplied: (id: string, draft: AuthoringDraft, revision: number) => void;
}) {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState("");
  const chat = trpc.workflowAuthoring.chat.useMutation(),
    apply = trpc.workflowAuthoring.apply.useMutation();
  const [proposal, setProposal] = useState<Awaited<
    ReturnType<typeof chat.mutateAsync>
  > | null>(null);
  const pending = useRef(false);
  const applyId = useRef(crypto.randomUUID());
  const request = useRef<{ content: string; id: string } | null>(null);
  const busy = chat.isPending || apply.isPending;
  async function send(content: string) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setProposal(null);
    // A transport retry of the same message retains its idempotency key.
    if (request.current?.content !== content)
      request.current = { content, id: crypto.randomUUID() };
    try {
      const next = await chat.mutateAsync({
        organizationId,
        family,
        target,
        requestId: request.current.id,
        message: content,
        history: messages
          .filter(
            (m): m is Message & { role: "user" | "assistant" } =>
              m.role !== "system"
          )
          .slice(-12),
      });
      setMessages(previous => [
        ...previous,
        { role: "user", content },
        { role: "assistant", content: next.proposal.summary },
      ]);
      setProposal(next);
      applyId.current = crypto.randomUUID();
      request.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
    }
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Build with chat
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={e => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Workflow author</DialogTitle>
            <DialogDescription>
              Describe the workflow or App form you want. Chat uses your
              workspace’s metered text model. Review each proposal before saving
              it as a draft.
            </DialogDescription>
          </DialogHeader>
          <AIChatBox
            height={260}
            messages={messages}
            onSendMessage={send}
            isLoading={busy}
            emptyStateMessage="Compose existing steps, App inputs and pinned Apps."
            placeholder="Describe your workflow or the changes you need…"
          />
          {error && <p role="alert">{error}</p>}
          {proposal && (
            <section aria-label="Static proposal preview" className="space-y-3">
              <h3>{proposal.draft.name}</h3>
              <p>
                {proposal.preview.executableSteps} expanded steps ·{" "}
                {proposal.preview.connections} connections
              </p>
              <ul>
                {proposal.draft.graph.nodes.map(node => (
                  <li key={node.id}>
                    {node.title} ({node.type})
                  </li>
                ))}
              </ul>
              <h4>App form</h4>
              {proposal.preview.fields.length ? (
                <ul>
                  {proposal.preview.fields.map(field => (
                    <li key={field.id}>
                      {field.title}: {field.field?.kind} · default:{" "}
                      {field.field?.defaultValue || "None"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No form fields proposed.</p>
              )}
              {proposal.preview.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
              <details>
                <summary>Review exact changes and configuration</summary>
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      changes: proposal.proposal.changes,
                      draft: proposal.draft,
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
              <p>
                Saving does not publish an App, enable a schedule, generate
                media or post externally.
              </p>
              <Button
                disabled={busy || disabled}
                onClick={async () => {
                  if (pending.current) return;
                  pending.current = true;
                  setError("");
                  try {
                    const result = await apply.mutateAsync({
                      organizationId,
                      proposalId: proposal.proposalId,
                      reviewedHash: proposal.hash,
                      requestId: applyId.current,
                    });
                    onApplied(result.id, proposal.draft, result.revision);
                    setProposal(null);
                    setOpen(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    pending.current = false;
                  }
                }}
              >
                Apply reviewed proposal to draft
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setProposal(null)}
              >
                Discard proposal
              </Button>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
