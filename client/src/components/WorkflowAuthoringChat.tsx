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
    apply = trpc.workflowAuthoring.applyDraft.useMutation(),
    abandon = trpc.workflowAuthoring.abandonChat.useMutation();
  const utils = trpc.useUtils();
  const [recovering, setRecovering] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Awaited<
    ReturnType<typeof chat.mutateAsync>
  > | null>(null);
  const pending = useRef(false);
  const applyId = useRef(crypto.randomUUID());
  type ChatRequest = Parameters<typeof chat.mutateAsync>[0];
  const request = useRef<ChatRequest | null>(null);
  const busy = chat.isPending || apply.isPending || recovering;
  function accept(
    next: Awaited<ReturnType<typeof chat.mutateAsync>>,
    content: string
  ) {
    setMessages(previous => [
      ...previous,
      { role: "user", content },
      { role: "assistant", content: next.proposal.summary },
    ]);
    setProposal(next);
    applyId.current = crypto.randomUUID();
    request.current = null;
    setRecovery(null);
    setError("");
  }
  async function check() {
    if (!request.current) return null;
    const status = await utils.workflowAuthoring.chatStatus.fetch(
      request.current,
      { staleTime: 0 }
    );
    setRecovery(status.state);
    if (status.state === "completed")
      accept(status.result, request.current.message);
    return status;
  }
  async function send(content: string, newAttempt = false) {
    if (pending.current) return;
    pending.current = true;
    setRecovering(true);
    setError("");
    setProposal(null);
    try {
      if (request.current) {
        const status = await check();
        if (status?.state === "completed") return;
        if (!status || status.state === "pending") {
          setError(
            "The previous outcome is unresolved. Check again or explicitly abandon it before starting another attempt."
          );
          return;
        }
        if (status.state !== "missing" && !newAttempt) {
          setError(
            "This attempt has ended. Start a new metered attempt to try again."
          );
          return;
        }
        if (
          status.state === "missing" &&
          request.current?.message !== content
        ) {
          setError(
            "Retry the original request before sending another message; an earlier transport request may still arrive."
          );
          return;
        }
        if (status.state !== "missing") request.current = null;
      }
      if (!request.current)
        request.current = {
          organizationId,
          family,
          target,
          requestId: crypto.randomUUID(),
          message: content,
          history: messages
            .filter(
              (m): m is Message & { role: "user" | "assistant" } =>
                m.role !== "system"
            )
            .slice(-12),
        };
      const snapshot = request.current;
      try {
        accept(await chat.mutateAsync(snapshot), snapshot.message);
      } catch (e) {
        setError((e as Error).message);
        try {
          await check();
        } catch {
          setRecovery("unknown");
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setRecovery("unknown");
    } finally {
      pending.current = false;
      setRecovering(false);
    }
  }
  async function recover(abandonPending = false) {
    if (pending.current || !request.current) return;
    pending.current = true;
    setRecovering(true);
    try {
      const status = await check();
      if (abandonPending && status?.state === "pending" && request.current) {
        const result = await abandon.mutateAsync(request.current);
        if (result.state === "completed")
          accept(result.result, request.current.message);
        else {
          setRecovery(result.state);
          setError(
            "The old attempt is closed. A new attempt may incur another text-model charge."
          );
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setRecovery("unknown");
    } finally {
      pending.current = false;
      setRecovering(false);
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
            onSendMessage={content => void send(content)}
            isLoading={busy}
            emptyStateMessage="Compose existing steps, App inputs and pinned Apps."
            placeholder="Describe your workflow or the changes you need…"
          />
          {error && <p role="alert">{error}</p>}
          {recovery && request.current && (
            <section aria-label="Recover chat attempt">
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void recover()}
              >
                Check previous attempt
              </Button>
              {recovery === "pending" && (
                <>
                  <p>
                    The provider call may still finish or have consumed credits.
                    Abandoning prevents its late proposal from being saved; it
                    does not cancel or refund provider work.
                  </p>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => void recover(true)}
                  >
                    Abandon unresolved attempt
                  </Button>
                </>
              )}
              {["failed", "abandoned"].includes(recovery) && (
                <Button
                  disabled={busy}
                  onClick={() => void send(request.current!.message, true)}
                >
                  Start new metered attempt
                </Button>
              )}
              {recovery === "missing" && (
                <Button
                  disabled={busy}
                  onClick={() => void send(request.current!.message)}
                >
                  Retry original request
                </Button>
              )}
            </section>
          )}
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
