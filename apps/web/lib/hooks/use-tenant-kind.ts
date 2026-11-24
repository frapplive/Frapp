"use client";

import { useCurrentChapter } from "@repo/hooks";
import {
  COUNCIL_PROFILES,
  isCouncilType,
  isTenantKind,
  type CouncilType,
  type TenantKind,
} from "@repo/validation";
import { useChapterStore } from "@/lib/stores/chapter-store";

/**
 * What the active tenant is (ADR-27): a chapter, or a council (#5933).
 *
 * A council is a `chapters` row with `kind = 'council'`, and it is served by
 * only the routes its space uses (chat, members, roles, invites, the audit log,
 * `chapters/current`); every other chapter route answers 403
 * `chapter.context.invalid`. So the web shell asks this before drawing a door
 * to a chapter feature: the nav, Find, Settings and the home view.
 *
 * Read from `GET /v1/chapters/current`, the read the module gate
 * (`useChapterModuleGate`) answers from, so the two settle together.
 * `undefined` until it has answered: callers treat that as "don't gate", as
 * the module gate does, so nothing flashes out of a chapter's nav on first
 * paint. A payload from an API older than `kind` reads as a chapter, which is
 * what every tenant was then.
 */
export function useTenantKind(): TenantKind | undefined {
  return useTenantIdentity().kind;
}

/** Whether the active tenant is a council; false while unknown. */
export function useIsCouncil(): boolean {
  return useTenantKind() === "council";
}

export interface TenantIdentity {
  kind: TenantKind | undefined;
  /** A council's type, or null on a chapter or while unknown. */
  councilType: CouncilType | null;
}

/** The active tenant's kind and, for a council, its type. */
export function useTenantIdentity(): TenantIdentity {
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const current = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  return tenantIdentityOf(
    activeChapterId,
    current.data as TenantRow | undefined,
  );
}

type TenantRow = { kind?: unknown; council_type?: unknown };

/** Pure half of {@link useTenantIdentity}, for the spec. */
export function tenantIdentityOf(
  activeChapterId: string | null,
  current: TenantRow | undefined,
): TenantIdentity {
  if (!activeChapterId || !current)
    return { kind: undefined, councilType: null };
  const kind = isTenantKind(current.kind) ? current.kind : "chapter";
  return {
    kind,
    councilType:
      kind === "council" && isCouncilType(current.council_type)
        ? current.council_type
        : null,
  };
}

/**
 * The line a council reads under its name where a chapter shows its school:
 * its type ("Interfraternity Council"). Null for a chapter.
 */
export function councilTypeLabel(type: unknown): string | null {
  return isCouncilType(type) ? COUNCIL_PROFILES[type].label : null;
}
