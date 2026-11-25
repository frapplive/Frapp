"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAccessibleChapters, useCurrentChapter } from "@repo/hooks";
import type { ChapterMembershipSummary } from "@repo/hooks";
import type { ChapterMark } from "@repo/validation";
import { chapterMarkFor, CrestTile } from "@/components/layout/crest-tile";
import { useToast } from "@/lib/hooks/use-toast";
import { useSelectChapter } from "@/lib/auth/select-chapter";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { cn } from "@/lib/utils";
import { FOCUS_RING_SHELL } from "@/components/ui/focus";
import { Skeleton } from "@/components/shared/async-states";
import { useConfirmDropBulkUploads } from "@/components/backwork/bulk/use-confirm-drop-bulk-uploads";
import { councilTypeLabel } from "@/lib/hooks/use-tenant-kind";

/**
 * The line under a tenant in the switch list: a chapter's school, a council's
 * type ("Interfraternity Council"), so a council reads as one beside the
 * chapters (#5933).
 */
export function membershipSubtitle(
  membership: ChapterMembershipSummary,
): string | null {
  if (membership.kind === "council") {
    return councilTypeLabel(membership.chapter?.council_type);
  }
  return membership.chapter?.university || null;
}

/**
 * The chapter the member is in, and moving between the ones they belong to.
 *
 * The sidebar reads it once and hands it to both of its ends (#5946): the
 * head draws the chapter's mark and name as a label, and the member's menu at
 * the foot lists the other chapters to switch to (`account-menu.tsx`). Until
 * then the name was itself a menu atop the nav (`chapter-nav-header.tsx`,
 * deleted); with the member's own menu at the foot, a second menu at the top
 * was two doors for one kind of thing, and Claude, Slack and Discord keep one.
 *
 * What it deliberately keeps from that menu:
 *
 * - **Switching goes through `useSelectChapter`**, never the chapter store
 *   directly. The `active_chapter_id` JWT claim outranks the `x-chapter-id`
 *   header, so writing the store alone puts the two in disagreement and earns
 *   a 403 on every later request (spec/behavior/multi-tenancy.md).
 * - **The recovery case.** A persisted chapter that is gone (membership
 *   revoked, or a stale id from another account in this browser) leaves the
 *   member with no way out, so the head draws its own way out
 *   (`ChapterLabel`).
 */
export type ChapterSwitcher = {
  activeChapterId: string | null;
  /** The active chapter's mark and name, once read. */
  identity: { mark: ChapterMark; name: string } | null;
  /** The chapter read failed, so there is no name to draw. */
  failed: boolean;
  /** Every chapter the member belongs to, by name. */
  memberships: ChapterMembershipSummary[];
  /** The ones to switch to: every membership but the active one. */
  otherChapters: ChapterMembershipSummary[];
  /** The persisted chapter is none of the member's: they must pick one. */
  stranded: boolean;
  /** The chapter being switched to, until the document reloads. */
  switchingTo: string | null;
  select: (chapterId: string) => void;
  /** The "drop your uploads?" dialog a switch may raise; render it once. */
  dialog: ReactNode;
};

export function useChapterSwitcher(): ChapterSwitcher {
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const { data: chapterData, isError: failed } = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  const { data: membershipData, isSuccess } = useAccessibleChapters();
  const selectChapter = useSelectChapter();
  const { toast } = useToast();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const memberships = useMemo(() => {
    const rows: ChapterMembershipSummary[] = Array.isArray(membershipData)
      ? membershipData
      : [];
    return [...rows].sort((a, b) =>
      (a.chapter?.name ?? "").localeCompare(b.chapter?.name ?? ""),
    );
  }, [membershipData]);
  const otherChapters = useMemo(
    () => memberships.filter((m) => m.chapter_id !== activeChapterId),
    [memberships, activeChapterId],
  );
  const stranded =
    isSuccess &&
    memberships.length > 0 &&
    !memberships.some((m) => m.chapter_id === activeChapterId);

  // The crest is the chapter mark (`chapterMarkFor`, `crest-tile.tsx`).
  const identity = useMemo(() => {
    if (!chapterData) return null;
    return { mark: chapterMarkFor(chapterData), name: chapterData.name };
  }, [chapterData]);

  const { confirmDrop, confirmDropDialog } = useConfirmDropBulkUploads();

  const select = useCallback(
    (chapterId: string) => {
      if (switchingTo || chapterId === activeChapterId) return;
      void (async () => {
        if (!(await confirmDrop("switch"))) return;
        setSwitchingTo(chapterId);
        try {
          const switched = await selectChapter(chapterId);
          if (!switched) {
            toast({
              variant: "destructive",
              title: "Couldn't switch chapter",
              description:
                "You're still in your previous chapter. Check your connection and try again.",
            });
            setSwitchingTo(null);
            return;
          }
          // Full reload into the dashboard root rather than an in-place
          // re-render.
          //
          // Dropping the query cache handles cached *server* data, but a
          // chapter id is threaded through client state the cache knows
          // nothing about: the chat shell holds the selected channel id
          // (which 404s under the new chapter), and the realtime manager
          // holds live Supabase subscriptions keyed to the old chapter's
          // channels. Enumerating that state is the same losing game as
          // enumerating query keys, and a chapter switch is a rare,
          // deliberate, whole-context action — so start from a clean slate.
          //
          // `switchingTo` is intentionally left set: the spinner stays up
          // until the document is replaced, instead of flashing back to the
          // old chapter.
          window.location.assign("/");
        } catch {
          toast({
            variant: "destructive",
            title: "Couldn't switch chapter",
            description: "Something went wrong. Please try again.",
          });
          setSwitchingTo(null);
        }
      })();
    },
    [switchingTo, activeChapterId, confirmDrop, selectChapter, toast],
  );

  return {
    activeChapterId,
    identity,
    failed,
    memberships,
    otherChapters,
    stranded,
    switchingTo,
    select,
    dialog: confirmDropDialog,
  };
}

/**
 * The chapter's mark and name in the sidebar's head: a label, not a control
 * (#5946). It says where the member is; what they can do about the chapter is
 * in their menu at the foot.
 *
 * Two states outrank the label. Mid-switch the query cache is dropped, so it
 * holds its place with the switch's own line rather than flashing an empty
 * head. And a member stranded on a chapter they no longer belong to gets the
 * recovery card here, the first thing in the column, because every request
 * they make is refused until they pick one.
 */
export function ChapterLabel({
  switcher,
  collapsed,
}: {
  switcher: ChapterSwitcher;
  /** The rail: the mark alone, the name its tooltip. */
  collapsed: boolean;
}) {
  const { identity, failed, switchingTo, stranded, memberships } = switcher;

  if (switchingTo) {
    return (
      <div
        className={cn(
          "flex h-10 min-w-0 flex-1 items-center gap-2.5 px-1.5 text-caption text-muted-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        {collapsed ? null : <span role="status">Switching chapter...</span>}
      </div>
    );
  }

  if (stranded) {
    /*
     * In the rail this card has nowhere to go: its min-content width is wider
     * than the 40px slot. A recovery state outranks a width preference, so it
     * renders at full width regardless and lets the rail be wrong for as long
     * as it is showing.
     */
    return (
      <div
        className={cn(
          "my-1 min-w-0 flex-1 space-y-2 rounded-[10px] border border-destructive/45 bg-destructive-tint px-2.5 py-2",
          collapsed && "w-[200px] flex-none",
        )}
      >
        <p className="flex items-center gap-1.5 text-caption font-semibold text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {switcher.activeChapterId
            ? "Chapter unavailable"
            : "No chapter selected"}
        </p>
        <p className="text-caption text-muted-foreground">
          {switcher.activeChapterId
            ? "You no longer have access to the chapter you were in. Pick one to continue:"
            : "Pick a chapter to continue:"}
        </p>
        <ul className="space-y-1">
          {memberships.map((membership) => (
            <li key={membership.chapter_id}>
              <button
                type="button"
                onClick={() => switcher.select(membership.chapter_id)}
                /*
                 * `hover:bg-popover`, not `hover:bg-card`. A row seated on
                 * `--surface-1` moving to `--card` measures 1.0486:1 on the
                 * greenfield ladder, under `INDISTINGUISHABLE` — the bound the
                 * contrast fixture treats as "reads as the same colour".
                 * Skipping to the next step up is a hover a person can
                 * actually see.
                 */
                className={cn(
                  "w-full truncate rounded-xs border border-border bg-surface-1 px-2 py-1.5 text-left text-caption text-foreground hover:bg-popover",
                  FOCUS_RING_SHELL,
                )}
              >
                {membership.chapter?.name ?? "Untitled chapter"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /*
    Still resolving: the tile and the name are placeholders in their own
    geometry rather than a "--" crest and a "Loading..." label, which read as
    a chapter actually named that (`components.md` §10, content-shaped).
  */
  const loading = !identity && !failed;
  const mark: ChapterMark = identity?.mark ?? {
    logoUrl: null,
    text: "!",
    source: "initials",
  };
  const name = identity?.name ?? (failed ? "Chapter unavailable" : null);

  return (
    <div
      data-chapter-label=""
      title={collapsed ? (name ?? undefined) : undefined}
      // `flex-1` in the rail too: the head is a row that doesn't centre, so a
      // label only as wide as its crest sat at the head's left padding, 5px
      // left of the icons under it (Paul, 2026-11-24). Filling the head,
      // `justify-center` puts the crest on the rail's centre line.
      className={cn(
        "flex h-10 min-w-0 flex-1 items-center gap-2.5",
        collapsed ? "justify-center" : "pl-1.5",
      )}
    >
      {loading ? (
        <Skeleton className="h-7 w-7 shrink-0 rounded-[8px]" />
      ) : (
        <CrestTile mark={mark} />
      )}
      {collapsed ? (
        name ? (
          <span className="sr-only">{name}</span>
        ) : null
      ) : loading ? (
        <span className="min-w-0 flex-1">
          <Skeleton className="h-[13px] w-28" />
          <span className="sr-only">Loading chapter</span>
        </span>
      ) : (
        <span
          title={name ?? undefined}
          className="min-w-0 flex-1 truncate text-sm font-bold text-foreground"
        >
          {name}
        </span>
      )}
    </div>
  );
}
