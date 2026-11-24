import { useCurrentChapter, type ChapterMembershipSummary } from "@repo/hooks";
import { COUNCIL_PROFILES, isCouncilType } from "@repo/validation";

/**
 * What the active tenant is (ADR-27): a chapter, or a council
 * (`spec/architecture/school-layer.md` § 2.3, #5933). A council runs in the
 * chapter's shell, so the phone keeps its four tabs and asks this wherever a
 * screen would otherwise read a chapter-only route: everything under
 * Activity, events, tasks, points, study, service and the rest answer a
 * council with 403 `chapter.context.invalid`.
 */
export type TenantKind = "chapter" | "council";

interface KindSource {
  kind?: string | null;
}

/**
 * The active tenant's kind from its own read (`GET /v1/chapters/current`,
 * which every tab already reads for the chapter's name and accent), or
 * `null` while it hasn't answered.
 *
 * A read that answered without the field (an API from before councils) is a
 * chapter, and so is one that failed with nothing cached. Failing open is
 * safe: the API, not this, keeps a council away from chapter routes, and a
 * chapter must never lose its features to a read that failed.
 */
export function resolveTenantKind({
  current,
  currentFailed = false,
}: {
  current?: KindSource | null;
  currentFailed?: boolean;
}): TenantKind | null {
  if (current) return current.kind === "council" ? "council" : "chapter";
  return currentFailed ? "chapter" : null;
}

/** The active tenant's kind, or `null` while its read is out. */
export function useTenantKind(): TenantKind | null {
  const current = useCurrentChapter();
  return resolveTenantKind({
    current: current.data,
    currentFailed: current.isError && current.data === undefined,
  });
}

/** True only once the open tenant is known to be a council. */
export function useIsCouncil(): boolean {
  return useTenantKind() === "council";
}

/**
 * True once the open tenant is known to be a chapter: the gate for a read
 * that only a chapter's routes answer. It waits for the kind rather than
 * guessing, so a council never sends one; the reads it holds back are cached
 * by the time a member reaches them (Chat home's title reads the same
 * chapter first).
 */
export function useServesChapterFeatures(): boolean {
  return useTenantKind() === "chapter";
}

/**
 * The notification switches a council member is offered: the chapter
 * catalog's other categories (events, points, tasks, service hours, billing,
 * the weekly recap) are features a council doesn't have (#5933).
 */
export const COUNCIL_NOTIFICATION_CATEGORIES: ReadonlySet<string> = new Set([
  "members",
]);

/**
 * A row of `GET /v1/chapters` as the server sends it: `@repo/hooks`'
 * hand-written `ChapterMembershipSummary` predates the tenant kind, so the
 * two fields a council row carries are declared here (the SDK's
 * `ChapterMembershipSummaryDto` has them).
 */
export type TenantMembership = ChapterMembershipSummary & {
  kind?: "chapter" | "council";
  chapter: ChapterMembershipSummary["chapter"] & {
    council_type?: string | null;
  };
};

/**
 * A row's second line: a chapter's school, or a council's type before its
 * school ("Interfraternity Council · Rensselaer Polytechnic Institute"), so
 * a council reads as one beside the member's chapters (#5933).
 */
export function tenantRowBody(membership: TenantMembership): string {
  const { chapter } = membership;
  const type = chapter.council_type;
  if (membership.kind !== "council" || !isCouncilType(type)) {
    return chapter.university;
  }
  return [COUNCIL_PROFILES[type].label, chapter.university]
    .filter(Boolean)
    .join(" · ");
}
