import { type ComponentType, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useCurrentChapter,
  useCurrentUser,
  useEvents,
  useHiddenUnsetFeatures,
  useInvoices,
  useLeaderboard,
  useListChapters,
  useMyPermissions,
  useMyPoints,
  useMyProfileStats,
  useNowDate,
  usePermissionList,
  useViewerUserId,
} from "@repo/hooks";
import { MEMBER_STATUS_LABEL, untilLabel } from "@repo/hooks/member-status";
import { SignetTokens } from "@repo/theme/signet";
import {
  can,
  isBetaOffModule,
  isModuleEnabled,
  SECTION_NAMES,
} from "@repo/validation";
import { ScreenShell } from "@/components/screen-shell";
import { LeadTile } from "@/components/lead-tile";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import {
  ChapterGlyph,
  DirectoryGlyph,
  DocumentsGlyph,
  DuesGlyph,
  HostCheckInGlyph,
  InviteGlyph,
  RecruitmentGlyph,
  SettingsGlyph,
} from "@/components/more/more-glyphs";
import { StatusChip } from "@/components/status-chip";
import { StatusDot } from "@/components/account/status-dot";
import { StatusSheet } from "@/components/account/status-sheet";
import {
  EditProfileSheet,
  type EditProfileField,
} from "@/components/profile/edit-profile-sheet";
import { ErrorState } from "@/components/state-block";
import { StandingCards } from "@/components/activity/standing-cards";
import { PointsSummaryLine } from "@/components/tasks/points-summary-line";
import { selectHouseRank, selectPointsSummary } from "@/lib/tasks/points-card";
import {
  PointsLabel,
  ProfileDetails,
  ProfileHead,
  ProfileSkeleton,
} from "@/components/you/profile-sections";
import { OwnCustomFieldsSection } from "@/components/you/own-custom-fields";
import { useOwnStatus } from "@/lib/account/own-status";
import { COUNCIL_FORM_COPY } from "@/lib/onboarding/council-form";
import { useIsCouncil } from "@/lib/tenant-kind";
import {
  destinationHue,
  type YouDestination,
} from "@/lib/more/destination-hue";
import { selectHostableEvent } from "@/lib/events/select";
import { useRushEntry } from "@/lib/rush/rush-entry";
import { selectViewerProfile } from "@/lib/more/profile";
import {
  dueChip,
  selectInvoiceRows,
  selectNextDueInvoice,
} from "@/lib/dues/invoices";
import {} from "@/lib/study/format";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The You tab (#3839): the member's own profile and everything that is
 * theirs, on one screen, behind their avatar in the tab bar. It took in s09
 * (the More hub, `canvas-screens.dc.html:326`) and s15 (Profile, `:497`),
 * which were two doors to one person: a profile card on More that pushed
 * Profile, and Profile again from Chat home's avatar menu. Instagram, Slack,
 * Discord and WhatsApp each draw the member as their last tab and open one
 * screen there, the profile on top and the member's own settings and tools
 * under it.
 *
 * ## Order
 *
 * The member's points at the top right, beside the title (#5281), pressed to
 * open them (#5950), then the
 * profile's head (photo and name, `components/you/profile-sections.tsx`), then
 * Status, then Last week and This semester (`StandingCards`, #5779: how the
 * member is standing, which Activity no longer shows; web draws them on the
 * profile beside Points), then the rows the More
 * hub held, then the Admin group, then Details and Bio. The rows come before
 * Details because they are what a member opens the tab for most days; the
 * details are set once and read rarely, so they close the screen.
 *
 * Status (#3845) moved here from the avatar's menu on Chat home, as Discord
 * and Slack keep it on the profile they open from their last tab.
 *
 * ## Editing
 *
 * Tap what you want to change (#3711, Paul 2026-11-07: "The pencil button
 * isn't obvious; drop it"): the name, the bio and the rows that are the
 * member's to set open `EditProfileSheet` at the field tapped (#5280), and the
 * photo edits in place. The
 * editable parts are drawn only once the profile has loaded, because a sheet
 * opened on the loading or error state would prefill blanks over fields
 * already set. The rows below the head never wait on the profile.
 *
 * ## Grouping
 *
 * The board draws one group (Study hours through Settings) and an Admin group.
 * The app splits the first in two, chapter tools and then your own Settings.
 * Study hours and Service hours left the rows with #5950: standing is a fact
 * about a person, so they open from the This semester gauges above, which
 * show their numbers, and from New, where a member with nothing yet starts.
 *
 * Notifications are not here: the inbox is the bell on Chat home, beside the
 * unread counts it belongs with (#3362, #3839).
 *
 * **Switch chapter** and **Chapter settings** left You on 2026-11-19 for the
 * chapter menu that Chat home's chapter name opens
 * (`components/chat/chapter-menu.tsx`), the door web has (Paul: "can we move chapter settings into one place?"). When
 * `GET /v1/chapters` is empty, You draws **Create a chapter** after Settings
 * (#1084), so a first officer who landed in the tabs still has a door: with
 * no chapter there is no chapter name to open.
 *
 * ## The admin section, and why it may look empty
 *
 * The gate is `usePermissionList()` + `can`, the pattern `host-check-in.tsx`
 * established. The underlying `useMyPermissions` hook is `enabled:
 * !!chapterId`, so a user with no claim gets an empty permission set and the
 * section renders for nobody, Presidents included. It fails closed, which is
 * the right direction.
 *
 * It holds Invite members (`members:invite`, owner ask 2026-11-06: the phone
 * had no way to invite) and Host check-in (`events:update`),
 * each row drawn only for a role that holds its permission, and the section
 * only when one row is.
 *
 * Canvas labels the section "ADMIN · PRESIDENT", the viewer's role name. No
 * role string is readable on mobile (`/v1/users/me/permissions` returns
 * permissions only), so it reads "Admin".
 *
 * ## Rows nobody has set up
 *
 * Resources (Documents, with posted minutes filed in it since #5949) with
 * nothing in it leaves the list for a viewer who can't upload, unless the
 * chapter keeps minutes in Frapp; an officer who can upload keeps the row,
 * because the upload is on that screen (`useHiddenUnsetFeatures` in
 * `@repo/hooks`; `spec/product/modules.md` § Not-set-up features). Nothing
 * hides until the viewer's permissions, the
 * chapter's modules and the list have all answered, so a row never vanishes
 * on a slow or failed read.
 *
 * ## Trailing statuses
 *
 * Dues draws its next due date; it renders no placeholder while its query is
 * in flight. Study and service hours have no rows here since #5950: their
 * numbers are the This semester gauges, which open their screens.
 */
export default function YouTab() {
  return useIsCouncil() ? <CouncilYouScreen /> : <YouScreen />;
}

function YouScreen() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  // Every row that opens a place leads with that place's tile, in its own
  // fixed hue (`lib/more/destination-hue.ts`; Paul, 2026-11-12). Never the
  // chapter accent: an icon that labels a row doesn't take it (foundations.md
  // §6, "Where the accent goes"). A row that can't be opened now goes grey
  // with its label.
  const tile = (
    Glyph: ComponentType<{ color: string }>,
    place: YouDestination,
    disabled = false,
  ) => {
    const hue = disabled ? undefined : destinationHue(place);
    return (
      <LeadTile on="card" hue={hue} testID={`you-tile-${place}`}>
        <Glyph color={hue ?? tokens.color.text.disabled} />
      </LeadTile>
    );
  };

  const you = useYouProfile();

  const chaptersQuery = useListChapters();
  const hasNoChapters =
    chaptersQuery.isSuccess &&
    Array.isArray(chaptersQuery.data) &&
    chaptersQuery.data.length === 0;
  const permissions = usePermissionList();
  // `can` from @repo/validation, never a bare `includes` — an owner's
  // grant is the wildcard `*`, so a membership test would hide the Admin
  // section from exactly the people who need it.
  const canHost = can("events:update", permissions);
  // Every invite route checks `members:invite`; by default the President's.
  const canInvite = can("members:invite", permissions);
  // The chapter's side of settings (#4074), for whoever has a page there.

  // The setup gate needs to tell "still loading" from "holds nothing", which
  // `usePermissionList` (`[]` while loading) can't, so it reads the query.
  const permissionsQuery = useMyPermissions();
  const chapter = useCurrentChapter().data;
  const moduleGate = useMemo(
    () =>
      chapter
        ? (key: string) => isModuleEnabled(chapter.enabled_modules, key)
        : undefined,
    [chapter],
  );
  const rush = useRushEntry();
  const hiddenFeatures = useHiddenUnsetFeatures(
    permissionsQuery.data?.permissions,
    moduleGate,
  );
  // Resources (#5949): the Documents row's condition or the Minutes row's.
  const showResources =
    !hiddenFeatures.has("documents") || !!moduleGate?.("meetings");

  // s22 takes an `eventId`, so the row resolves one rather than leading
  // nowhere: the soonest upcoming or still checkable-in event that takes
  // attendance (`selectHostableEvent`).
  const eventsQuery = useEvents();
  // `now` ticks rather than being read once inside the memo below: React
  // Query's structural sharing keeps `data` referentially stable across a
  // refetch that returns identical rows, so a captured `new Date()` would
  // keep targeting an event whose check-in window has since closed.
  const now = useNowDate();

  const nextEvent = useMemo(() => {
    if (!canHost) return null;
    return selectHostableEvent(eventsQuery.data, now);
  }, [canHost, eventsQuery.data, now]);

  // The Dues row's trailing status reads the viewer's own invoices.
  const viewerUserId = useViewerUserId();
  // The Dues row hides only while dues is off for every chapter in the beta
  // (`BETA_OFF_MODULES`). A chapter's own dues switch leaves it, so a member
  // can still pay an invoice the chapter already sent
  // (`spec/product/modules.md` § Module disabling behavior).
  const duesOn = !isBetaOffModule("dues");
  // Viewer-filtered server-side, for the reason `dues.tsx` records: unfiltered,
  // this row would pull the whole chapter's ledger onto an officer's device.
  const invoicesQuery = useInvoices(viewerUserId ?? undefined, {
    enabled: duesOn && !!viewerUserId,
  });

  // The member's points, at the top right (#5281), pressed to open them
  // (#5950). Nothing at zero or with Points off; a failed read says so with a
  // dash rather than reading as zero. A module counts as on until the chapter
  // has loaded, so nothing vanishes on a slow read (`isModuleEnabled`: absence
  // is not disablement). Service hours is not asked for: its number is on the
  // This semester gauge and on its own screen.
  const pointsOn = moduleGate?.("points") ?? true;
  const stats = useMyProfileStats({ points: pointsOn, service: false });
  const showPoints =
    pointsOn &&
    stats.visible &&
    (stats.pointsFailed || (stats.points !== null && stats.points !== 0));

  // The semester line, "1,240 semester points · #3 of 42 in the house"
  // (#5948): the Tasks screen's head until it folded into Activity. Under
  // the profile's head, beside the standing it belongs with; the figure at
  // the top right is the all-time balance. Read only where the gauges are.
  const semesterOn = pointsOn && stats.visible && stats.hasChapter;
  const semesterPoints = useMyPoints("semester", undefined, {
    enabled: semesterOn,
  });
  const semesterBoard = useLeaderboard("semester", undefined, {
    enabled: semesterOn,
  });
  const semesterSummary = useMemo(
    () => selectPointsSummary(semesterPoints.data),
    [semesterPoints.data],
  );
  const houseRank = useMemo(
    () => selectHouseRank(semesterBoard.data, viewerUserId),
    [semesterBoard.data, viewerUserId],
  );

  const duesDue = useMemo(() => {
    if (!invoicesQuery.data || !viewerUserId) return null;
    const next = selectNextDueInvoice(
      selectInvoiceRows(invoicesQuery.data, viewerUserId),
    );
    return next ? dueChip(next, now) : null;
  }, [invoicesQuery.data, viewerUserId, now]);

  return (
    <ScreenShell
      title="You"
      headerAction={
        showPoints ? (
          <PointsLabel
            points={stats.points}
            failed={stats.pointsFailed}
            onPress={() => router.push("/points")}
          />
        ) : undefined
      }
    >
      <YouHead you={you} />

      {semesterOn ? (
        <PointsSummaryLine summary={semesterSummary} rank={houseRank} />
      ) : null}

      {/* Last week and This semester (#5779): only with a chapter, whose
          reads they are. Each gauge is the door to what is behind its number
          (#5950): your points, your service hours, study. Study hours and
          Service hours were rows of their own under this until then; they
          are also in New, which is where a member with no hours yet starts. */}
      {stats.hasChapter ? <StandingCards /> : null}

      <ListSection>
        {duesOn ? (
          <ListRow
            label="Dues"
            leading={tile(DuesGlyph, "dues")}
            accessibilityHint="Opens your dues and payment history."
            accessibilityValue={duesDue?.label}
            trailing={
              duesDue ? (
                <StatusChip
                  label={duesDue.label}
                  // foundations.md §5 assigns "overdue" to the destructive role.
                  // A late bill reading the same as an upcoming one is the
                  // confusion the semantic palette exists to prevent.
                  hue={
                    duesDue.state === "past-due"
                      ? tokens.color.semantic.destructive
                      : tokens.color.semantic.warning
                  }
                />
              ) : undefined
            }
            onPress={() => router.push("/dues")}
          />
        ) : null}
        {/* One row for what the chapter keeps (#5949), as web's sidebar has
            one: Documents, where a meeting's posted minutes are filed. Drawn
            while Documents is shown or the chapter keeps minutes in Frapp,
            the two rows' conditions until then. Backwork, web's other view
            there, isn't on the phone (#2258). */}
        {showResources ? (
          <ListRow
            label={SECTION_NAMES.resources}
            leading={tile(DocumentsGlyph, "resources")}
            accessibilityHint="Opens the chapter's documents and meeting minutes."
            onPress={() => router.push("/documents")}
          />
        ) : null}
        <ListRow
          label={SECTION_NAMES.directory}
          leading={tile(DirectoryGlyph, "directory")}
          accessibilityHint="Opens the member directory."
          onPress={() => router.push("/directory")}
        />
        {/* The recruitment pipeline (#5924), named with the chapter's own
            word ("Rush", "Intake"), only with Recruitment on and for a role
            that may open it (`useRushEntry`). A row, not a fifth tab. */}
        {rush.show ? (
          <ListRow
            label={rush.term}
            leading={tile(RecruitmentGlyph, "recruitment")}
            accessibilityHint="Opens the chapter's prospects."
            onPress={() => router.push("/rush")}
          />
        ) : null}
      </ListSection>

      <ListSection>
        <ListRow
          label="Settings"
          leading={tile(SettingsGlyph, "settings")}
          accessibilityHint="Opens notifications, quiet hours and your account."
          onPress={() => router.push("/preferences")}
        />
        {/* Switch chapter is in the chapter menu on Chat home's chapter
            name since 2026-11-19, as on web. Create a chapter stays here: a
            member with no chapter has no chapter name to open. */}
        {hasNoChapters ? (
          <ListRow
            label="Create a chapter"
            leading={tile(ChapterGlyph, "chapter")}
            accessibilityHint="Opens the chapter setup wizard."
            onPress={() => router.push("/(auth)/create-chapter")}
          />
        ) : null}
        {hasNoChapters ? (
          <ListRow
            label={COUNCIL_FORM_COPY.start}
            leading={tile(ChapterGlyph, "chapter")}
            accessibilityHint={COUNCIL_FORM_COPY.startHint}
            onPress={() =>
              router.push({
                pathname: "/(auth)/create-chapter",
                params: { kind: "council" },
              })
            }
          />
        ) : null}
      </ListSection>

      {canHost || canInvite ? (
        <>
          <SectionHeader>Admin</SectionHeader>
          <ListSection>
            {canInvite ? (
              <ListRow
                label="Invite members"
                leading={tile(InviteGlyph, "invite")}
                accessibilityHint="Opens invites to email or share with new members."
                onPress={() => router.push("/invite")}
              />
            ) : null}
            {canHost ? (
              <ListRow
                label="Host check-in"
                leading={tile(HostCheckInGlyph, "hostCheckIn", !nextEvent)}
                accessibilityValue={
                  nextEvent ? nextEvent.name : "No upcoming event"
                }
                trailing={
                  <Text numberOfLines={1} style={styles.eventName}>
                    {nextEvent ? nextEvent.name : "No upcoming event"}
                  </Text>
                }
                disabled={!nextEvent}
                // A disabled row's hint is not what it would open, which it
                // cannot do; its value already says why.
                accessibilityHint={
                  nextEvent
                    ? "Opens the host check-in display for the next event."
                    : undefined
                }
                onPress={() => {
                  if (!nextEvent) return;
                  // Object form: the only navigation shape `lib/routes.spec.ts`
                  // matches when a param is involved.
                  router.push({
                    pathname: "/host-check-in",
                    params: { eventId: nextEvent.id },
                  });
                }}
              />
            ) : null}
          </ListSection>
        </>
      ) : null}

      <YouFoot you={you} />
    </ScreenShell>
  );
}

/**
 * What both kinds of You share: the member's own profile, status and
 * details, and the two sheets their rows open (`spec/ui/mobile/patterns.md`
 * § Bottom sheets: hosted by the screen whose rows open them).
 */
function useYouProfile() {
  const userQuery = useCurrentUser();
  const profile = useMemo(
    () => selectViewerProfile(userQuery.data),
    [userQuery.data],
  );
  // Only an error with nothing cached: TanStack keeps `data` through a failed
  // background refetch, and swapping the head out then would drop what was
  // typed into the Edit sheet. The web panel has the same guard.
  const profileFailed = userQuery.isError && userQuery.data === undefined;
  const profileLoaded = !userQuery.isPending && !profileFailed;
  const editSheetRef = useRef<BottomSheetModal>(null);
  // The field the sheet opens at: the one the member tapped (#5280).
  const [editAt, setEditAt] = useState<EditProfileField>("displayName");
  const openEditor = (field: EditProfileField) => {
    setEditAt(field);
    editSheetRef.current?.present();
  };
  const statusSheetRef = useRef<BottomSheetModal>(null);
  const own = useOwnStatus();
  const status = own?.status ?? "online";
  const statusSub = own?.statusEndsAt
    ? untilLabel(own.statusEndsAt, new Date())
    : (own?.line ?? null);
  return {
    userQuery,
    profile,
    profileFailed,
    profileLoaded,
    editSheetRef,
    editAt,
    openEditor,
    statusSheetRef,
    status,
    statusSub,
  };
}

type YouProfile = ReturnType<typeof useYouProfile>;

/** The profile's head, then Status. */
function YouHead({ you }: { you: YouProfile }) {
  const {
    userQuery,
    profile,
    profileFailed,
    openEditor,
    status,
    statusSub,
    statusSheetRef,
  } = you;
  return (
    <>
      {userQuery.isPending ? (
        <ProfileSkeleton />
      ) : profileFailed ? (
        <ErrorState
          title="Couldn't load your profile"
          body="You're signed in, but we couldn't reach the server."
          onRetry={() => void userQuery.refetch()}
          isRetrying={userQuery.isFetching}
        />
      ) : (
        <ProfileHead profile={profile} onEdit={openEditor} />
      )}

      <ListSection>
        {/* Status first under the head, as Discord and Slack put it at the
            top of the member's own screen: it opens the status sheet. */}
        <ListRow
          label="Status"
          leading={<StatusDot status={status} />}
          value={MEMBER_STATUS_LABEL[status]}
          description={statusSub ?? undefined}
          accessibilityHint="Opens your status and custom status."
          onPress={() => statusSheetRef.current?.present()}
        />
      </ListSection>
    </>
  );
}

/** Details and Bio close the screen, then the sheets. */
function YouFoot({ you }: { you: YouProfile }) {
  const {
    profileLoaded,
    profile,
    openEditor,
    editSheetRef,
    editAt,
    statusSheetRef,
  } = you;
  return (
    <>
      {profileLoaded ? (
        <>
          <ProfileDetails profile={profile} onEdit={openEditor} />
          {/* The chapter's own fields, every tier, with who sees each (#581). */}
          <OwnCustomFieldsSection />
        </>
      ) : null}

      {profileLoaded ? (
        <EditProfileSheet
          ref={editSheetRef}
          profile={profile}
          openAt={editAt}
        />
      ) : null}
      <StatusSheet ref={statusSheetRef} />
    </>
  );
}

/**
 * You in a council (#5933). A council reads no chapter route (points, study,
 * service, dues, documents, minutes and events all answer it 403), so its
 * You is the member's own: profile, Status, the Directory and Settings, and
 * Invite members for whoever can invite, as Slack's and Discord's profile
 * tab is the same in every workspace or server. It grows as the council's
 * own areas land (`council-types.md` § What each council's space shows).
 */
function CouncilYouScreen() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const you = useYouProfile();
  const canInvite = can("members:invite", usePermissionList());
  const tile = (
    Glyph: ComponentType<{ color: string }>,
    place: YouDestination,
  ) => {
    const hue = destinationHue(place);
    return (
      <LeadTile on="card" hue={hue} testID={`you-tile-${place}`}>
        <Glyph color={hue ?? tokens.color.text.disabled} />
      </LeadTile>
    );
  };

  return (
    <ScreenShell title="You">
      <YouHead you={you} />
      <ListSection>
        <ListRow
          label="Directory"
          leading={tile(DirectoryGlyph, "directory")}
          accessibilityHint="Opens the member directory."
          onPress={() => router.push("/directory")}
        />
        <ListRow
          label="Settings"
          leading={tile(SettingsGlyph, "settings")}
          accessibilityHint="Opens notifications, quiet hours and your account."
          onPress={() => router.push("/preferences")}
        />
      </ListSection>
      {canInvite ? (
        <>
          <SectionHeader>Admin</SectionHeader>
          <ListSection>
            <ListRow
              label="Invite members"
              leading={tile(InviteGlyph, "invite")}
              accessibilityHint="Opens invites to email or share with new members."
              onPress={() => router.push("/invite")}
            />
          </ListSection>
        </>
      ) : null}
      <YouFoot you={you} />
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    // A long event name truncates rather than pushing the label off the row.
    eventName: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      maxWidth: 160,
    },
  });
}
