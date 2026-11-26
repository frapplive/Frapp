"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CHAT_TIMEOUT_DURATIONS,
  CHAT_TIMEOUT_REASON_MAX,
  type ChatTimeoutDurationKey,
} from "@repo/validation";
import {
  CHAT_TIMEOUT_COPY,
  runningTimeoutLine,
} from "@repo/chat-core/chat-timeout";
import {
  useLiftChatTimeout,
  useMemberByUserId,
  useNowDate,
  useTimeOutMember,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedChoice } from "@/components/ui/segmented";

/** Who the dialog is about: a member, by their `users.id`, and their name. */
export interface TimeoutTarget {
  userId: string;
  name: string;
}

const DURATION_OPTIONS = CHAT_TIMEOUT_DURATIONS.map((duration) => ({
  value: duration.key,
  label: duration.label,
}));

/**
 * Time a member out of the chapter's channels (#6006,
 * `spec/behavior/chat/README.md` § Timeouts), from a message's More menu or a
 * member's profile: how long (5 minutes to a week, as Discord's Timeout
 * offers) and an optional reason the member sees. A member already timed out
 * shows until when, and Lift timeout ends it early.
 *
 * It reads the member's profile first, so a member ranked too high is told
 * so here, before anything is sent (`viewer_can_timeout`, the server's own
 * rank rule); the server checks again.
 */
export function TimeoutMemberDialog({
  target,
  onClose,
}: {
  target: TimeoutTarget | null;
  onClose: () => void;
}) {
  const profile = useMemberByUserId(target?.userId ?? "");
  const timeOut = useTimeOutMember();
  const lift = useLiftChatTimeout();
  const now = useNowDate();
  const [duration, setDuration] = useState<ChatTimeoutDurationKey>("1h");
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const reasonId = useId();
  const pending = timeOut.isPending || lift.isPending;

  // Each opening starts fresh: reset while rendering when the member changes,
  // or the dialog opens again (it passes through `null` on every close). By
  // id, so a caller may build a new target object every render.
  const targetUserId = target?.userId ?? null;
  const [openedFor, setOpenedFor] = useState(targetUserId);
  if (targetUserId !== openedFor) {
    setOpenedFor(targetUserId);
    if (targetUserId) {
      setDuration("1h");
      setReason("");
      setFailure(null);
    }
  }

  const member = profile.data;
  const memberId = member?.id ?? null;
  const allowed = member?.viewer_can_timeout === true;
  const runningLine = runningTimeoutLine(
    member?.chat_timeout_until,
    member?.chat_timeout_reason,
    now,
  );

  async function submit() {
    if (!memberId || !allowed || pending) return;
    setFailure(null);
    try {
      await timeOut.mutateAsync({ memberId, duration, reason });
      onClose();
    } catch (error) {
      setFailure(
        errorCopy(error, CHAT_TIMEOUT_COPY.failed, {
          serverWritesForMembers: true,
        }),
      );
    }
  }

  async function liftNow() {
    if (!memberId || pending) return;
    setFailure(null);
    try {
      await lift.mutateAsync({ memberId });
      onClose();
    } catch (error) {
      setFailure(
        errorCopy(error, CHAT_TIMEOUT_COPY.liftFailed, {
          serverWritesForMembers: true,
        }),
      );
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {CHAT_TIMEOUT_COPY.title(target?.name ?? "")}
            </DialogTitle>
            <DialogDescription>{CHAT_TIMEOUT_COPY.effect}</DialogDescription>
          </DialogHeader>
          {runningLine ? (
            <p className="text-sm text-foreground">{runningLine}</p>
          ) : null}
          {member && !allowed ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {CHAT_TIMEOUT_COPY.outOfReach}
            </p>
          ) : (
            <fieldset
              className="flex flex-col gap-4"
              disabled={pending || !member}
            >
              <SegmentedChoice
                label={CHAT_TIMEOUT_COPY.duration}
                options={DURATION_OPTIONS}
                value={duration}
                onChange={setDuration}
                fill
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor={reasonId} className="text-sm font-medium">
                  {CHAT_TIMEOUT_COPY.reason}
                </label>
                <Input
                  id={reasonId}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={CHAT_TIMEOUT_REASON_MAX}
                  placeholder={CHAT_TIMEOUT_COPY.reasonPlaceholder}
                />
              </div>
            </fieldset>
          )}
          {failure ? (
            <p role="alert" className="text-sm text-destructive-text">
              {failure}
            </p>
          ) : null}
          <DialogFooter>
            {runningLine && allowed ? (
              <Button
                type="button"
                variant="secondary"
                className="sm:mr-auto"
                onClick={() => void liftNow()}
                disabled={pending}
              >
                {CHAT_TIMEOUT_COPY.lift}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!allowed || pending}>
              {timeOut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {CHAT_TIMEOUT_COPY.commit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
