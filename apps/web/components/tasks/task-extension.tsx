"use client";

import { useState } from "react";
import {
  extensionDecidedLine,
  extensionDueWords,
  useRequestTaskExtension,
} from "@repo/hooks";
import { dueEntryFields, dueEntryFromTask } from "@repo/formatting";
import {
  TASK_EXTENSION_COPY,
  TASK_EXTENSION_REASON_MAX_LENGTH,
  cantAskForMoreTime,
  type CantAskForMoreTime,
} from "@repo/validation";
import { FieldError } from "@/components/shared/short-form";
import type { SubscriptionGate } from "@/components/shared/subscription-gate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import type { BoardTask } from "./board-task";
import { DueDateField, dueEntryPassed } from "./due-date-field";

/**
 * Asking for more time on a task, on web (#6096, `spec/behavior/tasks.md`
 * § Asking for more time). The assignee asks from the task panel's Due row,
 * the way Canvas and Google Classroom take a student's extension request: a
 * new due and a reason, which is approved at once or waits on an officer.
 */

/** What the task panel's Due row shows about extensions, for one viewer. */
export interface TaskExtensionView {
  /** Why the viewer can't ask, or null when they can. */
  cant: CantAskForMoreTime | null;
  /** The due reads in the danger red: a fixed deadline, to its assignee. */
  urgent: boolean;
  /** The one line under the due, or null. */
  lines: { text: string; tone: "muted" | "danger" }[];
}

/**
 * The words the panel's Due row says, from the task read: the assignee's
 * reason they can't ask (fixed, waiting, blocked), and to the assignee and
 * officers the latest request's answer ("Extended to Saturday", "Not
 * extended: …").
 */
export function taskExtensionView(
  task: BoardTask,
  {
    viewerId,
    canManage,
    now = new Date(),
  }: { viewerId: string; canManage: boolean; now?: Date },
): TaskExtensionView {
  const cant = cantAskForMoreTime(task, viewerId || null);
  const isMine = cant !== "not_mine";
  const lines: TaskExtensionView["lines"] = [];
  const latest = task.extension ?? null;
  if (latest && (isMine || canManage)) {
    const decided = extensionDecidedLine(latest, now);
    if (decided) lines.push({ text: decided, tone: "muted" });
  }
  if (cant === "fixed") {
    lines.push({ text: TASK_EXTENSION_COPY.fixedNoExtensions, tone: "danger" });
  } else if (cant === "waiting") {
    lines.push({ text: TASK_EXTENSION_COPY.waiting, tone: "muted" });
  } else if (cant === "blocked") {
    lines.push({ text: TASK_EXTENSION_COPY.blocked, tone: "muted" });
  }
  return { cant, urgent: cant === "fixed", lines };
}

/**
 * The fields a new due sends: a task due at a time keeps a time (the one
 * typed, or the task's own time of day on the day picked), a task due by a
 * day sends the day alone.
 */
export function extensionDueBody(
  task: { due_date: string | null; due_at?: string | null },
  entry: string,
): { due_date: string; due_at?: string } {
  if (!task.due_at) return { due_date: dueEntryFields(entry).due_date };
  const [day = entry, time] = entry.split("T");
  const keptTime = dueEntryFromTask(task).split("T")[1];
  return dueEntryFields(time ? entry : keptTime ? `${day}T${keptTime}` : day);
}

/** Ask for more time: the assignee's button and its dialog. */
export function AskForMoreTime({
  task,
  gate,
}: {
  task: BoardTask;
  gate: SubscriptionGate;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shrink-0"
        {...gate.controlProps()}
        onClick={() => setOpen(true)}
      >
        {TASK_EXTENSION_COPY.ask}
      </Button>
      <AskForMoreTimeDialog
        task={task}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function AskForMoreTimeDialog({
  task,
  open,
  onClose,
}: {
  task: BoardTask;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const request = useRequestTaskExtension();
  const [due, setDue] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<
    "missing-due" | "passed" | "missing-reason" | string | null
  >(null);
  const busy = request.isPending;

  // Each ask starts blank, so a reason typed for one task never carries.
  function close() {
    setDue("");
    setReason("");
    setProblem(null);
    onClose();
  }

  async function submit() {
    if (!due) return setProblem("missing-due");
    if (dueEntryPassed(due)) return setProblem("passed");
    const why = reason.trim();
    if (!why) return setProblem("missing-reason");
    try {
      const result = await request.mutateAsync({
        id: task.id,
        body: { ...extensionDueBody(task, due), reason: why },
      });
      const granted = result.extension.status === "approved";
      toast({
        title: granted
          ? TASK_EXTENSION_COPY.approvedNow
          : TASK_EXTENSION_COPY.waiting,
        description: [
          granted ? `Now due ${extensionDueWords(result.extension)}.` : null,
          result.now_blocked ? TASK_EXTENSION_COPY.blocked : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
      close();
    } catch (error) {
      setProblem(
        getErrorMessage(error, TASK_EXTENSION_COPY.askFailed, {
          serverWritesForMembers: true,
        }),
      );
    }
  }

  const fieldProblem =
    problem === "missing-reason"
      ? TASK_EXTENSION_COPY.reasonMissing
      : problem !== null && problem !== "missing-due" && problem !== "passed"
        ? problem
        : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TASK_EXTENSION_COPY.title}</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor={`extension-due-${task.id}`}>
              {TASK_EXTENSION_COPY.newDue}
            </Label>
            <DueDateField
              id={`extension-due-${task.id}`}
              autoFocus
              placeholder={task.due_at ? "Saturday 5pm" : "Saturday"}
              withoutTime={!task.due_at}
              value={due}
              missing={problem === "missing-due"}
              passed={problem === "passed"}
              disabled={busy}
              onChange={(value) => {
                setDue(value);
                setProblem(null);
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`extension-reason-${task.id}`}>
              {TASK_EXTENSION_COPY.reasonLabel}
            </Label>
            <Textarea
              id={`extension-reason-${task.id}`}
              rows={2}
              maxLength={TASK_EXTENSION_REASON_MAX_LENGTH}
              placeholder={TASK_EXTENSION_COPY.reasonPlaceholder}
              value={reason}
              disabled={busy}
              aria-invalid={problem === "missing-reason" || undefined}
              onChange={(event) => {
                setReason(event.target.value);
                if (problem === "missing-reason") setProblem(null);
              }}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            {TASK_EXTENSION_COPY.hint}
          </p>
          {fieldProblem ? <FieldError>{fieldProblem}</FieldError> : null}
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
              {TASK_EXTENSION_COPY.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Fixed deadline (#6096): no extensions, and urgent to whoever has it. Saved
 * the moment it changes, as every field here is.
 */
export function FixedDeadlineSwitch({
  id,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className="flex min-h-8 items-center gap-2"
      title={TASK_EXTENSION_COPY.fixedDeadlineHint}
    >
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
      <Label htmlFor={id} className="text-sm font-normal text-foreground">
        {TASK_EXTENSION_COPY.fixedDeadline}
      </Label>
    </div>
  );
}
