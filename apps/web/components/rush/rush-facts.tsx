import type { RushPipelineCandidate, RushTag } from "@repo/hooks";
import { Badge } from "@/components/ui/badge";
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
  const applied = tags.filter((tag) => tagIds.includes(tag.id));
  if (applied.length === 0) return null;
  const shown = max === undefined ? applied : applied.slice(0, max);
  const more = applied.length - shown.length;
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

/**
 * Bid state, which is not a stage (`spec/behavior/ifc-recruitment.md`
 * § Stages): the board shows it as a badge, and only once a bid is out.
 */
export function RushBidBadge({
  candidate,
}: {
  candidate: Pick<RushPipelineCandidate, "bid_status">;
}) {
  if (candidate.bid_status !== "extended") return null;
  return <Badge variant="success">Bid extended</Badge>;
}
