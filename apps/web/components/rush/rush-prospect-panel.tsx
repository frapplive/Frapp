"use client";

import { Plus, X } from "lucide-react";
import {
  rushMovableStages,
  rushRatingSummary,
  useChapterRoster,
  useRateRushCandidate,
  useSetRushCandidateTags,
  useVoteRushCandidate,
  type RushPipelineAccess,
  type RushPipelineCandidate,
  type RushStage,
  type RushTag,
  rushNotesMode,
  rushRowMark,
  rushLastContactLine,
} from "@repo/hooks";
import { formatDay } from "@repo/formatting";
import { RUSH_CLOSED_REASON_LABELS, sortRushStages } from "@repo/validation";
import {
  Panel,
  PanelBody,
  PanelContent,
  PanelHeader,
} from "@/components/shared/panel";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FOCUS_RING } from "@/components/ui/focus";
import { FieldRow, StaticValue } from "@/components/tasks/task-panel";
import { toastFailure } from "@/lib/failure-toast";
import { cn } from "@/lib/utils";
import { RushRatingControl } from "./rush-rating";
import { RushNotes } from "./rush-notes";
import { LogContactMenu, RushContactHistory } from "./rush-contacts";
import { RushFollowUpControl } from "./rush-follow-up";
import { RushOwnerControl, rushMemberOptions } from "./rush-owner";

export interface RushProspectPanelProps {
  candidate: RushPipelineCandidate | null;
  stages: readonly RushStage[];
  tags: readonly RushTag[];
  access: RushPipelineAccess;
  /** Writes are allowed now (the subscription gate, offline). */
  writable: boolean;
  /** `users.id`, for the notes' self-exclusion and authorship. */
  viewerId: string | null;
  /** The chapter's stale days, from the pipeline read. */
  staleDays: number;
  /** `YYYY-MM-DD` on this device (`rushLocalDayKey`). */
  today: string;
  /** The page's word for recruitment, for the way back ("Back to Rush"). */
  term: string;
  onClose: () => void;
  onMove: (
    candidate: RushPipelineCandidate,
    stages: readonly RushStage[],
  ) => void;
}

/**
 * A prospect opened from the board or the list: the app's docked panel, as a
 * task's is (`task-panel.tsx`), each field a label and its value, changed in
 * place and saved at once. It holds what a member decides by, in the order
 * they use it: where the prospect stands, what members think of them (the
 * viewer's own stars, the average, the vote), how the chapter has tagged
 * them, then the chapter's notes. Every control shows only to a role that
 * may use it (`rushPipelineAccess`).
 *
 * Its state comes first (#5934, rulebook § 6 "a record says its state
 * first"): "Last contacted Tue · by Chris" with Log contact beside it, then
 * Stage, Owner and Follow-up, the rows a recruiter works the prospect by; the
 * logged contacts sit above the notes.
 */
export function RushProspectPanel(props: RushProspectPanelProps) {
  const { candidate, term, onClose } = props;
  return (
    <Panel
      open={candidate !== null}
      onOpenChange={(open) => !open && onClose()}
      docked
      backLabel={`Back to ${term}`}
    >
      {candidate ? (
        <PanelContent aria-describedby={undefined}>
          <PanelHeader>{candidate.display_name}</PanelHeader>
          <PanelBody>
            <ProspectBody {...props} candidate={candidate} />
          </PanelBody>
        </PanelContent>
      ) : null}
    </Panel>
  );
}

function ProspectBody({
  candidate,
  stages,
  tags,
  access,
  writable,
  viewerId,
  staleDays,
  today,
  onMove,
}: RushProspectPanelProps & { candidate: RushPipelineCandidate }) {
  const rate = useRateRushCandidate();
  const roster = useChapterRoster();
  const members = rushMemberOptions(roster.data, viewerId);
  const vote = useVoteRushCandidate();
  const setTags = useSetRushCandidateTags();
  const rating = rushRatingSummary(candidate);
  const current = stages.find((stage) => stage.key === candidate.stage);
  // Every visible stage, plus the prospect's own if the chapter hid it, so
  // the picker always shows where they are.
  const options = sortRushStages(
    current && current.hidden
      ? [...rushMovableStages(stages), current]
      : rushMovableStages(stages),
  );
  const applied = tags.filter((tag) => candidate.tag_ids.includes(tag.id));
  const addable = tags.filter((tag) => !candidate.tag_ids.includes(tag.id));
  const canTag = access.writeNotes && writable;
  const closed = current?.category === "closed";
  const work = rushRowMark(candidate, staleDays, today, closed);
  // Nobody logs a contact with themself (`rush.md` § Contacts).
  const self = !!viewerId && candidate.user_id === viewerId;
  const viewerName =
    members.find((member) => member.user_id === viewerId)?.display_name ?? null;

  function saveTags(change: { add?: string; remove?: string }) {
    setTags.change(
      { candidateId: candidate.id, ...change },
      {
        onError: (error) =>
          toastFailure({
            title: "Couldn't change the tags",
            error,
            fallback: "Retry in a moment.",
          }),
      },
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">
          {rushLastContactLine(candidate, today)}
        </p>
        {access.add && !self ? (
          <LogContactMenu
            candidate={candidate}
            disabled={!writable}
            viewerName={viewerName}
          />
        ) : null}
      </div>
      <dl className="grid gap-1">
        <FieldRow label="Stage">
          {access.move ? (
            <div className="grid gap-1 px-2 py-1">
              <Select
                value={candidate.stage}
                disabled={!writable}
                onValueChange={(key) => {
                  const stage = stages.find((s) => s.key === key);
                  if (stage) onMove(candidate, [stage]);
                }}
              >
                <SelectTrigger aria-label="Stage" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((stage) => (
                    <SelectItem key={stage.key} value={stage.key}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {current?.category === "closed" && candidate.closed_reason ? (
                <span className="text-caption text-muted-foreground">
                  {RUSH_CLOSED_REASON_LABELS[candidate.closed_reason]}
                </span>
              ) : null}
            </div>
          ) : (
            <StaticValue>
              {current?.label ?? "Unknown stage"}
              {current?.category === "closed" && candidate.closed_reason
                ? ` · ${RUSH_CLOSED_REASON_LABELS[candidate.closed_reason]}`
                : ""}
            </StaticValue>
          )}
        </FieldRow>
        <FieldRow label="Owner">
          <RushOwnerControl
            candidate={candidate}
            access={access}
            writable={writable}
            viewerId={viewerId}
            members={members}
          />
        </FieldRow>
        {closed ? null : (
          <FieldRow label="Follow-up">
            <RushFollowUpControl
              candidate={candidate}
              canEdit={access.add && writable}
              stale={work?.tone === "stale"}
              closed={closed}
              today={today}
              viewerId={viewerId}
              members={members}
            />
          </FieldRow>
        )}
        {candidate.bid_status === "extended" ? (
          <FieldRow label="Bid">
            <span className="px-2 py-1.5">
              <Badge variant="success">Extended</Badge>
            </span>
          </FieldRow>
        ) : null}
        <FieldRow label="Added">
          <StaticValue>
            {`${candidate.created_by_name} · ${formatDay(candidate.created_at) ?? ""}`}
          </StaticValue>
        </FieldRow>
        {access.vote || rating ? (
          <FieldRow label="Rating">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              {access.vote ? (
                <RushRatingControl
                  name={candidate.display_name}
                  value={candidate.viewer_rating}
                  disabled={!writable}
                  onRate={(next) =>
                    rate.mutate(
                      { candidateId: candidate.id, rating: next },
                      {
                        onError: (error) =>
                          toastFailure({
                            title: "Couldn't save your rating",
                            error,
                            fallback: "Retry in a moment.",
                          }),
                      },
                    )
                  }
                />
              ) : null}
              {rating ? (
                <span className="text-sm text-muted-foreground">{rating}</span>
              ) : null}
            </div>
          </FieldRow>
        ) : null}
        {access.vote || candidate.vote_count !== undefined ? (
          <FieldRow label="Vote">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
              {access.vote ? (
                candidate.viewer_has_voted ? (
                  <span className="text-sm text-foreground">You voted</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!writable || vote.isPending}
                    onClick={() =>
                      vote.mutate(candidate.id, {
                        onError: (error) =>
                          toastFailure({
                            title: "Couldn't record your vote",
                            error,
                            fallback: "Retry in a moment.",
                          }),
                      })
                    }
                  >
                    Vote
                  </Button>
                )
              ) : null}
              {candidate.vote_count !== undefined ? (
                <span className="text-sm text-muted-foreground">
                  {candidate.vote_count === 1
                    ? "1 vote"
                    : `${candidate.vote_count} votes`}
                </span>
              ) : null}
            </div>
          </FieldRow>
        ) : null}
        <FieldRow label="Tags" alignTop>
          <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
            {applied.length === 0 && !canTag ? (
              <span className="text-sm text-muted-foreground">None</span>
            ) : null}
            {applied.map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-xs border border-border pl-2 text-caption font-semibold text-foreground",
                  canTag ? "pr-0.5" : "pr-2",
                )}
              >
                {tag.label}
                {canTag ? (
                  <button
                    type="button"
                    aria-label={`Remove ${tag.label}`}
                    onClick={() => saveTags({ remove: tag.id })}
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-card-hover hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            ))}
            {canTag && addable.length > 0 ? (
              <SearchablePicker
                trigger={
                  <button
                    type="button"
                    aria-label={`Add a tag to ${candidate.display_name}`}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border px-2 text-caption font-semibold text-muted-foreground hover:border-input hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Tag
                  </button>
                }
                align="start"
                label="Tags"
                placeholder="Find a tag"
                items={addable}
                nameOf={(tag) => tag.label}
                keyOf={(tag) => tag.id}
                itemClassName="min-h-8 text-sm pointer-coarse:min-h-11 pointer-coarse:text-base"
                renderItem={(tag) => (
                  <span className="min-w-0 flex-1 break-words">
                    {tag.label}
                  </span>
                )}
                onPick={(tag) => saveTags({ add: tag.id })}
              />
            ) : null}
            {canTag && tags.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                The chapter has no tags yet.
              </span>
            ) : null}
          </div>
        </FieldRow>
      </dl>
      <RushContactHistory
        key={`contacts-${candidate.id}`}
        candidateId={candidate.id}
        today={today}
      />
      {rushNotesMode(access, candidate.user_id, viewerId) ? (
        <div className="border-t border-border pt-4">
          <RushNotes
            key={candidate.id}
            candidate={candidate}
            access={access}
            viewerId={viewerId}
            writable={writable}
          />
        </div>
      ) : null}
    </div>
  );
}
