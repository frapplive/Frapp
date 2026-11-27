import { Skeleton } from "@/components/shared/async-states";
import {
  SectionSkeleton,
  SkeletonRows,
} from "@/components/shared/page-skeletons";
import { SETTINGS_GROUP_FRAME } from "@/components/shared/settings-row";

/**
 * Discord import while its one read loads, inside the page's frame: a group
 * of rows and its footnote (#6031). Which state the import is in is not known
 * yet, so it draws the shape every state shares, rows in a settings group,
 * rather than any one of them.
 */
export function DiscordImportSkeleton() {
  return (
    <SectionSkeleton label="Loading the import" className="space-y-2">
      <SkeletonRows
        rows={2}
        lead="glyph"
        trailing={["w-4"]}
        trailingHeight="h-4"
        rowClassName="min-h-control-settings-row px-4 py-2"
        listClassName={SETTINGS_GROUP_FRAME}
      />
      <Skeleton aria-hidden="true" className="ml-1 h-[11px] w-[70%]" />
    </SectionSkeleton>
  );
}
