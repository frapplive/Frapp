import {
  PageSkeleton,
  SectionSkeleton,
  SkeletonRows,
  SkeletonSectionLabel,
} from "@/components/shared/page-skeletons";

/** The School section's one row, then the Councils section's rows. */
function Sections() {
  return (
    <>
      <div className="space-y-2">
        <SkeletonSectionLabel width="w-16" />
        <SkeletonRows
          rows={1}
          lines={2}
          lead="tile"
          rowClassName="min-h-14 py-2"
        />
      </div>
      <div className="space-y-2">
        <SkeletonSectionLabel width="w-20" />
        <SkeletonRows
          rows={2}
          lines={2}
          lead="tile"
          trailing={["w-24"]}
          rowClassName="min-h-14 py-2"
        />
      </div>
    </>
  );
}

export function SchoolAndCouncilSectionsSkeleton() {
  return (
    <SectionSkeleton label="Loading your school and councils">
      <Sections />
    </SectionSkeleton>
  );
}

/** `/affiliations` while it loads (#5974). */
export function SchoolAndCouncilPageSkeleton() {
  return (
    <PageSkeleton label="Loading your school and councils">
      <Sections />
    </PageSkeleton>
  );
}
