import {
  SectionSkeleton,
  SkeletonSettingsGroup,
} from "@/components/shared/page-skeletons";

/**
 * Zone rows in their settings group (#6031): the map-pin glyph, the name over
 * what it earns, the chevron.
 */
function ZoneRows() {
  return <SkeletonSettingsGroup rows={3} lead="glyph" trailing={["w-4"]} />;
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
