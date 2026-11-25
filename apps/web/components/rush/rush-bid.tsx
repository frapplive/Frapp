"use client";

import { useId, useState } from "react";
import {
  RUSH_BID_WORDS,
  rushBidActions,
  rushBidLines,
  useBidRushCandidate,
  useConfirmRushAcceptance,
  useRecordRushAcceptance,
  useRecordRushDecline,
  useRescindRushBid,
  type RushPipelineAccess,
  type RushPipelineCandidate,
} from "@repo/hooks";
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
import { Label } from "@/components/ui/label";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { toastFailure } from "@/lib/failure-toast";
import { useToast } from "@/lib/hooks/use-toast";

/**
 * A prospect's bid on their panel (#5973, `spec/behavior/ifc-recruitment.md`
 * § Bids; Winston's UI design v8 § 3b): its state first, in one or two lines
 * ("Recorded by Chris, waiting to be confirmed" / "Emailed them to confirm.
 * It expires Tuesday if nobody does."), then the actions the viewer may take
 * on it now, as compact buttons (rulebook § 7), the most used first, the way
 * ChapterBuilder's and Greek Rank's bid trackers put Extend, Accepted and
 * Declined on the prospect and Pipedrive's deal puts Won and Lost:
 *
 * - **Extend bid** (`rush:bid`), with no bid out or an expired one.
 * - **Record acceptance** (`rush:bid`), a centred dialog asking the PNM's
 *   email for the one-tap confirmation, which only Frapp sees; a linked
 *   member's account email stands in when it's left empty.
 * - **Confirm acceptance** (`rush:manage`), once one is recorded.
 * - **Record decline** (`rush:bid`), confirmed first, since it ends the bid.
 * - **Rescind bid** (`rush:manage`), with a reason; red and last.
 *
 * A refusal (someone answered it first, it expired) says why in a toast, in
 * the API's words.
 */
export function RushBidControl({
  candidate,
  access,
  writable,
  viewerId,
  today,
}: {
  candidate: RushPipelineCandidate;
  access: RushPipelineAccess;
  writable: boolean;
  viewerId: string | null;
  today: string;
}) {
  const extend = useBidRushCandidate();
  const decline = useRecordRushDecline();
  const confirmAcceptance = useConfirmRushAcceptance();
  const rescind = useRescindRushBid();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [recording, setRecording] = useState(false);

  const lines = rushBidLines(candidate, today);
  const actions = rushBidActions(candidate, access, viewerId);
  const busy =
    extend.isPending ||
    decline.isPending ||
    confirmAcceptance.isPending ||
    rescind.isPending;
  const off = !writable || busy;
  const name = candidate.display_name;
  const fail = (title: string) => (error: unknown) =>
    toastFailure({ title, error, fallback: "Retry in a moment." });

  async function onDecline() {
    const ok = await confirm({
      title: `Record that ${name} declined?`,
      description:
        "This ends the bid. If they change their mind, extend a new one once it's answered.",
      confirmLabel: RUSH_BID_WORDS.recordDecline,
    });
    if (!ok) return;
    decline.mutate(
      { candidateId: candidate.id },
      { onError: fail("Couldn't record the decline") },
    );
  }

  async function onRescind() {
    const answer = await confirm({
      title: `Rescind ${name}'s bid?`,
      description: "The bid ends, and the reason stays on their record.",
      confirmLabel: RUSH_BID_WORDS.rescind,
      tone: "destructive",
      comment: { label: RUSH_BID_WORDS.rescindReasonLabel },
    });
    if (!answer) return;
    const reason = answer.comment.trim();
    if (!reason) {
      toast({ title: "Say why the bid is rescinded", variant: "destructive" });
      return;
    }
    rescind.mutate(
      { candidateId: candidate.id, reason },
      { onError: fail("Couldn't rescind the bid") },
    );
  }

  const anyAction = Object.values(actions).some(Boolean);
  if (!lines && !anyAction) {
    return (
      <span className="px-2 py-1.5 text-sm text-muted-foreground">
        No bid yet
      </span>
    );
  }

  return (
    <div className="grid gap-2 px-2 py-1">
      {lines ? (
        <div className="grid gap-0.5">
          <span className="text-sm text-foreground">{lines.title}</span>
          {lines.detail ? (
            <span className="text-caption text-muted-foreground">
              {lines.detail}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">No bid yet</span>
      )}
      {anyAction ? (
        <div className="flex flex-wrap gap-2">
          {actions.extend ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={off}
              onClick={() =>
                extend.mutate(candidate.id, {
                  onError: fail("Couldn't extend the bid"),
                })
              }
            >
              {RUSH_BID_WORDS.extend}
            </Button>
          ) : null}
          {actions.confirm ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={off}
              onClick={() =>
                confirmAcceptance.mutate(
                  { candidateId: candidate.id },
                  {
                    onSuccess: (bid) =>
                      toast({
                        title: `${name} accepted`,
                        description: bid.invite_sent
                          ? "They were emailed an invite to join."
                          : "No invite went out. Invite them from Members.",
                      }),
                    onError: fail("Couldn't confirm the acceptance"),
                  },
                )
              }
            >
              {RUSH_BID_WORDS.confirm}
            </Button>
          ) : null}
          {actions.recordAcceptance ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={off}
              onClick={() => setRecording(true)}
            >
              {RUSH_BID_WORDS.recordAcceptance}
            </Button>
          ) : null}
          {actions.recordDecline ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={off}
              onClick={() => void onDecline()}
            >
              {RUSH_BID_WORDS.recordDecline}
            </Button>
          ) : null}
          {actions.rescind ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive-text"
              disabled={off}
              onClick={() => void onRescind()}
            >
              {RUSH_BID_WORDS.rescind}
            </Button>
          ) : null}
        </div>
      ) : null}
      {confirmDialog}
      <RecordAcceptanceDialog
        candidate={candidate}
        open={recording}
        onOpenChange={setRecording}
      />
    </div>
  );
}

/**
 * Record an acceptance: one question, the PNM's email, in a centred dialog
 * (rulebook § 2). The email only reaches Frapp's one-tap confirmation and the
 * invite once it is confirmed; members never see it (Winston, 2026-11-24).
 * Left empty, a linked member's account email is used, else nobody is
 * emailed and someone who manages recruitment confirms it.
 */
function RecordAcceptanceDialog({
  candidate,
  open,
  onOpenChange,
}: {
  candidate: RushPipelineCandidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const record = useRecordRushAcceptance();
  const { toast } = useToast();
  const emailId = useId();
  const hintId = useId();
  const [email, setEmail] = useState("");
  const linked = candidate.user_id !== null;

  function submit() {
    if (record.isPending) return;
    record.mutate(
      { candidateId: candidate.id, email: email.trim() || null },
      {
        onSuccess: (bid) => {
          setEmail("");
          onOpenChange(false);
          toast({
            title: "Acceptance recorded",
            description: bid.bid_confirm_emailed
              ? `${candidate.display_name} was emailed a link to confirm.`
              : "Someone who manages recruitment confirms it.",
          });
        },
        onError: (error) =>
          toastFailure({
            title: "Couldn't record the acceptance",
            error,
            fallback: "Retry in a moment.",
          }),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && record.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{RUSH_BID_WORDS.acceptanceTitle}</DialogTitle>
            <DialogDescription>
              {`It waits until ${candidate.display_name} confirms it from the email, or someone who manages recruitment does.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={emailId}>
              {RUSH_BID_WORDS.acceptanceEmailLabel}
            </Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="off"
              value={email}
              maxLength={320}
              aria-describedby={hintId}
              onChange={(event) => setEmail(event.target.value)}
            />
            <span id={hintId} className="text-caption text-muted-foreground">
              {linked
                ? RUSH_BID_WORDS.acceptanceLinkedHint
                : RUSH_BID_WORDS.acceptanceEmailHint}
            </span>
          </div>
          <DialogFooter>
            <Button type="submit" size="sm" disabled={record.isPending}>
              {RUSH_BID_WORDS.recordAcceptance}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
