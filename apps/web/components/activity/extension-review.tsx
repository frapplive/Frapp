"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  extensionDueWords,
  useApproveTaskExtension,
  useDeclineTaskExtension,
  useNow,
  type ActivityFace,
  type ActivityTaskExtension,
} from "@repo/hooks";
import {
  TASK_EXTENSION_COPY,
  TASK_EXTENSION_DECLINE_MAX_LENGTH,
  TASK_EXTENSION_NEEDS_OFFICER_LABELS,
} from "@repo/validation";
import { statusOf } from "@repo/api-sdk";
import { FieldError } from "@/components/shared/short-form";
import {
  SubscriptionNotice,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FOCUS_RING } from "@/components/ui/focus";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/use-toast";
import { tasksTaskLink } from "@/lib/tasks/task-links";
import { cn, getErrorMessage, initials } from "@/lib/utils";

/**
 * An officer's decision on a member's request for more time (#6096,
 * `spec/behavior/tasks.md` § Asking for more time), in Activity's panel: who
 * asks, the task (which opens it), the due it moves from and to, why it waits
 * on an officer, the reason, AI's note when it judged the reason invalid, and
 * Approve and Decline. Canvas's and Google Classroom's extension requests
 * put the same in front of a teacher. Decline asks why, as Send back does.
 *
 * Someone answering first, or the task moving past the request, is a 409:
 * its message is said and the list re-reads, which drops the row.
 */
export function ExtensionReview({
  extension,
  face,
  onDone,
}: {
  extension: ActivityTaskExtension;
  /** The asker on the roster, for their photo; null for one who left. */
  face: ActivityFace | null;
  /** The request was answered (here or, on a 409, elsewhere). */
  onDone: () => void;
}) {
  const { toast } = useToast();
  const approve = useApproveTaskExtension();
  const decline = useDeclineTaskExtension();
  const gate = useSubscriptionGate();
  const now = new Date(useNow());
  const [declining, setDeclining] = useState(false);
  const busy = approve.isPending || decline.isPending;
  const name = extension.requester_name || face?.name || "A member";
  const firstName = name.split(" ")[0] ?? name;
  const from = extensionDueWords(
    { to_due_date: extension.from_due_date, to_due_at: extension.from_due_at },
    now,
  );
  const to = extensionDueWords(extension, now);
  const why = extension.needs_officer
    ? TASK_EXTENSION_NEEDS_OFFICER_LABELS[extension.needs_officer]
    : null;
  const ids = { taskId: extension.task.id, requestId: extension.id };

  const refused = (error: unknown, fallback: string) => {
    toast({
      title: fallback,
      description: getErrorMessage(error, "Try again in a moment.", {
        serverWritesForMembers: true,
      }),
      variant: "destructive",
    });
    // Answered first, or the task changed: the re-read settles the row.
    if (isConflict(error)) onDone();
  };

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          {face?.avatarUrl ? <AvatarImage src={face.avatarUrl} alt="" /> : null}
          <AvatarFallback tint={face?.tint}>{initials(name)}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 truncate text-label font-semibold">
          {TASK_EXTENSION_COPY.asks(name)}
        </p>
      </div>

      <div className="grid gap-2">
        <Link
          href={tasksTaskLink(extension.task.id)}
          className={cn(
            "w-fit rounded-sm text-title font-bold text-foreground underline-offset-4 hover:underline",
            FOCUS_RING,
          )}
        >
          {extension.task.title}
        </Link>
        <p
          className="flex flex-wrap items-center gap-1.5 text-body text-foreground"
          aria-label={`From ${from} to ${to}`}
        >
          <span className="text-muted-foreground">{from}</span>
          <ArrowRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="font-medium">{to}</span>
        </p>
        {why ? (
          <Badge variant="warning" className="w-fit">
            {why}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-2">
        <p className="rounded-[10px] bg-surface-1 px-3 py-2 text-body text-foreground">
          <span className="font-medium">{firstName}: </span>
          &ldquo;{extension.reason}&rdquo;
        </p>
        {extension.ai_verdict === "invalid" && extension.ai_note ? (
          <p className="rounded-[10px] bg-warning-tint px-3 py-2 text-caption text-foreground">
            <span className="font-medium">Frapp Intelligence: </span>
            {extension.ai_note}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          {...gate.controlProps(busy)}
          onClick={() => setDeclining(true)}
        >
          {TASK_EXTENSION_COPY.decline}
        </Button>
        <Button
          type="button"
          size="sm"
          {...gate.controlProps(busy)}
          onClick={() =>
            approve.mutate(ids, {
              onSuccess: () => {
                toast({
                  title: `Extended to ${to}`,
                  description: extension.task.title,
                });
                onDone();
              },
              onError: (error) => refused(error, "Couldn't approve it"),
            })
          }
        >
          {TASK_EXTENSION_COPY.approve}
        </Button>
      </div>
      <SubscriptionNotice
        gate={gate}
        feature="deciding on more time"
        className="mb-0"
      />

      <DeclineExtensionDialog
        title={extension.task.title}
        open={declining}
        onClose={() => setDeclining(false)}
        onSubmit={async (reason) => {
          try {
            await decline.mutateAsync({ ...ids, reason });
          } catch (error) {
            if (isConflict(error)) {
              refused(error, "Couldn't decline it");
              return;
            }
            throw error;
          }
          onDone();
        }}
      />
    </div>
  );
}

/** A 409: someone answered first, or the task moved past the request. */
function isConflict(error: unknown): boolean {
  return statusOf(error) === 409;
}

/** Decline more time: a required reason, as Send back asks for one. */
export function DeclineExtensionDialog({
  title,
  open,
  onClose,
  onSubmit,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function close() {
    setReason("");
    setProblem(null);
    onClose();
  }
  async function submit() {
    const why = reason.trim();
    if (!why) return setProblem("Say why it can't move.");
    setBusy(true);
    try {
      await onSubmit(why);
      close();
    } catch (error) {
      setProblem(
        getErrorMessage(error, "Couldn't decline it. Try again.", {
          serverWritesForMembers: true,
        }),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TASK_EXTENSION_COPY.declineTitle}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="decline-extension-reason">
              {TASK_EXTENSION_COPY.declineReasonLabel}
            </Label>
            <Input
              id="decline-extension-reason"
              autoFocus
              maxLength={TASK_EXTENSION_DECLINE_MAX_LENGTH}
              placeholder={TASK_EXTENSION_COPY.declineReasonPlaceholder}
              value={reason}
              disabled={busy}
              aria-invalid={!!problem}
              onChange={(event) => {
                setReason(event.target.value);
                setProblem(null);
              }}
            />
          </div>
          {problem ? <FieldError>{problem}</FieldError> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {TASK_EXTENSION_COPY.decline}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
