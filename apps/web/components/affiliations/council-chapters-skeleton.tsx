import {
  PageSkeleton,
  SectionSkeleton,
  SkeletonRows,
  SkeletonSectionLabel,
} from "@/components/shared/page-skeletons";

/** The member chapters: a mark, the name over its kind and school. */
function ChapterRows() {
  return (
    <div className="space-y-2">
      <SkeletonSectionLabel width="w-28" count />
      <SkeletonRows
        rows={5}
        lines={2}
        lead="tile"
        rowClassName="min-h-14 py-2"
      />
    </div>
  );
}

/** The list while it loads, under the page's live header. */
export function CouncilChapterRowsSkeleton() {
  return (
    <SectionSkeleton label="Loading chapters">
      <ChapterRows />
    </SectionSkeleton>
  );
}

/** `/chapters` while it loads (#5974). */
export function CouncilChaptersPageSkeleton() {
  return (
    <PageSkeleton label="Loading chapters">
      <ChapterRows />
    </PageSkeleton>
  );
}
