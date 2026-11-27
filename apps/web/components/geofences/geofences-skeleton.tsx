import {
  SectionSkeleton,
  SkeletonRows,
} from "@/components/shared/page-skeletons";
import { SETTINGS_GROUP_FRAME } from "@/components/shared/settings-row";

/**
 * Zone rows in their settings group (#6031): the map-pin glyph, the name over
 * what it earns, the chevron.
 */
function ZoneRows() {
  return (
    <div aria-hidden="true">
      <SkeletonRows
        rows={3}
        lead="glyph"
        trailing={["w-4"]}
        trailingHeight="h-4"
        rowClassName="min-h-control-settings-row px-4 py-2"
        listClassName={SETTINGS_GROUP_FRAME}
      />
    </div>
  );
}

/** The zone list on Chapter settings' Study zones page while it loads. */
export function GeofenceRowsSkeleton({
  className = "mt-4 space-y-4",
}: {
  className?: string;
}) {
  return (
    <SectionSkeleton label="Loading study zones" className={className}>
      <ZoneRows />
    </SectionSkeleton>
  );
}
