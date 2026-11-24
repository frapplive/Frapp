"use client";

import { useId, useState } from "react";
import {
  useMoveRushStage,
  type RushManualClosedReason,
  type RushPipelineCandidate,
  type RushStage,
} from "@repo/hooks";
import {
  RUSH_CLOSED_REASON_LABELS,
  RUSH_MANUAL_CLOSED_REASONS,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toastFailure } from "@/lib/failure-toast";

type Asking = {
  candidate: RushPipelineCandidate;
  /** The Closed stages the prospect could land in: one, or a pick. */
  stages: RushStage[];
};

/**
 * Moving a prospect between stages (`rush:add`), from a drag on the board,
 * a card's Move to menu or the panel's stage picker: one path, so all three
 * ask the same question.
 *
 * A Closed stage needs one of the four reasons a member picks by hand
 * (`spec/behavior/rush.md` § Stages), so a move there asks first,
 * the way Pipedrive and HubSpot ask why a deal was lost before it leaves the
 * board. Cancelling leaves the prospect where they were: nothing is sent
 * until a reason is picked. When the move could land in more than one Closed
 * stage (a drop on the board's folded Closed column), the same question asks
 * which. The board moves the card at once and puts it back if the server
 * refuses (`useMoveRushStage`).
 */
export function useRushMove() {
  const move = useMoveRushStage();
  const [asking, setAsking] = useState<Asking | null>(null);

  function send(
    candidate: RushPipelineCandidate,
    stage: string,
    closedReason?: RushManualClosedReason,
  ) {
    move.mutate(
      { candidateId: candidate.id, stage, closedReason },
      {
        onError: (error) =>
          toastFailure({
            title: `Couldn't move ${candidate.display_name}`,
            error,
            fallback: "Retry in a moment.",
          }),
      },
    );
  }

  /**
   * Move `candidate` into one of `stages`: one stage for a column or a pick,
   * every visible Closed stage for the folded Closed column. Moving to where
   * they already are does nothing.
   */
  function request(
    candidate: RushPipelineCandidate,
    stages: readonly RushStage[],
  ) {
    const choices = stages.filter((stage) => stage.key !== candidate.stage);
    const first = choices[0];
    if (!first) return;
    if (first.category === "closed") {
      setAsking({ candidate, stages: choices });
      return;
    }
    send(candidate, first.key);
  }

  const dialog = (
    <ClosedReasonDialog
      // A new question opens on no answer.
      key={asking ? `${asking.candidate.id}:${asking.stages[0]?.key}` : "none"}
      asking={asking}
      onCancel={() => setAsking(null)}
      onConfirm={(stage, reason) => {
        if (asking) send(asking.candidate, stage, reason);
        setAsking(null);
      }}
    />
  );

  return { request, dialog };
}

/**
 * The question a move to Closed asks: why, and, when the move could land in
 * more than one Closed stage, which. A short question, so a centred dialog
 * (rulebook § 9), with the commit naming the thing it does.
 */
export function ClosedReasonDialog({
  asking,
  onCancel,
  onConfirm,
}: {
  asking: Asking | null;
  onCancel: () => void;
  onConfirm: (stage: string, reason: RushManualClosedReason) => void;
}) {
  const stageId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState<RushManualClosedReason | "">("");
  const [picked, setPicked] = useState("");
  const stages = asking?.stages ?? [];
  const asksStage = stages.length > 1;
  const stage = asksStage ? picked : (stages[0]?.key ?? "");
  const stageLabel = stages.find((s) => s.key === stage)?.label;
  const missing = !stage
    ? "Pick a stage first"
    : !reason
      ? "Pick a reason first"
      : null;

  return (
    <Dialog
      open={asking !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (stage && reason) onConfirm(stage, reason);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {asking
                ? `Why is ${asking.candidate.display_name} closed?`
                : "Why is this prospect closed?"}
            </DialogTitle>
          </DialogHeader>
          {asksStage ? (
            <div className="grid gap-1.5">
              <Label htmlFor={stageId}>Stage</Label>
              <Select value={picked} onValueChange={setPicked}>
                <SelectTrigger id={stageId} aria-label="Stage">
                  <SelectValue placeholder="Pick a stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={reasonId}>Reason</Label>
            <Select
              value={reason}
              onValueChange={(next) =>
                setReason(next as RushManualClosedReason)
              }
            >
              <SelectTrigger id={reasonId} aria-label="Reason">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {RUSH_MANUAL_CLOSED_REASONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {RUSH_CLOSED_REASON_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={missing !== null}
              title={missing ?? undefined}
            >
              {stageLabel && stageLabel !== "Closed"
                ? `Move to ${stageLabel}`
                : "Close prospect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
