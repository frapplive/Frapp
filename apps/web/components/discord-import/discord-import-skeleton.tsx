import {
  SectionSkeleton,
  SkeletonSettingsGroup,
} from "@/components/shared/page-skeletons";

/**
 * Discord import while its one read loads, inside the page's frame: a group
 * of rows and its footnote (#6031). Which state the import is in is not known
 * yet, so it draws the shape every state shares, rows in a settings group,
 * rather than any one of them.
 */
export function DiscordImportSkeleton() {
  return (
    <SectionSkeleton label="Loading the import">
      <SkeletonSettingsGroup
        rows={2}
        lead="glyph"
        trailing={["w-4"]}
        footnote="w-[70%]"
      />
    </SectionSkeleton>
  );
}
