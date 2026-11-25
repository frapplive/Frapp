import type { ReactNode } from "react";
import { ListRowSkeleton, ListSection } from "@/components/list-section";
import { ErrorState, SkeletonRegion } from "@/components/state-block";

/**
 * A Chapter settings page's body while the chapter's settings load or fail
 * (#6027): rows of skeleton, then the page; or the error card with a retry,
 * never a page of empty fields that fill in under the officer's thumb.
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
  if (query.data !== undefined) return <>{children}</>;
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
