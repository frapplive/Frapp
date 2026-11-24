"use client";

import { useId, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  useClearRushFollowUp,
  useSetRushFollowUp,
  type RushPipelineCandidate,
  RUSH_NEEDS_FOLLOW_UP,
  rushDayInSentence,
} from "@repo/hooks";
import {
  readKeptDraft,
  useKeptDraftKeys,
  useKeptFormDraft,
} from "@repo/hooks/kept-drafts";
import {
  RUSH_FOLLOW_UP_AHEAD_DAYS,
  RUSH_FOLLOW_UP_NOTE_MAX,
  isRushFollowUpDue,
  shiftRushDayKey,
} from "@repo/validation";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { INPUT_CLASSES, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastFailure } from "@/lib/failure-toast";
import { cn } from "@/lib/utils";
import {
  RushMemberName,
  rushAssignProblem,
  type RushMemberOption,
} from "./rush-owner";

/**
 * The panel's Follow-up value and its controls (#5934): "Thu, invite to house
 * dinner", with who it's for when that isn't the viewer, the day in the
 * warning colour once it's due; with none set, "None", and "Needs follow-up"
 * once nobody has logged a contact for the chapter's stale days. `rush:add`
 * sets or changes it in a short dialog and clears it with the ×, as a HubSpot
 * task or a Pipedrive activity is scheduled. A closed prospect takes none.
 */
export function RushFollowUpControl({
  candidate,
  canEdit,
  stale,
  closed,
  today,
  viewerId,
  members,
}: {
  candidate: RushPipelineCandidate;
  /** `rush:add`, and writes allowed now. */
  canEdit: boolean;
  /** Open, no follow-up set, and no contact for the stale days. */
  stale: boolean;
  closed: boolean;
  today: string;
  viewerId: string | null;
  members: readonly RushMemberOption[];
}) {
  const clear = useClearRushFollowUp();
  const [editing, setEditing] = useState(false);
  const on = closed ? null : candidate.follow_up_on;
  const due = on !== null && isRushFollowUpDue(candidate, today);
  const forOther =
    candidate.follow_up_user_id !== null &&
    candidate.follow_up_user_id !== viewerId;

  return (
    <div className="flex min-w-0 items-center gap-1.5 px-2 py-1">
      {on ? (
        <span className="min-w-0 flex-1 text-sm text-foreground">
          <span className={cn(due && "font-semibold text-warning")}>
            {capitalizeFirst(rushDayInSentence(on, today))}
          </span>
          {candidate.follow_up_note ? `, ${candidate.follow_up_note}` : ""}
          {forOther && candidate.follow_up_user_name ? (
            <span className="text-muted-foreground">
              {` · for ${candidate.follow_up_user_name}`}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm text-muted-foreground">None</span>
          {stale ? (
            <Badge variant="warning">{RUSH_NEEDS_FOLLOW_UP}</Badge>
          ) : null}
        </span>
      )}
      {canEdit && !closed ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0"
            onClick={() => setEditing(true)}
          >
            {on ? "Change" : "Set"}
          </Button>
          {on ? (
            <IconButton
              label="Clear follow-up"
              className="shrink-0 text-muted-foreground"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(candidate.id, {
                  onError: (error) =>
                    toastFailure({
                      title: "Couldn't clear the follow-up",
                      error,
                      fallback: "Retry in a moment.",
                    }),
                })
              }
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          ) : null}
        </>
      ) : null}
      {editing ? (
        <FollowUpDialog
          candidate={candidate}
          today={today}
          viewerId={viewerId}
          members={members}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface FollowUpDraft {
  day: string;
  note: string;
  /** Who it's for; the owner, else the viewer, until picked. */
  forUserId: string | null;
}

/**
 * Set or change the follow-up: the day (today up to 180 days ahead), what to
 * do (up to 120 characters), and who it's for, the owner by default. A short
 * question, so a centred dialog; closing it keeps what was typed for this
 * prospect, and saving drops it. A member who can't work prospects is refused
 * in words under the form.
 */
function FollowUpDialog({
  candidate,
  today,
  viewerId,
  members,
  onClose,
}: {
  candidate: RushPipelineCandidate;
  today: string;
  viewerId: string | null;
  members: readonly RushMemberOption[];
  onClose: () => void;
}) {
  const setFollowUp = useSetRushFollowUp();
  const keys = useKeptDraftKeys();
  const form = `rush-follow-up:${candidate.id}`;
  const [opening] = useState(() =>
    readKeptDraft<FollowUpDraft>(keys.draft(form)),
  );
  const [draft, setDraft] = useState<FollowUpDraft>(
    opening ?? {
      day: candidate.follow_up_on ?? shiftRushDayKey(today, 1),
      note: candidate.follow_up_note ?? "",
      forUserId: candidate.follow_up_user_id ?? candidate.owner_id ?? viewerId,
    },
  );
  const kept = useKeptFormDraft(form, true, draft, {
    restoredAtMount: opening !== undefined,
  });
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteId = useId();
  const forName =
    members.find((m) => m.user_id === draft.forUserId)?.display_name ??
    (draft.forUserId === candidate.owner_id ? candidate.owner_name : null) ??
    (draft.forUserId === candidate.follow_up_user_id
      ? candidate.follow_up_user_name
      : null);
  const dayProblem = !/^\d{4}-\d{2}-\d{2}$/.test(draft.day)
    ? "Pick the day to follow up."
    : draft.day < today
      ? "Pick today or a later day."
      : draft.day > shiftRushDayKey(today, RUSH_FOLLOW_UP_AHEAD_DAYS)
        ? `Pick a day in the next ${RUSH_FOLLOW_UP_AHEAD_DAYS} days.`
        : null;
  const choices = members.filter((m) => m.user_id !== candidate.user_id);

  async function submit() {
    setTried(true);
    if (dayProblem || setFollowUp.isPending) return;
    setProblem(null);
    kept.hold();
    try {
      await setFollowUp.mutateAsync({
        candidateId: candidate.id,
        dueOn: draft.day,
        note: draft.note,
        ...(draft.forUserId ? { forUserId: draft.forUserId } : {}),
      });
      kept.drop();
      onClose();
    } catch (error) {
      kept.release();
      setProblem(rushAssignProblem(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !setFollowUp.isPending) onClose();
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
            <DialogTitle>Follow up with {candidate.display_name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>When</Label>
            <DateField
              aria-label="When"
              value={draft.day}
              lean="ahead"
              onChange={(day) => setDraft({ ...draft, day })}
              error={tried ? dayProblem : null}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={noteId}>What to do</Label>
            <Input
              id={noteId}
              value={draft.note}
              maxLength={RUSH_FOLLOW_UP_NOTE_MAX}
              autoComplete="off"
              placeholder="Invite to house dinner"
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>For</Label>
            <SearchablePicker
              trigger={
                <button
                  type="button"
                  aria-label={`For: ${forName ?? "Choose a member"}`}
                  className={cn(
                    INPUT_CLASSES,
                    "items-center justify-between gap-2 text-left",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {forName ?? "Choose a member"}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              }
              align="start"
              label="For"
              placeholder="Find a member"
              items={choices}
              nameOf={(m) => m.display_name}
              keyOf={(m) => m.user_id}
              itemClassName="min-h-8 text-sm pointer-coarse:min-h-11 pointer-coarse:text-base"
              renderItem={(m) => (
                <RushMemberName member={m} viewerId={viewerId} />
              )}
              onPick={(m) => setDraft({ ...draft, forUserId: m.user_id })}
            />
          </div>
          {problem ? (
            <p role="alert" className="text-sm text-destructive-text">
              {problem}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={setFollowUp.isPending}>
              Set follow-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
