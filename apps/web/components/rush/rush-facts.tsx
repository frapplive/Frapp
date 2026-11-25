import {
  rushAppliedTags,
  rushBidBadge,
  rushTagOverflow,
  type RushPipelineCandidate,
  type RushTag,
} from "@repo/hooks";
import { Badge } from "@/components/ui/badge";
import type { RushRowMark } from "@repo/hooks";
import { cn } from "@/lib/utils";

/**
 * A prospect's tags as small chips, in the chapter's list order. On a card
 * they cap at `max` plus a count (rulebook § 3, real scale); the panel and
 * the list show them all. Tags are metadata, so `outline`, never a status
 * colour.
 */
export function RushTagChips({
  tagIds,
  tags,
  max,
  className,
}: {
  tagIds: readonly string[];
  tags: readonly RushTag[];
  max?: number;
  className?: string;
}) {
  const applied = rushAppliedTags(tagIds, tags);
  if (applied.length === 0) return null;
  const { shown, more } = rushTagOverflow(applied, max ?? applied.length);
  return (
    <span className={cn("flex min-w-0 flex-wrap gap-1", className)}>
      {shown.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="max-w-full truncate text-foreground"
        >
          {tag.label}
        </Badge>
      ))}
      {more > 0 ? (
        <Badge variant="outline" aria-label={`${more} more tags`}>
          +{more}
        </Badge>
      ) : null}
    </span>
  );
}

/** A bid badge's colour by tone: out and accepted read as good news. */
const BID_BADGE_VARIANT = {
  out: "info",
  waiting: "warning",
  done: "success",
  ended: "outline",
} as const;

/**
 * Bid state, which is not a stage (`spec/behavior/ifc-recruitment.md`
 * § Stages): a badge once a bid is out, in `rushBidBadge`'s words, so a
 * recorded acceptance reads "Waiting to confirm" (#5973).
 */
export function RushBidBadge({
  candidate,
}: {
  candidate: Pick<
    RushPipelineCandidate,
    "bid_state" | "bid_acceptance_recorded_at"
  >;
}) {
  const badge = rushBidBadge(candidate);
  if (!badge) return null;
  return (
    <Badge variant={BID_BADGE_VARIANT[badge.tone]} className="shrink-0">
      {badge.label}
    </Badge>
  );
}

/**
 * A prospect's follow-up or stale flag on a card or a list row
 * (`rushRowMark` in `@repo/hooks`): a follow-up not yet due is a muted fact; one due
 * today or earlier, and "Needs follow-up", are the warning badge, as an
 * overdue task's due is a status.
 */
export function RushFollowUpFact({ state }: { state: RushRowMark | null }) {
  if (!state) return null;
  if (state.tone === "planned") {
    return (
      <span className="truncate text-caption text-muted-foreground">
        {state.label}
      </span>
    );
  }
  return (
    <Badge variant="warning" className="shrink-0 whitespace-nowrap">
      {state.label}
    </Badge>
  );
}
