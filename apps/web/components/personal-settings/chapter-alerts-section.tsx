"use client";

import {
  useActiveChapterId,
  useCurrentChapter,
  useNotificationPreferences,
  usePermissionList,
  useUpdateNotificationPreference,
} from "@repo/hooks";
import {
  chapterAlertsFootnote,
  personalSettingsGroupLabel,
  rowsToNotificationCategoryState,
  shownNotificationCategories,
  type NotificationCategoryKey,
} from "@repo/validation";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/lib/hooks/use-toast";
import { anyReadUncached, pausedRead } from "@/components/shared/async-states";
import { InlineNote } from "@/components/shared/inline-note";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { SectionLabel } from "@/components/shared/section-label";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { useNetwork } from "@/lib/providers/network-provider";
import { getErrorMessage } from "@/lib/utils";
import { NotificationSettingsSkeleton } from "@/components/personal-settings/personal-settings-skeleton";
import { ChatLevelRow } from "@/components/personal-settings/chat-level-control";

/**
 * The offline note under the notification switches, referenced by every one of
 * them through `aria-describedby` while OFFLINE. Named once so the footnote
 * and its referrers cannot drift apart into a dangling id.
 */
const OFFLINE_NOTE_ID = "notification-categories-offline";

/**
 * Settings → Notifications, the chapter's group: the chat level, then which
 * of the active chapter's notification categories the member receives
 * (#6032; its own "Chapter alerts" page until then, #3856).
 * `notification_preferences` is keyed `(user_id, chapter_id, category)`, so
 * the group is headed with the chapter's name and changes with the chapter
 * switcher. With no active chapter there is nothing to read and the query
 * stays disabled; see the `chapterId` branch below. The phone's
 * Notifications page draws the same rows in the same order.
 */
export function ChapterAlertsSection() {
  const { toast } = useToast();
  const { isOffline } = useNetwork();
  const chapterId = useActiveChapterId();
  const preferencesQuery = useNotificationPreferences(chapterId ?? "");
  const updatePreference = useUpdateNotificationPreference();
  // Decides which audience-gated switches are drawn (the join switch, #4008).
  const permissions = usePermissionList();
  const heading = personalSettingsGroupLabel(
    "chapter",
    useCurrentChapter().data?.name,
  );

  /*
   * ...and a *third* query is a third set, by the same rule (#564).
   *
   * Two rungs here have no counterpart on the cards above, and the reason is
   * NOT that a disabled query spins a skeleton — it does not. v5 derives
   * `isLoading = isPending && isFetching`, and a disabled query never fetches,
   * so `isLoading` is false and the loading rung is simply never reached. An
   * earlier version of this comment claimed otherwise; the rungs earn their
   * place for a different and more serious reason.
   *
   * Without them the card falls through every branch to `null` and renders its
   * live-looking switches whose clicks `handleCategoryToggle` silently drops at
   * its own `!chapterId` guard — a control that looks operable and does
   * nothing, which is the dead-control failure the shared catalog exists to
   * prevent.
   *
   * The no-chapter copy is phrased as an instruction rather than a claim about
   * the member's account, and that is load-bearing. `activeChapterId` comes
   * from a persisted zustand store that initializes to `null`
   * (`chapter-store.ts`), so before rehydration — and in the server-rendered
   * HTML — a member WITH a chapter is indistinguishable from one without;
   * `subscription-gate.tsx` records the same window. "Select a chapter" is
   * true in both states, where "you have no chapter" would be a confident
   * falsehood in one of them.
   *
   * Gating this rung on the store's `hasHydrated` was tried and reverted: it
   * can never become true when `localStorage` access throws (privacy modes,
   * blocked site data). `createJSONStorage` returns `undefined` there
   * (`zustand/esm/middleware.mjs:283`) and `hydrate()` early-returns on
   * `!storage` (`:382`) WITHOUT invoking the rehydration callback, so the flag
   * sticks at `false` and the card would show a permanent skeleton — to
   * precisely the members for whom "no active chapter" is actually true, since
   * nothing can have been persisted. A wrong-for-an-instant sentence is worth
   * fixing; a card that never resolves is not the way to fix it.
   *
   * `data === undefined` guards the offline and error rungs for the reason the
   * screen-scale block above spells out: TanStack keeps `data` through a
   * background refetch failure, and switches drawn from a still-held cache are
   * better than a card that vanishes when a focus refetch blips.
   */
  const preferencesPaused = pausedRead(preferencesQuery);
  let categoriesState: React.ReactNode = null;
  if (!chapterId) {
    categoriesState = (
      <InlineNote>Pick a chapter to set its notifications.</InlineNote>
    );
  } else if (isOffline && anyReadUncached(preferencesQuery)) {
    categoriesState = (
      <NestedOffline
        title="Notification settings unavailable offline"
        description="Reconnect to load which categories you receive."
        onRetry={() => void preferencesQuery.refetch()}
      />
    );
  } else if (preferencesQuery.isLoading || preferencesPaused) {
    categoriesState = <NotificationSettingsSkeleton />;
  } else if (preferencesQuery.isError && anyReadUncached(preferencesQuery)) {
    categoriesState = (
      <NestedError
        title="Couldn't load your notification settings"
        description="These couldn't be read, so a switch here would report a change that never saved. Retry in a moment."
        onRetry={() => void preferencesQuery.refetch()}
      />
    );
  }

  /*
   * A complete state for every catalog key, folded from whatever rows came
   * back — never a patch, and never keyed off the response's own keys. The
   * fold lives in `@repo/validation` beside the catalog because mobile's s16
   * grid performs exactly the same one; see that module's docblock for why a
   * per-surface copy is the failure mode rather than a convenience.
   */
  const categories = rowsToNotificationCategoryState(preferencesQuery.data);

  function handleCategoryToggle(
    category: NotificationCategoryKey,
    label: string,
    isEnabled: boolean,
  ) {
    if (!chapterId) return;
    if (isOffline) {
      // Refused rather than queued — see the `aria-disabled` note on the
      // Switch. Said out loud, because a control that silently ignores a click
      // is the dead control this card is otherwise careful to avoid.
      toast({
        title: "You're offline",
        description:
          "Reconnect to change your notification settings. Nothing has been changed.",
      });
      return;
    }
    /*
     * `useUpdateNotificationPreference` writes the cache optimistically and
     * reverts just this category on failure (#312), so the switch moves at
     * once and un-moves itself if the PATCH loses. All this owes the member is
     * the sentence explaining why it moved back.
     *
     * `mutateAsync().catch()`, NOT `mutate(…, { onError })`. All the switches
     * share one mutation observer, and v5's `MutationObserver.mutate` detaches
     * the observer from the previous mutation and overwrites its stored
     * per-call options — so a superseded mutation's `onError` never fires, and
     * if it did it would carry the *later* toggle's closure and name the wrong
     * category. That window is seconds wide, not a race: `query-provider.tsx`
     * retries a transient failure (a 5xx, a lost response) twice with backoff,
     * so such a PATCH takes ~6-7s to surface. Flip two switches inside that
     * and the first would
     * revert silently — the exact "revert reads as the control being broken"
     * outcome this exists to prevent. `mutateAsync`'s promise belongs to the
     * call, so supersession and unmount cannot swallow it.
     * `packages/hooks/src/use-notifications.ts` documents the same asymmetry.
     */
    updatePreference
      .mutateAsync({ chapter_id: chapterId, category, is_enabled: isEnabled })
      .catch((error: unknown) =>
        toast({
          title: `Couldn't turn ${label} notifications ${isEnabled ? "on" : "off"}`,
          description: getErrorMessage(
            error,
            "The switch has been put back. Try again or check your connection.",
          ),
          variant: "destructive",
        }),
      );
  }

  /*
   * The group's one footnote: offline, the sentence each switch points at;
   * otherwise where these apply and what is muted elsewhere.
   */
  const footnote = isOffline ? (
    <span id={OFFLINE_NOTE_ID}>
      You&apos;re offline, so these can&apos;t be changed right now.
    </span>
  ) : (
    chapterAlertsFootnote()
  );

  if (!chapterId || categoriesState) {
    return (
      <section id="chapter-alerts" className="scroll-mt-16 space-y-2">
        <SectionLabel id="chapter-alerts-label">{heading}</SectionLabel>
        {chapterId ? (
          // The chat level has its own read, so it stays usable while the
          // switches load or fail.
          <SettingsGroup label="Chat messages">
            <ChatLevelRow key={chapterId} />
          </SettingsGroup>
        ) : null}
        {categoriesState}
      </section>
    );
  }

  return (
    <section id="chapter-alerts" className="scroll-mt-16">
      <SettingsGroup heading={heading} footnote={footnote}>
        {/* Keyed by the chapter: a switch made in another tab moves the
            active chapter in place (`use-claim-chapter-sync.ts`), and a save
            still in flight for the old chapter must not show, or fail,
            under the new one. */}
        <ChatLevelRow key={chapterId} offlineNote={false} />
        {shownNotificationCategories(permissions).map((category) => {
          const switchId = `notification-category-${category.key}`;
          const descriptionId = `${switchId}-description`;
          return (
            <SettingsRow
              key={category.key}
              label={category.label}
              description={
                <span id={descriptionId}>{category.description}</span>
              }
              control={
                <Switch
                  id={switchId}
                  aria-label={category.label}
                  checked={categories[category.key]}
                  // The offline reason belongs on the control, not only in
                  // the footnote after the last row
                  // (`spec/ui/resilience/connection-state.md`'s queueless
                  // rule): without it a screen-reader member offline hears
                  // "Points, switch, on, unavailable" and nothing about why.
                  aria-describedby={
                    isOffline
                      ? `${descriptionId} ${OFFLINE_NOTE_ID}`
                      : descriptionId
                  }
                  /*
                   * Soft-disabled offline, NOT `disabled`. The write is
                   * refused up front (`handleCategoryToggle`) rather than
                   * attempted: an offline mutation would start, burn its
                   * retries and snap back under an error toast (#1754).
                   * The real `disabled` attribute would cost more: the
                   * switch scopes its state colours to `enabled:`, so every
                   * switch would draw the same track and the on/off cue
                   * would drop under WCAG 1.4.11's 3:1, and each would leave
                   * the tab order. Reading which categories are muted is
                   * the more common offline need, so `aria-disabled` keeps
                   * the colours, the tab order and the announced state.
                   */
                  aria-disabled={isOffline || undefined}
                  onCheckedChange={(checked) =>
                    handleCategoryToggle(category.key, category.label, checked)
                  }
                />
              }
            />
          );
        })}
      </SettingsGroup>
    </section>
  );
}
