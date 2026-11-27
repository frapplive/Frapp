"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BookOpen,
  CalendarDays,
  Hash,
  MessageSquareText,
  Search,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  JUMP_MORE_FROM_LETTERS,
  JUMP_NOTHING_YET,
  JUMP_RECENT_LABEL,
  JUMP_UNREAD_LABEL,
  badgeLabel,
  jumpModeOf,
  rankChannelMatches,
  unreadAnnouncement,
  useActiveChapterId,
  useChannelJump,
  useDepartments,
  usePermissionList,
  useSearch,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_COMPLETED_EVENT,
  type JumpChannel,
} from "@repo/hooks";
import { canAny } from "@repo/validation";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";
import { useIsCouncil } from "@/lib/hooks/use-tenant-kind";
import { useSettingsSearch } from "@/lib/settings/use-settings-search";
import { asArray, cn } from "@/lib/utils";
import { AnalyticsContext } from "@/lib/providers/analytics-provider";
import { FOCUS_RING } from "@/components/ui/focus";
import { DialogOverlay } from "@/components/ui/dialog";
import { EYEBROW } from "@/components/ui/typography";
import { Badge } from "@/components/ui/badge";
import { chatDeepLink } from "@/lib/chat/chat-links";
import { readRecentChannels } from "@/lib/chat/last-channel";
import { useChatViewerId } from "@/lib/chat/viewer-id";
import {
  ALL_GROUP_LIMIT,
  FIND_GROUPS,
  buildFindResults,
  type FindFilter,
  type FindGroup,
  type FindResult,
} from "@/components/layout/find-results";

/**
 * The Find dialog: a centered search over channels, settings, members,
 * messages, events and backwork, opened by Cmd/Ctrl+F, Cmd/Ctrl+K, the
 * sidebar's Search row or, below `lg`, the top bar's field (`find-bar.tsx`).
 * Before a search's minimum it is Jump to a channel (#6053, below).
 *
 * **Why a dialog again.** #2141 replaced the ⌘K palette with a field that
 * dropped its results under itself, 520px wide. Paul picked a centered dialog
 * instead on 2026-11-05 (option A of the Find and Ask proposal): results get
 * the room for full message previews, dates, and two more groups, and filter
 * chips narrow it without retyping. The top-bar field stays as the visible way
 * in, so the shortcut is still a convenience rather than the only door.
 *
 * **It only finds** (#5476, Paul, 2026-11-18). From #4904 (2026-11-13) its
 * first row asked Frapp what was typed, for a member with Ask; Shawn and Paul
 * didn't want Ask in the search bar, so Ask has its own bar now
 * (`ask/ask-bar.tsx`) and this dialog lists places to go, from everything the
 * member can read. Per foundations §6 the highlighted row is a neutral
 * `--card-hover` fill, like every menu highlight; only the active filter chip
 * takes the chapter accent.
 *
 * Focus never leaves the input while arrowing: the list is an
 * `aria-activedescendant` listbox, as the field's dropdown was.
 */

/**
 * A row Find draws: a search result, or a Jump to a channel row (#6053), which
 * carries its own heading (Unread, Recently opened), its weight and its
 * mention count.
 */
type FindRow = FindResult & {
  heading?: string;
  unread?: boolean;
  badge?: string | null;
  /** What a screen reader hears for its unread, as on the channel list. */
  announcement?: string;
};

export const FIND_PLACEHOLDER = "Find channels, members, messages and more";
/** A council's Find lists its channels alone (#5933). */
export const COUNCIL_FIND_PLACEHOLDER = "Find channels";

const GROUP_ICON: Record<FindGroup, LucideIcon> = {
  Channels: Hash,
  Settings: Settings,
  Members: User,
  Messages: MessageSquareText,
  Events: CalendarDays,
  Backwork: BookOpen,
};

const MODULE_FOR_GROUP: Partial<Record<FindGroup, string>> = {
  Events: "events",
  Backwork: "backwork",
};

/**
 * The library's own gate (`BackworkController`, any of the two). `/v1/search`
 * applies it too and sends such a member no backwork rows; hiding the group
 * here also drops its chip and skips the department read, which would 403.
 */
const BACKWORK_BROWSE = ["backwork:upload", "backwork:admin"] as const;

/** Which group each `/v1/search` source fills, for its timeout notice. */
const GROUP_FOR_SOURCE: Record<string, FindGroup> = {
  backwork: "Backwork",
  events: "Events",
  members: "Members",
  messages: "Messages",
};

type FindDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owned by the trigger so a closed dialog keeps what was typed. */
  query: string;
  onQueryChange: (query: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Puts focus back where it was before the dialog opened. */
  onCloseFocus: () => void;
  /**
   * Select the kept query on open (the default), so typing replaces it. Off
   * when the dialog opened from a keystroke on the field, which already put
   * that character in the query: selecting it would let the next one erase it.
   */
  selectOnOpen?: boolean;
};

export function FindDialog({
  open,
  onOpenChange,
  query,
  onQueryChange,
  inputRef,
  onCloseFocus,
  selectOnOpen = true,
}: FindDialogProps) {
  /*
   * The last query a `search-completed` event went out for. Held here, not in
   * the panel, because the panel unmounts on close and the query survives it:
   * reopening refetches the kept query (`staleTime: 0`), and without this the
   * refetch would count as a search the member never re-ran.
   */
  const lastTrackedQueryRef = useRef<string | null>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay className="motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-modal="true"
          // Select what was typed last time, so typing replaces it and Enter
          // or the arrows still work on it.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const input = inputRef.current;
            input?.focus();
            if (selectOnOpen) input?.select();
            else
              input?.setSelectionRange(input.value.length, input.value.length);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onCloseFocus();
          }}
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-[0.98] motion-reduce:animate-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Find
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search channels, settings, members, messages, events and backwork.
            Use the arrow keys to move through results and Enter to open one.
          </DialogPrimitive.Description>
          <FindPanel
            query={query}
            onQueryChange={onQueryChange}
            inputRef={inputRef}
            onDone={() => onOpenChange(false)}
            lastTrackedQueryRef={lastTrackedQueryRef}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The dialog's body. Radix mounts `Content` only while open, so these queries
 * (search, channels, departments) run only while the dialog is up: the
 * department list in particular is read for nothing else in the shell.
 */
function FindPanel({
  query,
  onQueryChange,
  inputRef,
  onDone,
  lastTrackedQueryRef,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDone: () => void;
  lastTrackedQueryRef: React.MutableRefObject<string | null>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FindFilter>("All");
  // Null until the member moves the highlight, which otherwise sits on the
  // first result.
  const [movedTo, setMovedTo] = useState<number | null>(null);
  // Set below, once the tenant's kind is read.
  let placeholder = FIND_PLACEHOLDER;

  // The server search is debounced; the channel match is not, in effect,
  // because it reads the same debounced query and the channel list is cached.
  const debouncedQuery = useDebouncedValue(query, 200);
  /*
   * Everything below reads the DEBOUNCED query, deliberately. `useSearch` keys
   * on it, so gating on the raw `query` would render a confident "No matches."
   * for the first 200ms of every search. The list therefore trails the text
   * for those 200ms, so Enter is ignored until it catches up (`onInputKeyDown`):
   * otherwise re-typing over an old query and pressing Enter would open an old
   * hit for a search the member had already replaced.
   */
  const hasMinQuery = debouncedQuery.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const isDebouncing = query !== debouncedQuery;
  // A council's Find is its channels (#5933): `/v1/search` serves chapters
  // only, so the search-backed groups (members, messages, events, backwork)
  // never ask there, and Settings' index names a chapter's settings.
  const isCouncil = useIsCouncil();
  if (isCouncil) placeholder = COUNCIL_FIND_PLACEHOLDER;
  const search = useSearch(isCouncil ? "" : debouncedQuery);
  // Jump to a channel's facts (#6053): the lists, and the channels with their
  // category's name, which the search's Channels group takes too.
  const viewerId = useChatViewerId();
  const chapterKey = useActiveChapterId() ?? "sole";
  // Read when the panel mounts, which is each time Find opens.
  const recentIds = useMemo(
    () => readRecentChannels(viewerId, chapterKey),
    [viewerId, chapterKey],
  );
  const jump = useChannelJump(recentIds);
  const isModuleEnabled = useChapterModuleGate();
  const permissions = usePermissionList();
  // Settings the member can change, found by name or synonym (2026-11-19).
  const findSettings = useSettingsSearch();
  // `null` outside `AnalyticsProvider` (tests, or an opted-out member).
  const track = useContext(AnalyticsContext);
  // Set by the member typing in this mount; see the telemetry effect.
  const typedRef = useRef(false);

  /*
   * A group whose module the chapter switched off is never listed or offered,
   * and nor is Backwork for a member the library itself would refuse. Unlike
   * the nav, the module groups fail CLOSED while the gate loads (right after a
   * chapter switch): the nav only links to a route, but these rows are data
   * the switched-off module would not show. The permission list is `[]` while
   * it loads, so Backwork fails closed the same way.
   */
  const canBrowseBackwork = canAny(BACKWORK_BROWSE, permissions);
  const hiddenGroups = useMemo(() => {
    const hidden = new Set<FindGroup>();
    for (const group of FIND_GROUPS) {
      const key = MODULE_FOR_GROUP[group];
      if (key && !(isModuleEnabled?.(key) ?? false)) hidden.add(group);
    }
    if (!canBrowseBackwork) hidden.add("Backwork");
    if (isCouncil) {
      for (const group of FIND_GROUPS) {
        if (group !== "Channels") hidden.add(group);
      }
    }
    return hidden;
  }, [isModuleEnabled, canBrowseBackwork, isCouncil]);
  const departments = useDepartments({
    enabled: !hiddenGroups.has("Backwork"),
  });
  const chips: FindFilter[] = [
    "All",
    ...FIND_GROUPS.filter((g) => !hiddenGroups.has(g)),
  ];
  // A chip that vanished (its module just went off) must not keep filtering.
  const effectiveFilter: FindFilter =
    filter !== "All" && hiddenGroups.has(filter) ? "All" : filter;

  const results = useMemo<FindResult[]>(
    () =>
      hasMinQuery
        ? buildFindResults({
            query: debouncedQuery,
            filter: effectiveFilter,
            channels: jump.findChannels,
            payload: search.data?.payload,
            departments: departments.data,
            hiddenGroups,
            settings: findSettings(debouncedQuery),
          })
        : [],
    [
      hasMinQuery,
      debouncedQuery,
      effectiveFilter,
      jump.findChannels,
      search.data,
      departments.data,
      hiddenGroups,
      findSettings,
    ],
  );

  /*
   * Jump to a channel (#6053, Paul's pick of 2026-11-25). Before anything is
   * typed Find lists the unread channels, then the ones this browser opened
   * lately; with fewer letters than a search needs it lists the channels
   * that match them, at once, from the list already in memory. Both read the
   * raw query, not the debounced one, so Enter opens a channel without the
   * 200ms wait a search needs. The rules are `@repo/hooks` `channel-jump.ts`,
   * shared with the phone's Search.
   */
  const { mode: jumpMode, letters: typedLetters } = jumpModeOf(
    query,
    SEARCH_MIN_QUERY_LENGTH,
  );
  const jumpRows = useMemo<FindRow[]>(() => {
    if (jumpMode === null) return [];
    const row = (channel: JumpChannel, heading: string): FindRow => {
      const counts = jump.countsFor(channel.id);
      return {
        id: `jump-${heading}-${channel.id}`,
        group: "Channels",
        heading,
        label: channel.name,
        hint: jump.categoryOf(channel),
        target: { type: "channel", channelId: channel.id },
        href: chatDeepLink({ channelId: channel.id }),
        unread: jump.looksUnread(channel.id),
        // A count only for a mention (foundations §5); a screen reader
        // hears the channel list's words either way.
        badge:
          counts && counts.mentionCount > 0
            ? badgeLabel(counts.unreadCount, counts.mentionCount)
            : null,
        announcement:
          counts && jump.looksUnread(channel.id)
            ? unreadAnnouncement(counts)
            : undefined,
      };
    };
    if (jumpMode === "lists") {
      return [
        ...jump.unread.map((channel) => row(channel, JUMP_UNREAD_LABEL)),
        ...jump.recent.map((channel) => row(channel, JUMP_RECENT_LABEL)),
      ];
    }
    return rankChannelMatches(
      jump.channels,
      typedLetters,
      ALL_GROUP_LIMIT * 2,
    ).map((channel) => row(channel, "Channels"));
  }, [jumpMode, jump, typedLetters]);
  const rows: FindRow[] = jumpMode === null ? results : jumpRows;

  // A new query or filter means a new list, so the preselection goes back to
  // the top. Adjusted during render rather than in an effect, so the reset
  // lands in the same paint as the new results: an effect would render one
  // frame with a stale highlight, and that frame is the one an Enter can hit.
  const listKey = `${query}\u0000${effectiveFilter}`;
  const [keyForIndex, setKeyForIndex] = useState(listKey);
  if (keyForIndex !== listKey) {
    setKeyForIndex(listKey);
    setMovedTo(null);
  }

  /*
   * Search telemetry (`spec/behavior/observability.md` § Search Telemetry).
   * `surface` stays `"find-bar"`: it names the top-bar entry point, which this
   * dialog still is, so the series does not split at the redesign.
   *
   * Never the query text: `assertContentFreeProperties` does not forbid a key
   * named `query`, so sending length and word count instead is a discipline
   * the shared gate would not catch.
   */
  const searchStartRef = useRef(0);
  useEffect(() => {
    searchStartRef.current = Date.now();
  }, [debouncedQuery]);
  // `dataUpdatedAt` (not the query string) dedupes: `useSearch` sets
  // `staleTime: 0`, so re-running an identical query later still refetches and
  // must still be tracked.
  const trackedAtRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!hasMinQuery) return;
    if (search.isFetching) return;
    if (!search.data) return;
    if (search.dataUpdatedAt === trackedAtRef.current) return;
    trackedAtRef.current = search.dataUpdatedAt;
    // A reopen refetches the kept query; that is not a new search. (A search
    // abandoned by closing before it settled is never counted: it never
    // settled, and the spec counts settled searches.)
    if (!typedRef.current && debouncedQuery === lastTrackedQueryRef.current) {
      return;
    }
    lastTrackedQueryRef.current = debouncedQuery;
    const trimmed = debouncedQuery.trim();

    const bag =
      search.data.payload && typeof search.data.payload === "object"
        ? (search.data.payload as Record<string, unknown>)
        : {};
    const counts = {
      backwork: asArray(bag.backwork).length,
      events: asArray(bag.events).length,
      members: asArray(bag.members).length,
      messages: asArray(bag.messages).length,
    };
    const total =
      counts.backwork + counts.events + counts.members + counts.messages;

    track?.(SEARCH_COMPLETED_EVENT, {
      surface: "find-bar",
      query_length: trimmed.length,
      query_word_count: trimmed.split(/\s+/).filter(Boolean).length,
      backwork_count: counts.backwork,
      events_count: counts.events,
      members_count: counts.members,
      messages_count: counts.messages,
      total_count: total,
      zero_result: total === 0,
      timed_out: search.data.timedOut,
      latency_ms: Date.now() - searchStartRef.current,
    });
  }, [
    hasMinQuery,
    search.isFetching,
    search.data,
    search.dataUpdatedAt,
    debouncedQuery,
    track,
    lastTrackedQueryRef,
  ]);

  // Deliberately touches no ref: closing and clearing is the whole job, and a
  // ref read in a closure handed to `onClick` is the pattern that gets a
  // component stale-rendered.
  const openResult = useCallback(
    (result: FindResult | undefined) => {
      if (!result) return;
      onDone();
      onQueryChange("");
      router.push(result.href);
    },
    [router, onDone, onQueryChange],
  );

  // "Searching..." only for text that will actually be searched.
  // A jump list reads the raw text, so the search's status and timeouts,
  // which read the debounced text, stand down while one is drawn.
  const showResults =
    jumpMode === null &&
    (hasMinQuery ||
      (isDebouncing && query.trim().length >= SEARCH_MIN_QUERY_LENGTH));
  const isLoading = search.isFetching || isDebouncing;

  // The highlight starts on the first result, which may not be there yet:
  // then no row is lit, and Enter waits for it.
  const rowCount = rows.length;
  const activeIndex = movedTo !== null && movedTo < rowCount ? movedTo : 0;

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // An IME's Enter commits a candidate, and its arrows move between them.
    if (event.nativeEvent.isComposing) return;
    if (rowCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMovedTo((activeIndex + 1) % rowCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setMovedTo((activeIndex - 1 + rowCount) % rowCount);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // The list still belongs to the previous text; see `hasMinQuery`. A
      // jump list reads the raw text, so it is never behind.
      if (isDebouncing && jumpMode === null) return;
      openResult(rows[activeIndex]);
    }
  }

  /*
   * Only a timeout in a group the member is looking at counts. Channels are
   * matched here and never time out, so under the Channels chip a slow message
   * scan is not "Search took too long"; nor is one in a hidden group. A server
   * that names no sources falls back to the whole-search flag.
   */
  const shownGroup = (group: FindGroup) =>
    !hiddenGroups.has(group) &&
    (effectiveFilter === "All" || effectiveFilter === group);
  const allTimedOutSources = search.data?.timedOutSources ?? [];
  const timedOutSources = allTimedOutSources.filter((source) => {
    const group = GROUP_FOR_SOURCE[source];
    return group ? shownGroup(group) : true;
  });
  // Channels and Settings are matched on this device, so the server's
  // timeout or failure says nothing about them.
  const matchedHere =
    effectiveFilter === "Channels" || effectiveFilter === "Settings";
  const timedOut =
    allTimedOutSources.length > 0
      ? timedOutSources.length > 0
      : (search.data?.timedOut ?? false) && !matchedHere;

  /*
   * "We stopped looking here" must read differently from "we found nothing"
   * (spec/behavior/search.md). The budget is per SOURCE, so a slow message
   * scan degrades alone, which means a partial timeout has to be announced
   * even when the list is showing hits.
   */
  const partialTimeout = showResults && timedOut && results.length > 0;
  let statusMessage: string | null = null;
  if (!showResults) {
    statusMessage = null;
  } else if (isLoading) {
    statusMessage = "Searching...";
  } else if (search.isError && !matchedHere) {
    statusMessage = "Search is unavailable right now. Try again in a moment.";
  } else if (results.length === 0) {
    statusMessage = timedOut
      ? "Search took too long. Try a narrower term."
      : "No matches.";
  }

  const listShown = showResults || jumpMode !== null;
  const activeId =
    listShown && rows[activeIndex]
      ? `find-option-${rows[activeIndex]!.id}`
      : undefined;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Search
          className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={listShown}
          aria-controls="find-results"
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            typedRef.current = true;
            onQueryChange(e.target.value);
          }}
          onKeyDown={onInputKeyDown}
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted"
        />
      </div>

      {/* One group (a council's channels, #5933) is nothing to narrow. */}
      {chips.length > 2 && jumpMode === null ? (
        <div
          role="group"
          aria-label="Show"
          className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-1 pt-3"
        >
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              aria-pressed={effectiveFilter === chip}
              onClick={() => {
                setFilter(chip);
                inputRef.current?.focus();
              }}
              className={cn(
                "h-7 rounded-full border px-3 text-caption transition",
                effectiveFilter === chip
                  ? "border-transparent bg-accent-subtle text-accent-text"
                  : "border-border text-muted-foreground hover:text-foreground",
                FOCUS_RING,
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      {/*
        A live region outside the list, so a screen reader hears "Searching...",
        a timeout, or the count rather than silence.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {showResults
          ? (statusMessage ??
            `${results.length} result${results.length === 1 ? "" : "s"}.`)
          : jumpMode === "letters"
            ? `${rows.length} channel${rows.length === 1 ? "" : "s"}.`
            : ""}
      </p>

      <div
        id="find-results"
        role="listbox"
        aria-label={placeholder}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {jumpMode === "letters" && rows.length === 0 ? (
          <p className="px-2.5 py-3 text-sm text-muted-foreground">
            No channels match.
          </p>
        ) : null}

        {statusMessage ? (
          <p className="px-2.5 py-3 text-sm text-muted-foreground">
            {statusMessage}
          </p>
        ) : null}

        {partialTimeout ? (
          <p className="px-2.5 pb-1 pt-2 text-caption text-muted-foreground">
            {timedOutSources.length > 0
              ? `Stopped looking in ${timedOutSources.join(", ")}. Results may be incomplete.`
              : "Some sources timed out. Results may be incomplete."}
          </p>
        ) : null}

        {rows.map((result, index) => {
          const heading = result.heading ?? result.group;
          const isNewGroup =
            index === 0 ||
            (rows[index - 1]!.heading ?? rows[index - 1]!.group) !== heading;
          const Icon = GROUP_ICON[result.group];
          const active = index === activeIndex;
          return (
            /*
              `role="group"`, not a bare <div>: a listbox may own groups, but a
              plain div between listbox and option breaks the relationship.
            */
            <div
              key={result.id}
              role="group"
              aria-label={isNewGroup ? heading : undefined}
            >
              {isNewGroup ? (
                <p
                  aria-hidden="true"
                  className={cn("px-2.5 pb-1 pt-3 text-muted", EYEBROW)}
                >
                  {heading}
                </p>
              ) : null}
              <button
                type="button"
                role="option"
                id={`find-option-${result.id}`}
                aria-selected={active}
                // Focus stays in the input, so options are not tab stops.
                tabIndex={-1}
                onPointerEnter={() => setMovedTo(index)}
                onClick={() => openResult(result)}
                className={cn(
                  // The Row step (foundations.md §9, #3515): 32 with a 14px
                  // label on a mouse, 44 with a 16px one on touch. A floor, not
                  // a height, so a row that ever wraps grows; today's labels
                  // and hints are one line because they `truncate`.
                  "flex min-h-control-row w-full items-center gap-3 rounded-[10px] px-2.5 py-1 text-left text-sm transition pointer-coarse:min-h-11 pointer-coarse:text-base",
                  active
                    ? "bg-card-hover text-foreground"
                    : "text-foreground hover:bg-card-hover",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    // An unread channel reads as its row in the list does: a
                    // bold title, and a number only for a mention (§5).
                    result.unread && "font-bold",
                  )}
                >
                  {result.label}
                </span>
                {result.hint ? (
                  <span className="max-w-[45%] shrink-0 truncate text-caption text-muted-foreground">
                    {result.hint}
                  </span>
                ) : null}
                {result.badge ? (
                  <Badge
                    variant="mention"
                    aria-hidden="true"
                    className="h-5 shrink-0 px-1.5 normal-case tracking-normal"
                  >
                    {result.badge}
                  </Badge>
                ) : null}
                {result.announcement ? (
                  <span className="sr-only">, {result.announcement}</span>
                ) : null}
              </button>
            </div>
          );
        })}

        {jumpMode === "lists" && rows.length === 0 && jump.countsKnown ? (
          <p className="px-2.5 py-3 text-sm text-muted-foreground">
            {JUMP_NOTHING_YET}
          </p>
        ) : null}
        {jumpMode === "letters" && !isCouncil ? (
          <p className="px-2.5 pb-1 pt-3 text-caption text-muted-foreground">
            {JUMP_MORE_FROM_LETTERS(SEARCH_MIN_QUERY_LENGTH)}
          </p>
        ) : null}
      </div>
    </>
  );
}
