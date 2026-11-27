import { Skeleton } from "@/components/shared/async-states";
import {
  PageSkeleton,
  SkeletonFrame,
  SkeletonSectionLabel,
} from "@/components/shared/page-skeletons";
import {
  RUSH_BOARD_CLASS,
  RUSH_COLUMN_CLASS,
  RUSH_EMPTY_COLUMN_CLASS,
} from "./rush-board-layout";

/**
 * Cards per stage column, tapering the way a real pipeline does, with the
 * later stages empty and folded as early in rush they are
 * (`RUSH_EMPTY_COLUMN_CLASS`), so the board doesn't jump on load.
 */
const COLUMN_CARDS = [3, 2, 1, 0, 0, 0] as const;

/**
 * `/rush` while it loads: the board it opens on (`useListLayout("rush")`
 * defaults to it), each stage column a label and count over cards in the
 * real card's frame, with its name, who added them and a tag chip.
 */
export function RushPageSkeleton() {
  return (
    <PageSkeleton label="Loading prospects">
      <div aria-hidden="true" className={RUSH_BOARD_CLASS}>
        {COLUMN_CARDS.map((cards, column) => (
          <section
            key={column}
            className={cards > 0 ? RUSH_COLUMN_CLASS : RUSH_EMPTY_COLUMN_CLASS}
          >
            <SkeletonSectionLabel width="w-20" count />
            <div className="space-y-2">
              {Array.from({ length: cards }, (_, card) => (
                <SkeletonFrame key={card} className="space-y-2 p-3">
                  <Skeleton className="h-[13px] w-[70%]" />
                  <Skeleton className="h-[11px] w-[50%]" />
                  <Skeleton className="h-5 w-14 rounded-md" />
                </SkeletonFrame>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageSkeleton>
  );
}
