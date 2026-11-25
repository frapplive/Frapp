import type { ReactNode } from "react";
import { ListRowSkeleton, ListSection } from "@/components/list-section";
import { SETTINGS_SEARCH_COPY } from "@repo/hooks/settings-search";
import { InlineNote } from "@/components/inline-note";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { useIsCouncil } from "@/lib/tenant-kind";

/**
 * A Chapter settings page's body while the chapter's settings load or fail
 * (#6027): rows of skeleton, then the page; or the error card with a retry,
 * never a page of empty fields that fill in under the officer's thumb.
 *
 * A council never reads the chapter's config (#5933), so its read never
 * starts: there the page says these are changed on the web dashboard rather
 * than loading for good.
 */
export function ChapterPageState({
  query,
  children,
}: {
  query: {
    data: unknown;
    isError: boolean;
    isRefetching: boolean;
    refetch: () => unknown;
  };
  children: ReactNode;
}) {
  const council = useIsCouncil();
  if (query.data !== undefined) return <>{children}</>;
  if (council) return <InlineNote>{SETTINGS_SEARCH_COPY.onWeb}</InlineNote>;
  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load chapter settings"
        body="Check your connection and try again."
        onRetry={() => void query.refetch()}
        isRetrying={query.isRefetching}
      />
    );
  }
  return (
    <SkeletonRegion label="Loading chapter settings">
      <ListSection>
        {[0, 1, 2, 3].map((i) => (
          <ListRowSkeleton key={i} index={i} />
        ))}
      </ListSection>
    </SkeletonRegion>
  );
}
