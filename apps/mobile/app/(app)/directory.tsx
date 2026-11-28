import { parseChapterRoles } from "@repo/hooks/chapter-roles";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useActiveChapterId,
  useAlumni,
  useGroups,
  useMemberDisplayNames,
  useMemberPhoneReach,
  useMemberSearch,
  useMembers,
  usePermissionList,
  usePledgeClasses,
  useRoles,
  usesFraternalOrder,
  useCurrentChapter,
  useStandings,
  useViewerUserId,
  DEFAULT_STANDINGS_WINDOW,
  type MemberAvatarTint,
  type StandingsMetric,
} from "@repo/hooks";
import {
  NO_BASE_ROLE_FILTER,
  NO_BASE_ROLE_LABEL,
} from "@repo/hooks/member-assignments";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  can,
  isModuleEnabled,
  isBaseRole,
  DIRECTORY_COPY,
  directoryNoSearchMatches,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { MemberAvatar } from "@/components/member-avatar";
import { AvatarWithPresence } from "@/components/avatar-with-presence";
import { presenceLabel } from "@repo/hooks/presence-status";
import {
  NO_PRESENCE,
  usePresenceOf,
  type MemberPresence,
} from "@/lib/presence/presence-store";
import {
  ErrorState,
  NoChapterState,
  SkeletonBlock,
  SkeletonRegion,
  SkeletonText,
} from "@/components/state-block";
import {
  BACK_TO_YOU,
  PinnedBackRow,
  pinnedBackClearance,
} from "@/components/back-row";
import { Chip, FilterChips, SearchField } from "@/components/filter-chips";
import {
  CREATE_BUTTON_SIZE,
  FloatingCreateButton,
} from "@/components/floating-create-button";
import { gutterBleed, usePressFeedback } from "@/components/list-section";
import { InlineNote } from "@/components/inline-note";
import { screenTitleStyle } from "@/components/screen-shell";
import {
  ThemedRefreshControl,
  useRefetchAll,
} from "@/components/pull-to-refresh";
import {
  ActiveFilterChips,
  FilterSheet,
  type FilterSheetFilter,
} from "@/components/filter-sheet";
import { filtersOn } from "@repo/hooks/filter-rows";
import { directoryFilterRows } from "@repo/hooks/directory-filter-rows";
import {
  PHONE_REACH_FILTER_OPTIONS,
  PHONE_REACH_LABEL,
  phoneReachCountLineFor,
  phoneReachStaleNote,
  phoneReachStateLabel,
  type PhoneReach,
  type PhoneReachFilter,
} from "@repo/validation";
import { PickRolesSheet } from "@/components/roles/pick-roles-sheet";
import { usePickableRoles } from "@repo/hooks";
import {
  effectiveActivesFilter,
  filterActives,
  graduationYearOptions,
  NO_ACTIVES_FILTER,
  activesFilterRoles,
  type ActivesFilter,
  type ActivesStatus,
} from "@/lib/directory/actives-filter";
import {
  type DirectoryRow,
  selectActives,
  selectDirectoryRows,
} from "@/lib/more/directory";
import { records, str } from "@/lib/more/narrow";
import {
  classNamesById,
  usePledgeClassTerms,
} from "@/lib/directory/pledge-class";
import { FLOATING_TAB_BAR, useTabBarClearance } from "@/lib/floating-chrome";
import {
  MONO_FONT_FAMILY,
  avatarRadius,
  typeRole,
  useFrappTheme,
} from "@/lib/theme";
import { ScreenReady } from "@/lib/sentry/screen-ready";
import { useIsCouncil, useServesChapterFeatures } from "@/lib/tenant-kind";

/**
 * s13 — Directory (`canvas-screens.dc.html:451`).
 *
 * ## Not on `ScreenShell`
 *
 * The shell wraps its children in a `ScrollView`, and a chapter's alumni list
 * runs to hundreds of rows with no pagination on any of the three endpoints
 * this screen reads — so inside the shell every row would mount at once. This
 * is the same opt-out `chat-thread.tsx` and `chapter-picker.tsx` make
 * (`spec/ui/mobile/patterns.md`), with the title, chips and search field riding
 * in `ListHeaderComponent` so the chrome still matches.
 *
 * ## Rows push the member's profile
 *
 * A row pushes `/member` (`components/directory/member-profile-screen.tsx`),
 * as iOS Contacts and Slack's member directory push a person's page (#5568,
 * Paul 2026-11-19). It was a full-height bottom sheet until then.
 *
 * ## One layout, quiet chips (#5568)
 *
 * Rows only: the List | Grid round (#4175) came out with Paul's ban on view
 * switchers (`spec/ui/design-system/README.md` § 2, 2026-11-17). The chips
 * above the list draw their quiet selected state, so the colour on the
 * screen is the members' own (their faces and initials), not the filter.
 *
 * ## `useMembers()` here is not the over-fetch #986 objected to
 *
 * That objection was about resolving chat *display names* through the full
 * profile endpoint, which puts every member's email and bio on the device to
 * draw a name — `GET /v1/members/roster` exists for that. The directory is the
 * surface `/v1/members` was built for, and the roster projection carries no
 * graduation year or company, so it cannot draw the meta line at all.
 *
 * ## Invite, for whoever may
 *
 * A member who holds `members:invite` (by default the President alone) gets
 * the screen's floating + (`spec/ui/mobile/patterns.md` § Create actions),
 * "Invite members", which opens the Invite members screen with `‹ Directory`
 * under it. The roster is where Discord and web put Invite, so it is where a
 * President looks first (owner ask 2026-11-06). While the permission read
 * loads the button is absent, which fails closed.
 *
 * ## Pledge class and fraternal order (#3939)
 *
 * `spec/behavior/members.md` § Pledge class and order number. A member's class
 * leads their row's meta line, and the Actives tab's Filters sheet has a Sort
 * row whose orders include the chapter's word for a member's order number,
 * which lists the actives in fraternal order instead of by name. As on web,
 * all of it waits for the class list: a chapter with no classes and no
 * numbers sees none of it, and a class list that has never answered drops
 * the order and the names rather than sort by a list it doesn't have. The
 * sort is the Actives tab's alone, by choice: web's Alumni tab has no sort
 * either (#4088). Alumni rows still name their class, since `GET /v1/alumni` returns
 * it. Read-only on the list; an officer holding `roles:manage` sets both from
 * the member profile a row opens (#3991), or on web.
 *
 * ## Actives filters (#3971, #5739)
 *
 * The Actives tab's chip row carries one Filters chip that opens the phone's
 * one `FilterSheet` with web's Directory rows in web's order: Role, Group,
 * Graduation year, the chapter's pledge class, Status, Phone app, then Sort
 * and a standing's Period, filtered by web's rules
 * (`lib/directory/actives-filter.ts`). The filters that are on show as
 * removable chips under the search (`ActiveFilterChips`), and a standing
 * keeps its order and period in sight on one line, as web's count line does.
 * The Alumni tab keeps its own Filters chip and typed fields, since
 * `GET /v1/alumni` filters server-side by free text. Like the alumni filters,
 * these stay set across a tab switch and are left alone by a search, which
 * looks across both lists.
 */
type Tab = "actives" | "alumni";

/** The Actives list's orders: by name, fraternal order, or a standing. */
type DirectorySort = "name" | "order" | "points" | "service";

/** A row's place under a standings sort (#5950). */
export interface RowStanding {
  /** `null` for a member with nothing in the period: unnumbered. */
  rank: number | null;
  /** The period's total, as text: "45 points", "2.5 hours". */
  figure: string;
  /** The period, for a screen reader: "This semester". */
  period: string;
  isViewer: boolean;
}

export default function DirectoryScreen() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const tabBarClearance = useTabBarClearance();
  const chapterId = useActiveChapterId();
  const router = useRouter();
  // The roster's role-color resolution, so a row's initials match the color
  // that member's name takes in chat (#3860).
  const { avatarTintFor } = useMemberDisplayNames();
  const permissionList = usePermissionList();
  const canInvite = can("members:invite", permissionList);
  const activesFilterSheetRef = useRef<BottomSheetModal>(null);
  const pickRolesSheetRef = useRef<BottomSheetModal>(null);
  const pickable = usePickableRoles();
  const [activesFilterPicks, setActivesFilterPicks] =
    useState<ActivesFilter>(NO_ACTIVES_FILTER);

  const [tab, setTab] = useState<Tab>("actives");
  const [query, setQuery] = useState("");
  // Keeps typing responsive without a debounce timer of our own: the query only
  // re-runs once React has caught up with the keystrokes.
  const deferredQuery = useDeferredValue(query.trim());

  // Self-reported alumni fields, mirroring the web alumni directory
  // (`apps/web/components/alumni/alumni-directory.tsx`) — same three filters,
  // same `useAlumni` params. Filters persist across a tab switch (the fields
  // are only shown on the Alumni tab, but staying applied means returning to
  // it doesn't silently drop what was typed). Held as one object, rather than
  // three parallel `useState`s, so `hasAlumniFilters`, the Filters chip's
  // count and the `useAlumni` call below all derive from the same value, by
  // the one rule in `countSetFilters`, instead of hand-written copies of "is
  // any filter set" drifting apart.
  const [alumniFilterInputs, setAlumniFilterInputs] = useState({
    gradYear: "",
    city: "",
    company: "",
  });
  const alumniFilters = useMemo(
    () => ({
      graduation_year: alumniFilterInputs.gradYear.trim() || undefined,
      city: alumniFilterInputs.city.trim() || undefined,
      company: alumniFilterInputs.company.trim() || undefined,
    }),
    [alumniFilterInputs],
  );
  const deferredAlumniFilters = useDeferredValue(alumniFilters);
  // The three fields sit behind a Filters chip rather than always stacking
  // under the tabs, where they pushed the alumni list down by three field
  // heights before a member had typed anything. The chip counts the fields
  // that are set, so a filter left on while the fields are folded away still
  // shows; the count reads the typed values, so it moves with the keystroke.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const alumniFilterCount = countSetFilters(alumniFilters);
  // The deferred value, as the query reads: this picks the empty state for
  // the list that query returns.
  const hasAlumniFilters = countSetFilters(deferredAlumniFilters) > 0;

  const membersQuery = useMembers();
  // A council has no pledge classes or alumni, and those routes refuse it
  // (#5933): its directory is its members, filtered by status and role.
  const council = useIsCouncil();
  const classesQuery = usePledgeClasses({
    enabled: useServesChapterFeatures(),
  });
  const { classTerm, orderTerm } = usePledgeClassTerms();
  const rolesQuery = useRoles();
  const chapterRoles = useMemo(
    () => parseChapterRoles(rolesQuery.data),
    [rolesQuery.data],
  );
  const filterRoles = useMemo(
    () => activesFilterRoles(chapterRoles),
    [chapterRoles],
  );
  // "No base role" for whoever can give roles (#5802), as web's Role chip.
  const offersNoBaseRole =
    can("roles:manage", permissionList) && chapterRoles.some(isBaseRole);
  // `null` until the list has answered once. The last list read is kept when
  // a refetch fails, as web keeps it (and as the members list beside it is
  // kept), so a weak signal doesn't strip the names and undo the sort.
  const pledgeClasses = classesQuery.data ?? null;
  const classNames = useMemo(
    () => classNamesById(pledgeClasses),
    [pledgeClasses],
  );
  // The Actives list's order (#3939, #5950): by name, the chapter's fraternal
  // order, or a standing. A standing ranks the chapter by points or approved
  // service hours over a period and each row then leads with its place; it is
  // the leaderboard the web's Points and Service hours pages drew, on the
  // list of members that was already here. "See standings" on a member's own
  // points opens the screen on it (`?sort=points`).
  const params = useLocalSearchParams<{ sort?: string }>();
  const [sort, setSort] = useState<DirectorySort>(() =>
    params.sort === "points" || params.sort === "service"
      ? params.sort
      : "name",
  );
  const [standingsWindow, setStandingsWindow] = useState<string>(
    DEFAULT_STANDINGS_WINDOW,
  );
  // A module that is off offers no standing (P5.8) and its board is never
  // read. Unknown until the chapter has loaded, so nothing is offered and
  // then taken away.
  const chapter = useCurrentChapter().data;
  // A council keeps no points or service hours (#5933), so it has none.
  const pointsOn =
    !council && !!chapter && isModuleEnabled(chapter.enabled_modules, "points");
  const hoursOn =
    !council && !!chapter && isModuleEnabled(chapter.enabled_modules, "hours");
  const viewerUserId = useViewerUserId();
  // A council has no alumni (#5933): `/v1/alumni` refuses it.
  const alumniQuery = useAlumni(deferredAlumniFilters, { enabled: !council });
  const searchQuery = useMemberSearch(deferredQuery);

  const isSearching = deferredQuery.length > 0;
  const activeQuery = isSearching
    ? searchQuery
    : tab === "actives"
      ? membersQuery
      : alumniQuery;
  // Both lists, since the tab chips count each, and the search results
  // while there is a term (that query is off without one).
  const refresh = useRefetchAll([
    membersQuery,
    alumniQuery,
    searchQuery,
    classesQuery,
    rolesQuery,
  ]);

  // `GET /v1/members` is the whole chapter; the Actives tab is the part of it
  // that isn't on the Alumni tab (#2484). Search stays directory-wide: it hides
  // the chips and looks across both lists.
  const actives = useMemo(
    () => selectActives(membersQuery.data),
    [membersQuery.data],
  );
  const yearOptions = useMemo(() => graduationYearOptions(actives), [actives]);
  // Whether Frapp's notifications reach each member's phone (web's "Phone
  // app" chip). The server sends the whole chapter's only to officers who
  // can invite members or manage roles, and the filter is offered only then.
  const { reach: phoneReach } = useMemberPhoneReach();
  const showsPhoneReach = phoneReach?.scope === "chapter";
  // The chapter's groups with anyone in them, as web's Group chip offers.
  const groupsQuery = useGroups({ enabled: true });
  const filterGroups = useMemo(
    () =>
      (groupsQuery.data ?? [])
        .filter((group) => group.member_ids.length > 0)
        .map((group) => ({ id: group.id, name: group.name })),
    [groupsQuery.data],
  );
  // A pick that no longer exists reads as unpicked (see `effectiveActivesFilter`).
  const knownPicks = useMemo(
    () => ({
      roleIds: new Set([
        ...filterRoles.map((role) => role.id),
        ...(offersNoBaseRole ? [NO_BASE_ROLE_FILTER] : []),
      ]),
      groupIds: new Set(filterGroups.map((group) => group.id)),
      years: yearOptions,
      classIds: new Set(classNames.keys()),
      phoneReach: showsPhoneReach,
    }),
    [
      filterRoles,
      filterGroups,
      yearOptions,
      classNames,
      showsPhoneReach,
      offersNoBaseRole,
    ],
  );
  const activesFilter = useMemo(
    () => effectiveActivesFilter(activesFilterPicks, knownPicks),
    [activesFilterPicks, knownPicks],
  );
  const groupMemberIds = useMemo(() => {
    const group = (groupsQuery.data ?? []).find(
      (g) => g.id === activesFilter.groupId,
    );
    return group ? new Set(group.member_ids) : undefined;
  }, [groupsQuery.data, activesFilter.groupId]);
  const filteredActives = useMemo(
    () =>
      filterActives(
        actives,
        activesFilter,
        phoneReach?.byUserId,
        groupMemberIds,
        chapterRoles,
      ),
    [actives, activesFilter, phoneReach, groupMemberIds, chapterRoles],
  );
  // The member's reach on their row, only while the Phone app filter is set
  // on the Actives tab, so the everyday list stays as it was.
  const rowReach = (userId: string): PhoneReach | undefined =>
    !isSearching && tab === "actives" && activesFilter.phoneReach !== null
      ? phoneReach?.byUserId.get(userId)
      : undefined;
  const phoneReachLine =
    !isSearching &&
    tab === "actives" &&
    activesFilter.phoneReach !== null &&
    phoneReach
      ? phoneReachCountLineFor(
          actives.map((row) =>
            typeof row.user_id === "string" ? row.user_id : null,
          ),
          phoneReach.byUserId,
        )
      : null;
  const listData =
    !isSearching && tab === "actives" ? filteredActives : activeQuery.data;
  // Asked of the actives, the list the chip sorts: a chapter whose only
  // numbered members are alumni would otherwise get a chip that does nothing.
  const orderOffered =
    pledgeClasses !== null && usesFraternalOrder(pledgeClasses, actives);

  // The orders on offer, in the order web's sort menu lists them.
  const sortOptions = useMemo(
    () =>
      [
        { value: "name", label: "Name" },
        orderOffered ? { value: "order", label: orderTerm } : null,
        pointsOn ? { value: "points", label: "Most points" } : null,
        hoursOn ? { value: "service", label: "Most service hours" } : null,
      ].filter((option): option is { value: DirectorySort; label: string } =>
        Boolean(option),
      ),
    [orderOffered, orderTerm, pointsOn, hoursOn],
  );
  // The Actives list alone: search looks across both lists, and the
  // Alumni tab has no sort (see the header). A sort the chapter no longer
  // offers falls back to the name.
  const sortsActives = !isSearching && tab === "actives";
  const effectiveSort: DirectorySort =
    sortsActives && sortOptions.some((option) => option.value === sort)
      ? sort
      : "name";
  const inFraternalOrder = effectiveSort === "order";
  const standingsMetric: StandingsMetric | null =
    effectiveSort === "points" || effectiveSort === "service"
      ? effectiveSort
      : null;
  const standings = useStandings(standingsMetric, standingsWindow);
  const periodLabel =
    standings.windowOptions.find((o) => o.value === standings.window)?.label ??
    "";
  const standingTotalOf = standings.totalOf;

  // The Filters sheet's rows, the ones web's Directory menu lists, built once
  // for both apps (`@repo/hooks/directory-filter-rows`, #5739).
  // A write lands on the filter as it reads now, so a pick hidden as stale
  // (a group that emptied, a role deleted) goes with any change or Clear all
  // instead of coming back when its option does. Functional, so Clear all's
  // writes, one per row, compose.
  const setFilter = (patch: Partial<ActivesFilter>) =>
    setActivesFilterPicks((picks) => ({
      ...effectiveActivesFilter(picks, knownPicks),
      ...patch,
    }));
  const rolesReady = rolesQuery.data !== undefined;
  const activesFilters: FilterSheetFilter[] = directoryFilterRows({
    role: {
      options: [
        // "No base role" (#5802) carries no colour, so it takes no dot.
        ...(offersNoBaseRole
          ? [{ value: NO_BASE_ROLE_FILTER, label: NO_BASE_ROLE_LABEL }]
          : []),
        ...filterRoles.map((role) => ({
          value: role.id,
          label: role.name,
          color: role.color ?? null,
        })),
      ],
      value: activesFilter.roleId,
      onChange: (roleId) => setFilter({ roleId }),
    },
    group: {
      options: filterGroups.map((g) => ({ value: g.id, label: g.name })),
      value: activesFilter.groupId,
      onChange: (groupId) => setFilter({ groupId }),
    },
    year: {
      options: yearOptions.map((year) => ({
        value: String(year),
        label: String(year),
      })),
      value:
        activesFilter.graduationYear === null
          ? null
          : String(activesFilter.graduationYear),
      onChange: (year) =>
        setFilter({ graduationYear: year === null ? null : Number(year) }),
    },
    pledgeClass: {
      label: classTerm,
      options: (pledgeClasses ?? []).map((c) => ({
        value: c.id,
        label: c.name,
      })),
      value: activesFilter.pledgeClassId,
      onChange: (pledgeClassId) => setFilter({ pledgeClassId }),
    },
    status: {
      value: activesFilter.status,
      onChange: (status) =>
        setFilter({ status: status as ActivesStatus | null }),
    },
    phoneReach: showsPhoneReach
      ? {
          label: PHONE_REACH_LABEL,
          options: PHONE_REACH_FILTER_OPTIONS,
          value: activesFilter.phoneReach,
          onChange: (phoneReach) =>
            setFilter({ phoneReach: phoneReach as PhoneReachFilter | null }),
        }
      : null,
    sort: {
      options: sortOptions,
      value: effectiveSort,
      defaultValue: "name",
      onChange: (value) => setSort(value as DirectorySort),
    },
    period: standingsMetric
      ? {
          options: standings.windowOptions,
          value: standings.window,
          onChange: setStandingsWindow,
        }
      : null,
  }).map((row) =>
    // Until `GET /v1/roles` answers, the Role list is empty for want of a
    // read, so its options say so instead of listing only "Any role".
    row.key === "role"
      ? {
          ...row,
          optionsNote: rolesReady
            ? undefined
            : rolesQuery.isError
              ? {
                  text: "Couldn't load roles.",
                  onRetry: () => void rolesQuery.refetch(),
                }
              : { text: "Loading roles…" },
          emptyNote: "This chapter has no roles yet.",
        }
      : row,
  );
  const activesFilterCount = filtersOn(activesFilters).length;
  // A standing and its period stay in sight with the sheet closed, as web's
  // count line names them.
  const standingLine = standingsMetric
    ? `${sortOptions.find((o) => o.value === effectiveSort)?.label ?? ""} · ${periodLabel}`
    : null;
  const shownActives = filteredActives.length;
  const rows = useMemo(() => {
    const selected = selectDirectoryRows(listData, {
      classNames,
      fraternalOrder:
        inFraternalOrder && pledgeClasses ? pledgeClasses : undefined,
    });
    if (!standingsMetric) return selected;
    // Highest first; a tie keeps the name order `selectDirectoryRows` gave.
    return [...selected].sort(
      (a, b) => standingTotalOf(b.userId) - standingTotalOf(a.userId),
    );
  }, [
    listData,
    classNames,
    inFraternalOrder,
    pledgeClasses,
    standingsMetric,
    standingTotalOf,
  ]);
  const standingsWaiting =
    !!standingsMetric && (standings.isLoading || standings.isError);
  const standingOf = (userId: string): RowStanding | undefined =>
    standingsMetric
      ? {
          rank: standings.rankOf(userId),
          figure: standings.figure(standings.totalOf(userId)),
          period: periodLabel,
          isViewer: userId === viewerUserId,
        }
      : undefined;
  // Counted, not selected: `selectDirectoryRows` maps and sorts, and sorting to
  // read a `.length` would run a full `localeCompare` sort over both lists on
  // every keystroke. `null` until the query succeeds, so a populated tab never
  // advertises "· 0" while it loads.
  const activesCount = useMemo(
    () => (membersQuery.isSuccess ? countMembers(actives) : null),
    [membersQuery.isSuccess, actives],
  );
  // `null` (no count shown, per the comment above) while filters are active:
  // the chip's job is reporting the chapter's total alumni, and once a filter
  // narrows `alumniQuery` that total isn't what it's counting any more — a
  // stale filtered number would misread as the real total once the officer
  // switches back to the Actives tab without clearing it.
  const alumniCount = useMemo(
    () =>
      alumniQuery.isSuccess && !hasAlumniFilters
        ? countMembers(alumniQuery.data)
        : null,
    [alumniQuery.isSuccess, alumniQuery.data, hasAlumniFilters],
  );

  const header = (
    <View style={[styles.header, { paddingTop: pinnedBackClearance(tokens) }]}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.title}>
          Directory
        </Text>
        <View style={styles.titleActions}>
          {/* Add roles (#4958): placement provisional, pending Paul. */}
          {pickable.roles.length > 0 ? (
            <Chip
              accessibilityRole="button"
              accessibilityState={{}}
              accessibilityHint="Pick the Non-chapter business roles you want, like intramurals."
              label="Add roles"
              on={false}
              quiet
              onPress={() => pickRolesSheetRef.current?.present()}
            />
          ) : null}
        </View>
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        // "Search members", web's word: `GET /v1/members/search` matches
        // more than the name, so "by name" undersold it (#4137).
        placeholder="Search members"
        accessibilityLabel="Search the directory"
        searchGlyph
      />

      {isSearching ? null : (
        <FilterChips
          accessibilityLabel="Actives or alumni"
          scroll
          quiet
          selected={tab}
          onSelect={(value) => setTab((value as Tab) ?? "actives")}
          chips={
            council
              ? []
              : [
                  { value: "actives", label: "Actives", count: activesCount },
                  { value: "alumni", label: "Alumni", count: alumniCount },
                ]
          }
          trailing={
            tab === "alumni" ? (
              <Chip
                accessibilityRole="button"
                accessibilityState={{ expanded: filtersOpen }}
                accessibilityLabel={
                  alumniFilterCount > 0
                    ? `Filters, ${alumniFilterCount} set`
                    : "Filters"
                }
                label={
                  alumniFilterCount > 0
                    ? `Filters · ${alumniFilterCount}`
                    : "Filters"
                }
                on={filtersOpen}
                quiet
                onPress={() => setFiltersOpen((open) => !open)}
              />
            ) : (
              <Chip
                accessibilityRole="button"
                accessibilityState={{}}
                accessibilityLabel={
                  activesFilterCount > 0
                    ? `Filters, ${activesFilterCount} set`
                    : "Filters"
                }
                accessibilityHint="Narrows the actives and changes their order."
                label={
                  activesFilterCount > 0
                    ? `Filters · ${activesFilterCount}`
                    : "Filters"
                }
                on={activesFilterCount > 0}
                quiet
                onPress={() => activesFilterSheetRef.current?.present()}
              />
            )
          }
        />
      )}

      {isSearching || tab !== "actives" ? null : (
        <ActiveFilterChips filters={activesFilters} />
      )}
      {standingLine ? (
        <Text accessibilityLiveRegion="polite" style={styles.reachLine}>
          {standingLine}
        </Text>
      ) : null}

      {isSearching || tab !== "alumni" || !filtersOpen ? null : (
        <View style={styles.alumniFilters}>
          <SearchField
            value={alumniFilterInputs.gradYear}
            onChangeText={(next) =>
              setAlumniFilterInputs((f) => ({ ...f, gradYear: next }))
            }
            placeholder="Graduation year, e.g. 2018"
            accessibilityLabel="Filter alumni by graduation year"
            keyboardType="number-pad"
          />
          <SearchField
            value={alumniFilterInputs.city}
            onChangeText={(next) =>
              setAlumniFilterInputs((f) => ({ ...f, city: next }))
            }
            placeholder="City"
            accessibilityLabel="Filter alumni by city"
            autoCapitalize="words"
          />
          <SearchField
            value={alumniFilterInputs.company}
            onChangeText={(next) =>
              setAlumniFilterInputs((f) => ({ ...f, company: next }))
            }
            placeholder="Company"
            accessibilityLabel="Filter alumni by company"
            autoCapitalize="words"
          />
        </View>
      )}
      {phoneReachLine ? (
        <Text accessibilityLiveRegion="polite" style={styles.reachLine}>
          {phoneReachLine}
        </Text>
      ) : null}
    </View>
  );

  function renderBody() {
    // A standing whose board didn't load draws no rows: ranking the chapter
    // at 0 would be a wrong answer, not a missing one.
    if (standingsMetric && standings.isError) {
      return (
        <ErrorState
          title="Couldn't load the standings"
          body="The totals for this period didn't load, so nobody is ranked. Try again, or pick another sort."
          onRetry={standings.refetch}
        />
      );
    }
    if (!chapterId) return <NoChapterState noun="the member directory" />;
    if (activeQuery.isError && activeQuery.data === undefined) {
      return (
        <ErrorState
          title={DIRECTORY_COPY.loadError}
          body={describeLoadFailure(activeQuery.error)}
          onRetry={() => void activeQuery.refetch()}
          isRetrying={activeQuery.isFetching}
        />
      );
    }
    // Empty-states plan rule 7: one line where the rows would be, with the
    // way back out of a search or a filter as its link (writing.md § Members).
    if (isSearching) {
      return (
        <InlineNote
          action={{ label: "Clear search", onPress: () => setQuery("") }}
        >
          {directoryNoSearchMatches(deferredQuery)}
        </InlineNote>
      );
    }
    if (tab === "alumni" && hasAlumniFilters) {
      return (
        <InlineNote
          action={{
            label: "Clear filters",
            onPress: () =>
              setAlumniFilterInputs({ gradYear: "", city: "", company: "" }),
          }}
        >
          {DIRECTORY_COPY.alumniNoFilterMatches}
        </InlineNote>
      );
    }
    if (tab === "actives" && activesFilterCount > 0) {
      return (
        <InlineNote
          action={{
            label: "Clear filters",
            onPress: () => setActivesFilterPicks(NO_ACTIVES_FILTER),
          }}
        >
          {DIRECTORY_COPY.activesNoFilterMatches}
        </InlineNote>
      );
    }
    return (
      <InlineNote>
        {tab === "actives"
          ? DIRECTORY_COPY.activesEmpty
          : DIRECTORY_COPY.alumniEmpty}
      </InlineNote>
    );
  }

  return (
    <View style={styles.safeArea}>
      {/* First in the tree, as `ScreenShell` places it, so a screen reader
          reaches it without swiping past every row. */}
      {canInvite && chapterId ? (
        <FloatingCreateButton
          label="Invite members"
          hint="Opens invites to email or share with new members."
          onPress={() =>
            router.push({ pathname: "/invite", params: { from: "directory" } })
          }
        />
      ) : null}
      {/* Every edge: the tab layout draws no navigator header (#2485), so the
        list's own title is the top of the screen. */}
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        {/* Pinned, as every screen's back capsule is (`ScreenShell`), inside an
          unpadded View so it sits where the content starts. */}
        <View style={styles.listFrame}>
          <PinnedBackRow back={BACK_TO_YOU} />
          <ScreenReady ready={!chapterId || !activeQuery.isPending} />
          <FlatList<DirectoryRow>
            // A standing waits for its board, so no row lands at 0 first.
            data={standingsWaiting ? [] : rows}
            keyExtractor={(item) => item.userId}
            ListHeaderComponent={header}
            ListEmptyComponent={
              // The skeleton stands in for the rows themselves, so it takes no
              // inset: the empty and error cards do.
              !!chapterId &&
              (activeQuery.isPending ||
                (standingsMetric && standings.isLoading)) ? (
                <MemberListSkeleton
                  label={
                    // A search looks across both lists and hides the tabs, so it
                    // names neither tab's list.
                    isSearching
                      ? "Searching chapter members"
                      : tab === "alumni"
                        ? "Loading alumni directory"
                        : "Loading chapter members"
                  }
                />
              ) : (
                <View style={styles.emptyWrap}>{renderBody()}</View>
              )
            }
            renderItem={({ item }) => (
              <MemberRow
                row={item}
                standing={standingOf(item.userId)}
                reach={rowReach(item.userId)}
                avatarTint={avatarTintFor(item.userId)}
                onPress={() =>
                  router.push({
                    pathname: "/member",
                    params: { userId: item.userId },
                  })
                }
              />
            )}
            contentContainerStyle={[
              styles.content,
              // Clear of the floating tab bar (`lib/floating-chrome.tsx`).
              {
                paddingBottom:
                  tokens.spacing.xl +
                  tabBarClearance +
                  // The last row clears the + too, as `ScreenShell` pads for it.
                  (canInvite ? CREATE_BUTTON_SIZE + FLOATING_TAB_BAR.gap : 0),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            refreshControl={<ThemedRefreshControl refresh={refresh} />}
          />
        </View>
        <PickRolesSheet ref={pickRolesSheetRef} roles={pickable.roles} />
        <FilterSheet
          ref={activesFilterSheetRef}
          title="Filter actives"
          filters={activesFilters}
          showLabel={`Show ${shownActives} ${shownActives === 1 ? "member" : "members"}`}
        />
      </SafeAreaView>
    </View>
  );
}

/**
 * A row's accessible name: who, their presence and custom status when known,
 * then the meta line.
 */
export function memberPressLabel(
  row: DirectoryRow,
  presence: MemberPresence = NO_PRESENCE,
  reach?: PhoneReach,
  standing?: RowStanding,
): string {
  return [
    standing?.rank ? `Ranked ${standing.rank}` : null,
    `View ${row.displayName}'s profile${standing?.isViewer ? ", you" : ""}`,
    standing ? `${standing.figure}, ${standing.period.toLowerCase()}` : null,
    presence.status ? presenceLabel(presence.status) : null,
    presence.line,
    row.meta,
    reach ? phoneReachStateLabel(reach.state) : null,
    reach ? phoneReachStaleNote(reach) : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Exported so a spec can assert on a row directly: `vitest.setup.ts` renders
 * `FlatList` as a string stand-in that never invokes `renderItem`.
 */
export function MemberRow({
  row,
  avatarTint,
  onPress,
  reach,
  standing,
}: {
  row: DirectoryRow;
  /** The member's place and the period's total, under a standings sort. */
  standing?: RowStanding;
  /**
   * The Phone app filter's answer for this member, drawn at the row's end
   * only while that filter is set (web draws it the same way).
   */
  reach?: PhoneReach;
  /** The member's initials paint (#3860); omit for the neutral circle. */
  avatarTint?: MemberAvatarTint | null;
  onPress?: () => void;
}) {
  // Their dot and custom status line (#4137), read for this row alone
  // (#4633): nothing until presence has synced, never a stand-in Offline.
  const presence = usePresenceOf(row.userId);
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const feedback = usePressFeedback();

  return (
    <Pressable
      // A `Pressable` collapses its children into one accessibility node, so
      // the meta line (role/company/city/grad-year) a sighted user still
      // sees below the name would otherwise go unannounced entirely — the
      // label has to carry it explicitly rather than relying on the nested
      // `Text` nodes.
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={
        onPress ? memberPressLabel(row, presence, reach, standing) : undefined
      }
      onPress={onPress}
      android_ripple={onPress ? feedback.ripple : undefined}
      style={({ pressed }) => [
        styles.row,
        onPress ? feedback.lift(pressed) : null,
      ]}
    >
      {standing ? (
        <Text style={styles.rowRank}>
          {standing.rank === null ? "" : `#${standing.rank}`}
        </Text>
      ) : null}
      <AvatarWithPresence
        status={presence.status}
        avatarSize={AVATAR_SIZE}
        ring={tokens.color.surface.background}
      >
        <MemberAvatar
          uri={row.avatarUrl}
          initials={row.initials}
          size={AVATAR_SIZE}
          tint={avatarTint}
          style={styles.avatar}
          textStyle={styles.avatarText}
        />
      </AvatarWithPresence>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>
          {row.displayName}
          {/* Your own row on a standing, so your place is found at a glance. */}
          {standing?.isViewer ? (
            <Text style={styles.rowYou}>{"  You"}</Text>
          ) : null}
        </Text>
        {/* The custom status line under the name, one line, as web's
            Directory row draws it (`components.md` § Chat member list). */}
        {presence.line ? (
          <Text numberOfLines={1} style={styles.rowStatusLine}>
            {presence.line}
          </Text>
        ) : null}
        {row.meta ? <Text style={styles.rowMeta}>{row.meta}</Text> : null}
        {reach && phoneReachStaleNote(reach) ? (
          <Text style={styles.rowMeta}>{phoneReachStaleNote(reach)}</Text>
        ) : null}
      </View>
      {standing ? (
        <Text
          style={[
            styles.rowFigure,
            // Nothing in the period is one more muted fact, not a standing.
            standing.rank === null ? styles.rowFigureNone : null,
          ]}
        >
          {standing.figure}
        </Text>
      ) : null}
      {reach ? (
        <Text
          style={[
            styles.rowReach,
            reach.state === "off"
              ? { color: tokens.color.semantic.warning }
              : null,
          ]}
        >
          {phoneReachStateLabel(reach.state)}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Name widths, cycled, so the placeholder roster doesn't read as a grid. */
const SKELETON_NAME_WIDTHS = [
  "46%",
  "34%",
  "52%",
  "40%",
  "30%",
  "44%",
] as const;

/**
 * The roster's loading state: member rows on {@link MemberRow}'s own styles,
 * an avatar-sized circle and the name and meta lines, split by the same
 * hairlines, so the real rows land in place.
 */
export function MemberListSkeleton({
  label,
  rows = 6,
}: {
  /** writing.md §7's string for the tab that is loading. */
  label: string;
  rows?: number;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const { role } = tokens.typography;

  return (
    <SkeletonRegion label={label} flush>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.row}>
          <SkeletonBlock
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            radius={avatarRadius(AVATAR_SIZE)}
          />
          <View style={styles.rowText}>
            <SkeletonText
              role={role.label}
              width={SKELETON_NAME_WIDTHS[index % SKELETON_NAME_WIDTHS.length]!}
            />
            <SkeletonText role={role.caption} width="28%" />
          </View>
        </View>
      ))}
    </SkeletonRegion>
  );
}

/** How many of the alumni filters hold a value: a new key counts with no edit here. */
function countSetFilters(filters: Record<string, string | undefined>): number {
  return Object.values(filters).filter(Boolean).length;
}

/** Rows the directory would draw, without the map-and-sort of a full select. */
function countMembers(data: unknown): number {
  return records(data).filter((row) => str(row, "user_id")).length;
}

/** The member row's avatar, which its skeleton draws at the same size. */
const AVATAR_SIZE = 40;

function createStyles(tokens: SignetTokens) {
  const avatarSize = AVATAR_SIZE;
  return StyleSheet.create({
    listFrame: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      backgroundColor: tokens.color.surface.background,
    },
    content: {
      width: "100%",
      maxWidth: 880,
      alignSelf: "center",
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
    },
    header: {
      paddingTop: tokens.spacing.lg,
      gap: tokens.spacing.sm,
      paddingBottom: tokens.spacing.sm,
    },
    alumniFilters: {
      gap: tokens.spacing.sm,
    },
    // ScreenShell's own title style: this screen draws its own header only
    // because its body is a FlatList.
    // Shrinks before the Add roles chip beside it does.
    title: { ...screenTitleStyle(tokens), flexShrink: 1 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingVertical: tokens.spacing.md,
      // A square row: hairlines split the list, so no radius.
      ...gutterBleed(tokens, { rounded: false }),
      minHeight: tokens.touch.minimum,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.color.border.hairline,
    },
    avatar: {
      width: avatarSize,
      height: avatarSize,
      borderRadius: avatarRadius(avatarSize),
      backgroundColor: tokens.color.surface.popover,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    rowText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    rowName: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
    rowMeta: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    reachLine: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    rowReach: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      flexShrink: 0,
    },
    rowRank: {
      ...typeRole(tokens.typography.role.caption),
      fontFamily: MONO_FONT_FAMILY,
      color: tokens.color.text.mutedForeground,
      minWidth: tokens.spacing.xl + tokens.spacing.sm,
      fontVariant: ["tabular-nums"],
    },
    rowYou: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    rowFigure: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
      flexShrink: 0,
      fontVariant: ["tabular-nums"],
    },
    rowFigureNone: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    // The status line reads before the meta line: mutedForeground, one
    // step up the ladder, as the member profile and web draw it.
    rowStatusLine: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    titleActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    emptyWrap: {
      paddingTop: tokens.spacing.md,
    },
  });
}
