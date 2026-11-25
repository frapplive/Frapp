import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ACTIVITY_TO_DO_EMPTY,
  useActiveChapterId,
  useCouncil,
  useCouncilChapters,
  useCouncilInviteCandidates,
  useMyPermissions,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import type { SignetTokens } from "@repo/theme/signet";
import { chapterInitials } from "@repo/validation";
import { PersonGlyph } from "@/components/control-glyphs";
import { CouncilChapters } from "@/components/council/council-chapters";
import { LeadTile } from "@/components/lead-tile";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { InviteGlyph } from "@/components/more/more-glyphs";
import { ChapterMarkTile } from "@/components/onboarding/chapter-mark-tile";
import { useRefetchAll } from "@/components/pull-to-refresh";
import { ScreenShell } from "@/components/screen-shell";
import {
  ErrorState,
  SkeletonOnCard,
  SkeletonRegion,
  SkeletonText,
} from "@/components/state-block";
import { StatusChip } from "@/components/status-chip";
import { useChapterBranding } from "@/lib/chapter-branding";
import {
  canManageCouncilChapters,
  canViewCouncilChapters,
} from "@/lib/council/chapters";
import { COUNCIL_HOME_COPY, councilHomeSteps } from "@/lib/council/home";
import { destinationHue } from "@/lib/more/destination-hue";
import { councilMetaLine } from "@/lib/onboarding/council-form";
import { pageSurfaces } from "@/lib/surfaces";
import { typeRole, useFrappTheme } from "@/lib/theme";

const MARK_SIZE = 48;

/**
 * A council's home, on the Activity tab (#5933). A council keeps the
 * chapter's four tabs (the tab bar is one layout for both kinds), but none of
 * Activity's reads serve a council: `/v1/activity`, events, tasks and points
 * are chapter routes and answer it 403. So the tab draws the council itself
 * here (`spec/behavior/council-types.md` § What each council's space shows,
 * first slice: chat, roles and settings).
 *
 * Top to bottom: the council (its mark, name, type and school) with its
 * state first, "Not verified yet" until Frapp staff verify it
 * (`school-layer.md` § 5.3 rule 4); then Get started, the two things an
 * officer sets up first, each only for whoever can do it: Invite members
 * (`members:invite`, worded as the Invite screen is titled) and Edit titles
 * (`roles:manage`; every title renames, § 5.3 rule 3). A delegate, who
 * holds neither, sees the council and Activity's own "Nothing to do right
 * now." where the steps would be. Discord's new-server checklist and Slack's
 * workspace setup put the same two first: invite your people, set the roles.
 *
 * Chat home's officer setup checklist is held back in a council, so the
 * first steps have one home (principles.md P3.7).
 *
 * Under them, the council's Chapters (#5974, `council-chapters.tsx`): the
 * phone's stack has no Chapters route, so the list web gives its own page is
 * a section here, read by anyone with `members:view` and worked by a
 * `council:chapters_manage` holder.
 */
export function CouncilHome() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const router = useRouter();
  const councilId = useActiveChapterId();
  const council = useCouncil(councilId);
  // The query, not `usePermissionList`, which reads `[]` while loading and
  // would show a council admin the delegate's line for a beat.
  const permissionsQuery = useMyPermissions();
  const permissions = permissionsQuery.data?.permissions ?? [];
  const { logoUrl, accent } = useChapterBranding();
  // Nothing goes out until permissions answer: the list refuses a viewer
  // without `members:view`, and the candidates one without the manage key.
  const permissionsKnown = permissionsQuery.isSuccess;
  const canViewChapters =
    permissionsKnown && canViewCouncilChapters(permissions);
  const canManageChapters =
    permissionsKnown && canManageCouncilChapters(permissions);
  const chapters = useCouncilChapters({ enabled: canViewChapters });
  const candidates = useCouncilInviteCandidates({
    enabled: canManageChapters,
  });
  const refresh = useRefetchAll([
    council,
    permissionsQuery,
    chapters,
    candidates,
  ]);
  const steps = councilHomeSteps(permissions);

  const tile = (Glyph: ComponentType<{ color: string }>, hue: string) => (
    <LeadTile on="card" hue={hue}>
      <Glyph color={hue} />
    </LeadTile>
  );

  const data = council.data;

  return (
    <ScreenShell title={COUNCIL_HOME_COPY.title} refresh={refresh}>
      {council.isPending ? (
        <SkeletonRegion label={COUNCIL_HOME_COPY.loading}>
          <SkeletonOnCard>
            <View style={styles.card}>
              <View style={[styles.markSkeleton, styles.markSize]} />
              <View style={styles.cardCopy}>
                <SkeletonText role={tokens.typography.role.title} width="60%" />
                <SkeletonText
                  role={tokens.typography.role.caption}
                  width="80%"
                />
              </View>
            </View>
          </SkeletonOnCard>
        </SkeletonRegion>
      ) : !data ? (
        <ErrorState
          title={COUNCIL_HOME_COPY.failed}
          body={describeLoadFailure(council.error)}
          onRetry={() => void council.refetch()}
          isRetrying={council.isFetching}
        />
      ) : (
        <View style={styles.card} testID="council-card">
          <ChapterMarkTile
            logoUrl={logoUrl}
            text={chapterInitials(data.name)}
            accent={accent}
            size={MARK_SIZE}
          />
          <View style={styles.cardCopy}>
            <Text style={styles.name} numberOfLines={2}>
              {data.name}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {councilMetaLine(data.council_type, data.school)}
            </Text>
            <View style={styles.chipRow}>
              {/* Its state first (rulebook § 6): a council starts unverified. */}
              <StatusChip
                label={
                  data.verified
                    ? COUNCIL_HOME_COPY.verified
                    : COUNCIL_HOME_COPY.notVerified
                }
                hue={
                  data.verified
                    ? tokens.color.semantic.success
                    : tokens.color.semantic.warning
                }
              />
            </View>
          </View>
        </View>
      )}

      {steps.length > 0 ? (
        <>
          <SectionHeader>{COUNCIL_HOME_COPY.getStarted}</SectionHeader>
          <ListSection>
            {steps.includes("invite") ? (
              <ListRow
                label={COUNCIL_HOME_COPY.invite}
                leading={tile(InviteGlyph, destinationHue("invite"))}
                accessibilityHint="Opens invites to email or share."
                onPress={() => router.push("/invite")}
              />
            ) : null}
            {steps.includes("titles") ? (
              <ListRow
                label={COUNCIL_HOME_COPY.titles}
                leading={tile(PersonGlyph, destinationHue("chapter"))}
                accessibilityHint="Opens the council's roles and titles."
                onPress={() => router.push("/chapter-roles")}
              />
            ) : null}
          </ListSection>
        </>
      ) : data && permissionsQuery.isSuccess ? (
        // A delegate has nothing to set up: Activity's own empty line, where
        // the steps would be, never an empty box.
        <Text style={styles.empty}>{ACTIVITY_TO_DO_EMPTY}</Text>
      ) : null}

      {data && canViewChapters ? (
        <CouncilChapters
          permissions={permissions}
          canManage={canManageChapters}
          chapters={chapters}
          candidates={candidates}
        />
      ) : null}
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  const surfaces = pageSurfaces(tokens);
  return StyleSheet.create({
    // A card one surface step up with a hairline edge, as every section on
    // the phone is (rulebook § 7).
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      borderRadius: tokens.radius.card,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: surfaces.card,
      padding: tokens.spacing.lg,
    },
    cardCopy: {
      flex: 1,
      minWidth: 0,
      gap: tokens.spacing.xs,
    },
    name: {
      ...typeRole(tokens.typography.role.title),
      color: tokens.color.text.foreground,
    },
    meta: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    chipRow: {
      flexDirection: "row",
      marginTop: tokens.spacing.xs,
    },
    markSize: {
      width: MARK_SIZE,
      height: MARK_SIZE,
    },
    markSkeleton: {
      borderRadius: tokens.radius.control,
      backgroundColor: surfaces.raised,
    },
    empty: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
  });
}
