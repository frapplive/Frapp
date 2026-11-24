import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  rushMovableStages,
  rushRatingSummary,
  rushStageLabel,
  useMoveRushStage,
  useRateRushCandidate,
  useChapterRoster,
  useRushPipeline,
  useSetRushCandidateTags,
  useSetRushOwner,
  useViewerUserId,
  useVoteRushCandidate,
  type RushManualClosedReason,
  type RushPipelineCandidate,
  rushAppliedTags,
  rushNotesMode,
  rushMemberOptions,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import { formatDayHeading, localIsoDate } from "@repo/formatting";
import {
  RUSH_CLOSED_REASON_LABELS,
  RUSH_MANUAL_CLOSED_REASONS,
  sortRushStages,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { CardButton } from "@/components/chat/chat-card";
import { CheckGlyph } from "@/components/control-glyphs";
import { Chip } from "@/components/filter-chips";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { HairlineChip } from "@/components/status-chip";
import { InlineNote } from "@/components/inline-note";
import { OptionSheet, type SheetOption } from "@/components/option-sheet";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { useRefetchAll } from "@/components/pull-to-refresh";
import { RushBidSection } from "@/components/rush/rush-bid-section";
import { RushContacts } from "@/components/rush/rush-contacts";
import {
  RUSH_FOLLOW_UP,
  RushFollowUpSheet,
} from "@/components/rush/rush-follow-up-sheet";
import {
  RUSH_LOG_CONTACT,
  RushLogContactSheet,
} from "@/components/rush/rush-log-contact-sheet";
import { RushNotes } from "@/components/rush/rush-notes";
import { RushStars } from "@/components/rush/rush-stars";
import { alertFailure } from "@/lib/failure-alert";
import { firstParam } from "@/lib/route-params";
import { useRushEntry } from "@/lib/rush/rush-entry";
import {
  rushFollowUpFor,
  rushFollowUpLine,
  rushLastContactLine,
  rushOwnerProblem,
} from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** The owner picker's title, and the row that opens it. */
export const RUSH_OWNER = "Owner";

/** The reason sheet's title, asked before a prospect moves into a Closed stage. */
export const CLOSED_REASON_TITLE = "Why are they closed?";

/** "Added by Jake Miller · November 14": who brought them in, and when. */
export function addedLine(
  candidate: Pick<RushPipelineCandidate, "created_by_name" | "created_at">,
  now: Date = new Date(),
): string {
  const when = formatDayHeading(candidate.created_at, now);
  return when
    ? `Added by ${candidate.created_by_name} · ${when}`
    : `Added by ${candidate.created_by_name}`;
}

/**
 * One prospect on the phone (#5924; `rush.md` § Pipeline), pushed from a
 * row of the recruitment list: web's prospect panel, top to bottom in the
 * order a recruiter uses it. The name and who added them head it; then the
 * work of the week (#5934): when they were last contacted and by whom, with
 * **Log contact** beside it, then the stage, the owner and the follow-up; then
 * the viewer's own rating and the anonymous vote, the tags, the contact
 * history and the chapter's notes.
 *
 * Every control is drawn only for a role that holds its key
 * (`rushPipelineAccess`, `ifc-recruitment.md` § Permission map): the stage
 * picker for `rush:add`, the stars and the vote for `rush:vote`, the rating
 * average and the vote count for `rush:view_results`, tag editing for
 * `rush:notes`, and the notes as `RushNotes` says. A role without one sees
 * the value it would change, read-only, or nothing where there is nothing to
 * read. Logging a contact, claiming or letting go of a prospect, and setting
 * a follow-up need `rush:add`; assigning anyone, or nobody, needs
 * `rush:manage`, from a searchable picker of the chapter's members. Nobody
 * logs a contact with themself, so a prospect linked to the viewer has no
 * Log contact. A closed prospect takes no follow-up.
 *
 * A follow-up or stale push opens this screen cold
 * (`lib/notifications/targets.ts`); it waits for the reads like any link, and
 * its back row goes back through the stack, or to the list when nothing is
 * under it.
 *
 * Moving into a Closed stage asks why first, from the four reasons a member
 * can give (Not interested, Not eligible, Chapter passed, No response), in a
 * second sheet; closing that sheet without a pick changes nothing. The move
 * is optimistic, as on the board.
 */
export function RushProspectScreen() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const params = useLocalSearchParams<{ candidateId?: string | string[] }>();
  const candidateId = firstParam(params.candidateId);
  const entry = useRushEntry();
  const { access } = entry;
  const pipeline = useRushPipeline({ enabled: entry.show });
  const viewerId = useViewerUserId();
  const refresh = useRefetchAll([pipeline]);
  const move = useMoveRushStage();
  const rate = useRateRushCandidate();
  const vote = useVoteRushCandidate();
  const setTags = useSetRushCandidateTags();
  const setOwner = useSetRushOwner();
  const roster = useChapterRoster().data;
  const [logging, setLogging] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);

  const stageSheet = useRef<BottomSheetModal>(null);
  const reasonSheet = useRef<BottomSheetModal>(null);
  const tagsSheet = useRef<BottomSheetModal>(null);
  const ownerSheet = useRef<BottomSheetModal>(null);
  // The Closed stage picked in the stage sheet, waiting on its reason. A ref,
  // not state: the stage sheet's dismissal reads it in the same tick.
  const pendingClosed = useRef<string | null>(null);

  const data = pipeline.data;
  const candidate =
    data?.candidates.find((c) => c.id === candidateId) ?? undefined;
  const stages = useMemo(
    () => (data ? sortRushStages(data.stages) : []),
    [data],
  );
  const back = { label: entry.term, href: "/rush" as const };

  if (entry.settled && !entry.show) return <Redirect href="/you" />;

  if (!entry.settled || pipeline.isPending) {
    return (
      <ScreenShell back={back} title={entry.term}>
        <SkeletonRegion label="Loading prospect" flush>
          <ListSection>
            {[0, 1].map((index) => (
              <ListRowSkeleton key={index} index={index} variant="detail" />
            ))}
          </ListSection>
        </SkeletonRegion>
      </ScreenShell>
    );
  }
  if (pipeline.isError && !data) {
    return (
      <ScreenShell back={back} title={entry.term}>
        <ErrorState
          title="Couldn't load this prospect"
          body={describeLoadFailure(pipeline.error)}
          onRetry={() => void pipeline.refetch()}
          isRetrying={pipeline.isFetching}
        />
      </ScreenShell>
    );
  }
  if (!data || !candidate) {
    return (
      <ScreenShell back={back} title={entry.term} refresh={refresh}>
        <InlineNote>This prospect is no longer on the list.</InlineNote>
      </ScreenShell>
    );
  }

  const fail = (title: string) => (error: unknown) =>
    alertFailure({ title, error });

  const moveTo = (stage: string, closedReason?: RushManualClosedReason) =>
    move.mutate(
      { candidateId: candidate.id, stage, closedReason },
      { onError: fail("Couldn't move this prospect") },
    );

  const stageOptions = rushMovableStages(stages).map((stage) => ({
    value: stage.key,
    label: stage.label,
  }));
  const closedKeys = new Set(
    stages.filter((s) => s.category === "closed").map((s) => s.key),
  );

  const rating = rushRatingSummary(candidate);
  const voted = candidate.viewer_has_voted || vote.isSuccess;
  const voteCount = candidate.vote_count;
  const tagLabels = rushAppliedTags(candidate.tag_ids, data.tags).map(
    (tag) => tag.label,
  );
  const canTag = access.writeNotes && data.tags.length > 0;
  const notesMode = rushNotesMode(access, candidate.user_id, viewerId);

  const today = localIsoDate(new Date());
  // Nobody logs a contact with themself; while the viewer's id is unknown, a
  // linked prospect offers none either (as `rushNotesMode` holds notes back).
  const linkedToViewer =
    candidate.user_id !== null &&
    (viewerId === null || candidate.user_id === viewerId);
  const canLog = access.add && !linkedToViewer;
  const isOpen = candidate.closed_reason == null;
  // A closed prospect takes no follow-up, and nobody works their own.
  const canFollowUp = access.add && isOpen && !linkedToViewer;
  const followUpLine = isOpen ? rushFollowUpLine(candidate, today) : null;
  const ownsIt = viewerId !== null && candidate.owner_id === viewerId;
  const ownerWords = candidate.owner_id
    ? ownsIt
      ? "You"
      : (candidate.owner_name ?? "A former member")
    : "No owner";
  // A role that works prospects but doesn't manage them claims an unowned
  // one or lets go of its own, one button on the row; a manager picks anyone
  // (themself first) from the row instead.
  const ownerButton =
    access.add && !access.manage
      ? !candidate.owner_id
        ? // Nobody owns themself as a prospect.
          linkedToViewer
          ? null
          : "Claim"
        : ownsIt
          ? "Let go"
          : null
      : null;

  const changeOwner = (ownerId: string | null, failure: string) => {
    const ownerName =
      ownerId === null
        ? null
        : (roster?.find((member) => member.user_id === ownerId)?.display_name ??
          null);
    setOwner.mutate(
      { candidateId: candidate.id, ownerId, ownerName },
      {
        onError: (error) =>
          alertFailure({
            title: failure,
            error,
            message: rushOwnerProblem(error) ?? undefined,
          }),
      },
    );
  };

  const ownerOptions: SheetOption[] = [
    { value: null, label: "No owner" },
    ...rushMemberOptions(roster, viewerId)
      .filter((member) => member.user_id !== candidate.user_id)
      .map((member) => ({
        value: member.user_id,
        label: member.user_id === viewerId ? "You" : member.display_name,
      })),
  ];

  const toggleTag = (tagId: string) => {
    setTags.change(
      { candidateId: candidate.id, toggle: tagId },
      { onError: fail("Couldn't change the tags") },
    );
  };

  return (
    <ScreenShell
      back={back}
      title={candidate.display_name}
      subtitle={addedLine(candidate)}
      refresh={refresh}
      avoidKeyboard
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.contactRow}>
        <Text style={styles.contactLine}>
          {rushLastContactLine(candidate, today)}
        </Text>
        {canLog ? (
          <CardButton
            label={RUSH_LOG_CONTACT}
            variant="primary"
            onPress={() => setLogging(true)}
          />
        ) : null}
      </View>

      <ListSection>
        <ListRow
          label="Stage"
          variant={access.move ? "default" : "detail"}
          value={rushStageLabel(stages, candidate)}
          accessibilityHint={
            access.move ? "Opens the stages to move them to." : undefined
          }
          onPress={
            access.move ? () => stageSheet.current?.present() : undefined
          }
        />
        <ListRow
          label={RUSH_OWNER}
          value={ownerWords}
          accessibilityHint={
            access.manage ? "Opens the members to pick an owner." : undefined
          }
          onPress={
            access.manage ? () => ownerSheet.current?.present() : undefined
          }
          trailing={
            ownerButton ? (
              <CardButton
                label={ownerButton}
                accessibilityLabel={
                  ownerButton === "Claim"
                    ? `Claim ${candidate.display_name}`
                    : `Let go of ${candidate.display_name}`
                }
                onPress={() =>
                  ownerButton === "Claim"
                    ? changeOwner(viewerId, "Couldn't claim them")
                    : changeOwner(null, "Couldn't let them go")
                }
                disabled={viewerId === null}
              />
            ) : undefined
          }
        />
        {followUpLine || canFollowUp ? (
          <ListRow
            label={followUpLine ?? RUSH_FOLLOW_UP}
            value={followUpLine ? undefined : "None"}
            description={rushFollowUpFor(candidate, viewerId)}
            accessibilityHint={
              canFollowUp
                ? "Opens the follow-up to set or clear it."
                : undefined
            }
            onPress={canFollowUp ? () => setFollowingUp(true) : undefined}
          />
        ) : null}
      </ListSection>

      <RushBidSection
        candidate={candidate}
        access={access}
        viewerId={viewerId}
        today={today}
      />

      {access.vote || rating !== null ? (
        <>
          <SectionHeader>
            {access.vote ? "Your rating" : "Rating"}
          </SectionHeader>
          <View style={styles.block}>
            {access.vote ? (
              <RushStars
                value={candidate.viewer_rating}
                onRate={(value) =>
                  rate.mutate(
                    { candidateId: candidate.id, rating: value },
                    { onError: fail("Couldn't save your rating") },
                  )
                }
              />
            ) : null}
            {rating !== null ? (
              <Text style={styles.muted}>{rating}</Text>
            ) : null}
          </View>
        </>
      ) : null}

      {access.vote || voteCount !== undefined ? (
        <>
          <SectionHeader>Vote</SectionHeader>
          <View style={styles.voteRow}>
            {access.vote && !voted ? (
              <CardButton
                label="Vote"
                // Log contact is the screen's one primary (P3.3).
                variant="secondary"
                disabled={vote.isPending}
                onPress={() =>
                  vote.mutate(candidate.id, {
                    onError: fail("Couldn't record that vote"),
                  })
                }
              />
            ) : null}
            {voted ? (
              <View style={styles.voted}>
                <CheckGlyph
                  color={tokens.color.text.mutedForeground}
                  size={16}
                />
                <Text style={styles.muted}>You voted</Text>
              </View>
            ) : null}
            {voteCount !== undefined ? (
              <Text style={styles.muted}>
                {voteCount === 1 ? "1 vote" : `${voteCount} votes`}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {tagLabels.length > 0 || canTag ? (
        <>
          <SectionHeader>Tags</SectionHeader>
          <View style={styles.tags}>
            {tagLabels.map((label) => (
              <HairlineChip key={label} label={label} />
            ))}
            {canTag ? (
              <Chip
                label={tagLabels.length > 0 ? "Edit tags" : "Add tags"}
                accessibilityLabel={
                  tagLabels.length > 0 ? "Edit tags" : "Add tags"
                }
                on={false}
                accessibilityRole="button"
                accessibilityState={{}}
                onPress={() => tagsSheet.current?.present()}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <RushContacts
        // The history read again per prospect.
        key={`contacts-${candidate.id}`}
        candidateId={candidate.id}
        hasContacts={candidate.last_contact_on !== null}
      />

      {notesMode ? (
        <RushNotes
          // A new box per prospect, so a draft never follows to the next one.
          key={candidate.id}
          candidateId={candidate.id}
          viewerId={viewerId}
          mode={notesMode}
          canManage={access.manage}
        />
      ) : null}

      {access.move ? (
        <>
          <OptionSheet
            ref={stageSheet}
            title="Stage"
            options={stageOptions}
            selected={candidate.stage}
            onSelect={(value) => {
              if (!value || value === candidate.stage) return;
              if (closedKeys.has(value)) {
                pendingClosed.current = value;
                return;
              }
              moveTo(value);
            }}
            onDismiss={() => {
              // A Closed stage asks why once this sheet is down.
              if (pendingClosed.current) reasonSheet.current?.present();
            }}
          />
          <OptionSheet
            ref={reasonSheet}
            title={CLOSED_REASON_TITLE}
            options={RUSH_MANUAL_CLOSED_REASONS.map((reason) => ({
              value: reason,
              label: RUSH_CLOSED_REASON_LABELS[reason],
            }))}
            selected={null}
            onSelect={(reason) => {
              const stage = pendingClosed.current;
              pendingClosed.current = null;
              if (stage && reason) {
                moveTo(stage, reason as RushManualClosedReason);
              }
            }}
            // Closed without a reason: nothing moves.
            onDismiss={() => {
              pendingClosed.current = null;
            }}
          />
        </>
      ) : null}
      {access.manage ? (
        <OptionSheet
          ref={ownerSheet}
          title={RUSH_OWNER}
          options={ownerOptions}
          selected={candidate.owner_id}
          searchPlaceholder="Find a member"
          onSelect={(ownerId) => {
            if (ownerId === candidate.owner_id) return;
            changeOwner(ownerId, "Couldn't change the owner");
          }}
        />
      ) : null}
      {logging ? (
        <RushLogContactSheet
          key={`log-${candidate.id}`}
          candidateId={candidate.id}
          onClosed={() => setLogging(false)}
        />
      ) : null}
      {followingUp ? (
        <RushFollowUpSheet
          key={`follow-up-${candidate.id}`}
          candidate={candidate}
          viewerId={viewerId}
          onClosed={() => setFollowingUp(false)}
        />
      ) : null}
      {canTag ? (
        // Picked from the chapter's list, each tap saved at once; the list
        // itself is edited on the Recruitment settings page.
        <OptionSheet
          ref={tagsSheet}
          title="Tags"
          options={data.tags.map((tag) => ({
            value: tag.id,
            label: tag.label,
          }))}
          selected={null}
          checked={candidate.tag_ids}
          onSelect={(tagId) => {
            if (tagId) toggleTag(tagId);
          }}
        />
      ) : null}
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    block: {
      gap: tokens.spacing.sm,
    },
    contactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      minHeight: tokens.touch.minimum,
    },
    contactLine: {
      flex: 1,
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
    voteRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      minHeight: tokens.touch.minimum,
    },
    voted: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    muted: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
  });
}
