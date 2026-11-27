import { Skeleton } from "@/components/shared/async-states";
import {
  SectionSkeleton,
  SkeletonRows,
  SkeletonSectionLabel,
} from "@/components/shared/page-skeletons";
import { SETTINGS_GROUP_FRAME } from "@/components/shared/settings-row";

/**
 * The Reports form while the export permission is still being checked, in
 * its settings-rows shape (#6031): the group of picker rows (Report, Event,
 * Dates) and its footnote, the two buttons, then the Preview heading with
 * Export.
 */
export function ReportsFormSkeleton() {
  return (
    <SectionSkeleton label="Checking your chapter permissions">
      <div aria-hidden="true" className="space-y-4">
        <div className="space-y-2">
          <SkeletonRows
            rows={3}
            lines={1}
            trailing={["w-28"]}
            trailingHeight="h-6"
            rowClassName="min-h-control-settings-row px-4 py-1.5"
            listClassName={SETTINGS_GROUP_FRAME}
          />
          <Skeleton className="ml-1 h-[11px] w-[45%]" />
        </div>
        <div className="flex justify-end gap-2">
          <Skeleton className="h-control-small w-[128px] rounded-md" />
          <Skeleton className="h-control-small w-[148px] rounded-md" />
        </div>
      </div>
      <div aria-hidden="true" className="flex items-center justify-between">
        <SkeletonSectionLabel width="w-20" />
        <Skeleton className="h-control-small w-[96px] rounded-md" />
      </div>
    </SectionSkeleton>
  );
}
