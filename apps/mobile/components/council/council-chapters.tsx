import { useRef, useState } from "react";
import {
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  affiliationErrorCopy,
  useDecideCouncilChapter,
  useInviteChapter,
  type CouncilChapterRow,
  type InviteCandidate,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import type { SignetTokens } from "@repo/theme/signet";
import {
  chapterInitials,
  COUNCIL_CHAPTERS_COPY,
  councilLinkLabel,
} from "@repo/validation";
import { TextAction } from "@/components/events/event-excuses";
import {
  itemMenuAccessibility,
  openItemMenu,
  pressAt,
  type ItemMenu,
} from "@/components/item-actions-menu";
import { LEAD_TILE_SIZE, LeadTile } from "@/components/lead-tile";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { InviteGlyph } from "@/components/more/more-glyphs";
import { ChapterMarkTile } from "@/components/onboarding/chapter-mark-tile";
import { OptionSheet } from "@/components/option-sheet";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { StatusChip } from "@/components/status-chip";
import { tintedControlStyles } from "@/components/tinted-control";
import { useChapterBranding } from "@/lib/chapter-branding";
import {
  chapterListingLine,
  councilChapterActions,
  COUNCIL_CHAPTERS_PHONE_COPY as PHONE_COPY,
  groupCouncilChapters,
  orderedInviteCandidates,
  type CouncilChapterAction,
} from "@/lib/council/chapters";
import { useConnection } from "@/lib/connection/use-connection";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { destinationHue } from "@/lib/more/destination-hue";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** What the section reads; the home owns the queries so a pull refreshes them. */
interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * The council's Chapters, on its home (#5974; `spec/behavior/council-types.md`
 * § What each council's space shows). The phone has no Chapters route (the
 * stack's routes are frozen), so the list is a section of the home, in the
 * order an officer works it:
 *
 * - **Waiting on you**: chapters that asked to join, each with Decline and
 *   Accept on the row. Only a `council:chapters_manage` holder sees it; it
 *   waits on them, and a delegate can't answer it.
 * - **Member chapters**: accepted and suspended, by name, a suspended one
 *   with its chip. A manager's tap or long press opens the row's glass menu
 *   (Suspend or Reinstate, then Remove from council, red and last); Suspend
 *   and Remove ask first. Invite a chapter is the first row, where the
 *   first chapter would go, and opens the chapters at the school, offered
 *   ones first.
 * - **Invited**: the council's invitations not yet answered; a manager's
 *   menu offers Cancel invite.
 *
 * Each chapter is its initials tile, its name, and its kind and school: its
 * public listing, never anything of its members (#4068 decision 11).
 *
 * Slack Connect's workspace invitations (pending requests answered with
 * Accept or Decline, invitations listed until the other side answers) and
 * GitHub's organization membership requests read the same way: what waits
 * on you first, the members, then what waits on them.
 */
export function CouncilChapters({
  permissions,
  canManage,
  chapters,
  candidates,
}: {
  permissions: readonly string[];
  canManage: boolean;
  chapters: QueryLike<CouncilChapterRow[]>;
  candidates: QueryLike<InviteCandidate[]>;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const branding = useChapterBranding();
  const tinted = tintedControlStyles(
    tokens,
    branding,
    tokens.typography.role.caption,
  );
  const { writeBlockedReason } = useConnection();
  const decide = useDecideCouncilChapter();
  const invite = useInviteChapter();
  const sheetRef = useRef<BottomSheetModal>(null);
  // One write at a time; the ref holds before state settles.
  const running = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tile = (name: string) => (
    <ChapterMarkTile
      text={chapterInitials(name)}
      // Another chapter's mark: a neutral tile, never this council's accent.
      accent={tokens.color.text.muted}
      size={LEAD_TILE_SIZE.row}
    />
  );

  if (chapters.isPending) {
    return (
      <SkeletonRegion label={PHONE_COPY.loading}>
        <View style={styles.stack}>
          <SectionHeader>{COUNCIL_CHAPTERS_COPY.members}</SectionHeader>
          <ListSection>
            <ListRowSkeleton index={0} description />
            <ListRowSkeleton index={1} description />
          </ListSection>
        </View>
      </SkeletonRegion>
    );
  }

  if (!chapters.data) {
    return (
      <View style={styles.stack}>
        <SectionHeader>{COUNCIL_CHAPTERS_COPY.members}</SectionHeader>
        <ErrorState
          title={COUNCIL_CHAPTERS_COPY.loadFailedTitle}
          body={describeLoadFailure(chapters.error)}
          onRetry={() => void chapters.refetch()}
          isRetrying={chapters.isFetching}
        />
      </View>
    );
  }

  const groups = groupCouncilChapters(chapters.data);
  const requests = canManage ? groups.requests : [];
  const empty =
    requests.length === 0 &&
    groups.members.length === 0 &&
    groups.invited.length === 0;

  async function run(row: CouncilChapterRow, action: CouncilChapterAction) {
    if (running.current) return;
    const name = row.chapter.name;
    if (action.key === "suspend" || action.key === "remove") {
      const suspend = action.key === "suspend";
      const go = await confirmAlert({
        title: suspend
          ? COUNCIL_CHAPTERS_COPY.suspendTitle(name)
          : COUNCIL_CHAPTERS_COPY.removeTitle(name),
        body: suspend
          ? COUNCIL_CHAPTERS_COPY.suspendBody
          : COUNCIL_CHAPTERS_COPY.removeBody,
        confirmLabel: suspend ? action.label : PHONE_COPY.removeConfirm,
        destructive: action.destructive,
      });
      if (!go || running.current) return;
    }
    running.current = true;
    setBusyId(row.link.id);
    setError(null);
    try {
      await decide.mutateAsync({ linkId: row.link.id, status: action.status });
    } catch (caught) {
      setError(
        affiliationErrorCopy(caught, COUNCIL_CHAPTERS_COPY.actionFailed),
      );
    } finally {
      running.current = false;
      setBusyId(null);
    }
  }

  async function inviteChapter(chapterId: string | null) {
    if (!chapterId || running.current) return;
    running.current = true;
    setInviting(true);
    setError(null);
    try {
      await invite.mutateAsync(chapterId);
    } catch (caught) {
      setError(
        affiliationErrorCopy(caught, COUNCIL_CHAPTERS_COPY.inviteFailed),
      );
    } finally {
      running.current = false;
      setInviting(false);
    }
  }

  /** A member's or an invite's glass menu, opened by a tap or a long press. */
  function menuRowProps(row: CouncilChapterRow) {
    const actions = councilChapterActions(row, permissions);
    if (actions.length === 0) return {};
    const menu: ItemMenu = {
      title: row.chapter.name,
      actions: actions.map((action) => ({
        key: action.key,
        label: action.label,
        destructive: action.destructive,
        run: () => void run(row, action),
      })),
    };
    const open = (event?: GestureResponderEvent) => {
      if (running.current) return;
      openItemMenu(menu, pressAt(event));
    };
    return {
      action: true,
      busy: busyId === row.link.id,
      accessibilityHint: PHONE_COPY.rowHint,
      onPress: open,
      onLongPress: () => open(),
      ...itemMenuAccessibility({
        ...menu,
        open: (pageY, trigger) => openItemMenu(menu, { pageY, trigger }),
      }),
    };
  }

  const candidateRows = orderedInviteCandidates(candidates.data ?? []);
  const noCandidates =
    candidates.data !== undefined && candidateRows.length === 0;
  const inviteRow = canManage ? (
    <ListRow
      key="invite"
      label={COUNCIL_CHAPTERS_COPY.invite}
      leading={
        <LeadTile on="card" hue={destinationHue("invite")}>
          <InviteGlyph color={destinationHue("invite")} />
        </LeadTile>
      }
      description={
        noCandidates
          ? COUNCIL_CHAPTERS_COPY.noCandidates
          : candidates.isError && !candidates.data
            ? describeLoadFailure(candidates.error)
            : null
      }
      accessibilityHint={writeBlockedReason ?? PHONE_COPY.inviteHint}
      busy={inviting || (candidates.isPending && candidates.isFetching)}
      disabled={noCandidates || writeBlockedReason !== null}
      onPress={() => {
        if (candidates.isError && !candidates.data) {
          void candidates.refetch();
          return;
        }
        sheetRef.current?.present();
      }}
    />
  ) : null;

  return (
    <View style={styles.stack}>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.problem}>
          {error}
        </Text>
      ) : null}

      {requests.length > 0 ? (
        <>
          <SectionHeader count={requests.length}>
            {COUNCIL_CHAPTERS_COPY.requests}
          </SectionHeader>
          <ListSection>
            {requests.map((row) => {
              const [accept, decline] = councilChapterActions(row, permissions);
              const disabled = busyId !== null || writeBlockedReason !== null;
              const busy = busyId === row.link.id;
              return (
                <ListRow
                  key={row.link.id}
                  label={row.chapter.name}
                  leading={tile(row.chapter.name)}
                  description={chapterListingLine(row.chapter)}
                  trailing={
                    accept && decline ? (
                      <View style={styles.decisions}>
                        <TextAction
                          label={decline.label}
                          compact
                          disabled={disabled}
                          hint={writeBlockedReason ?? undefined}
                          onPress={() => void run(row, decline)}
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${accept.label} ${row.chapter.name}`}
                          accessibilityState={{ disabled, busy }}
                          accessibilityHint={writeBlockedReason ?? undefined}
                          disabled={disabled}
                          hitSlop={tokens.spacing.sm}
                          onPress={() => void run(row, accept)}
                          style={({ pressed }) => [
                            styles.accept,
                            tinted.surface,
                            disabled && !busy
                              ? tinted.disabled
                              : pressed
                                ? tinted.pressed
                                : null,
                          ]}
                        >
                          <Text
                            style={[
                              tinted.label,
                              disabled && !busy ? tinted.disabledLabel : null,
                            ]}
                          >
                            {accept.label}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null
                  }
                />
              );
            })}
          </ListSection>
        </>
      ) : null}

      <SectionHeader count={groups.members.length || null}>
        {COUNCIL_CHAPTERS_COPY.members}
      </SectionHeader>
      {inviteRow || groups.members.length > 0 ? (
        <ListSection>
          {inviteRow}
          {groups.members.map((row) => (
            <ListRow
              key={row.link.id}
              label={row.chapter.name}
              leading={tile(row.chapter.name)}
              description={chapterListingLine(row.chapter)}
              trailing={
                row.link.status === "suspended" ? (
                  <StatusChip
                    label={councilLinkLabel(
                      "suspended",
                      row.link.proposed_by_side,
                    )}
                    hue={tokens.color.semantic.warning}
                  />
                ) : null
              }
              accessibilityValue={
                row.link.status === "suspended"
                  ? councilLinkLabel("suspended", row.link.proposed_by_side)
                  : undefined
              }
              {...menuRowProps(row)}
            />
          ))}
        </ListSection>
      ) : null}
      {empty ? (
        <View style={styles.emptyNote}>
          <Text style={styles.emptyTitle}>{COUNCIL_CHAPTERS_COPY.empty}</Text>
          {canManage ? (
            <Text style={styles.emptyBody}>
              {COUNCIL_CHAPTERS_COPY.emptyBody}
            </Text>
          ) : null}
        </View>
      ) : null}

      {groups.invited.length > 0 ? (
        <>
          <SectionHeader count={groups.invited.length}>
            {COUNCIL_CHAPTERS_COPY.invited}
          </SectionHeader>
          <ListSection>
            {groups.invited.map((row) => (
              <ListRow
                key={row.link.id}
                label={row.chapter.name}
                leading={tile(row.chapter.name)}
                description={chapterListingLine(row.chapter)}
                {...menuRowProps(row)}
              />
            ))}
          </ListSection>
        </>
      ) : null}

      {canManage ? (
        <OptionSheet
          ref={sheetRef}
          title={COUNCIL_CHAPTERS_COPY.invite}
          options={candidateRows.map((candidate) => ({
            value: candidate.chapter.id,
            label: candidate.chapter.name,
            detail: chapterListingLine(candidate.chapter),
          }))}
          selected={null}
          onSelect={(value) => void inviteChapter(value)}
        />
      ) : null}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    // The scroll view's own gap, so the section's parts space as the home's do.
    stack: {
      gap: tokens.spacing.sm,
    },
    decisions: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    // The row ask's frame (`ActivityAskButton`): badge height, label wide.
    accept: {
      height: 28,
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.sm,
    },
    problem: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    emptyNote: {
      gap: tokens.spacing.xs,
    },
    emptyTitle: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
    emptyBody: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
  });
}
