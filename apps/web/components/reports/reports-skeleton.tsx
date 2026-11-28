import { Skeleton } from "@/components/shared/async-states";
import {
  SectionSkeleton,
  SkeletonSectionLabel,
  SkeletonSettingsGroup,
} from "@/components/shared/page-skeletons";

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
        <SkeletonSettingsGroup
          rows={3}
          lines={1}
          trailing={["w-28"]}
          trailingHeight="h-6"
          footnote="w-[45%]"
        />
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
