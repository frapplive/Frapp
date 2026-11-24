import {
  PageSkeleton,
  SectionSkeleton,
  SkeletonRows,
  SkeletonSectionLabel,
} from "@/components/shared/page-skeletons";
import { SkeletonText } from "@/components/shared/async-states";
import type { MeetingSummary } from "@repo/hooks";
import { meetingWhenLabel } from "@repo/validation";

/**
 * `/meetings/:id` while it loads: the header as it will be (named from the
 * Minutes list when it is already loaded, so a tap from the list opens on
 * the meeting, not a blank page), then sections shaped like the minutes.
 */
export function MinutesPageSkeleton({
  row = null,
}: {
  row?: Pick<MeetingSummary, "event_name" | "event_start_time"> | null;
}) {
  return (
    <PageSkeleton
      label="Loading minutes"
      className="mx-auto max-w-3xl space-y-8"
    >
      {row ? (
        <div className="space-y-1 border-b border-border pb-3">
          <h2 className="truncate text-xl font-bold leading-tight">
            {row.event_name}
          </h2>
          <p className="text-caption text-muted-foreground">
            {meetingWhenLabel(row.event_start_time)}
          </p>
        </div>
      ) : (
        <SkeletonText lines={2} />
      )}
      <div className="space-y-2">
        <SkeletonSectionLabel width="w-16" />
        <SkeletonText lines={3} />
      </div>
      <div className="space-y-2 border-t border-border pt-6">
        <SkeletonSectionLabel width="w-24" />
        <SkeletonText lines={2} />
      </div>
      <div className="space-y-2 border-t border-border pt-6">
        <SkeletonSectionLabel width="w-28" />
        <SkeletonText lines={4} />
      </div>
    </PageSkeleton>
  );
}

/** `/meetings/:id/notes` while it loads: the heading, then the notes box. */
export function NoteTakerPageSkeleton() {
  return (
    <PageSkeleton label="Loading notes" className="mx-auto max-w-3xl space-y-4">
      <SkeletonText lines={2} />
      <SkeletonText lines={8} />
    </PageSkeleton>
  );
}
