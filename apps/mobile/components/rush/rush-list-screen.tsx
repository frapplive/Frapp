import { localIsoDate } from "@repo/formatting";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import {
  rushDashboard,
  rushRatingSummary,
  useRushPipeline,
  useViewerUserId,
  type RushPipelineCandidate,
  type RushTag,
  rushAppliedTags,
  rushOpenProspectCount,
  rushTagOverflow,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import { rushFollowUpsDueCount } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_YOU } from "@/components/back-row";
import { FilterChips, SearchField } from "@/components/filter-chips";
import {
  ListRowSkeleton,
  ListSection,
  PressableRow,
} from "@/components/list-section";
import { ForwardGlyph } from "@/components/control-glyphs";
import { HairlineChip, StatusChip } from "@/components/status-chip";
import { InlineNote } from "@/components/inline-note";
import {
  itemMenuAccessibility,
  longPressOf,
  useItemMenu,
  type ItemMenuHandle,
} from "@/components/item-actions-menu";
import { RushAddProspectSheet } from "@/components/rush/rush-add-prospect-sheet";
import { RushSummary } from "@/components/rush/rush-summary";
import {
  RUSH_LOG_CONTACT,
  RushLogContactSheet,
} from "@/components/rush/rush-log-contact-sheet";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { useRefetchAll } from "@/components/pull-to-refresh";
import {
  rushListTabs,
  useRushEntry,
  type RushStageTab,
} from "@/lib/rush/rush-entry";
import {
  RUSH_ADD_PROSPECT,
  rushListSubtitle,
  rushOwnerWords,
  rushRowMark,
} from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The recruitment pipeline on the phone (#5924; `spec/behavior/rush.md`
 * § Pipeline), titled with the chapter's own word ("Rush", "Intake").
 *
 * Web draws a board, a column per stage. A phone has the width for one, so
 * this is the same pipeline **one stage at a time behind chips**, as
 * Pipedrive's and HubSpot's phone apps put a pipeline's stages in a row of
 * tabs over one stage's deals, and as this app's Directory and Documents put
 * their sets in a chip row. The chips are the board's columns in its order
 * (`rushBoardColumns`): every visible stage, then one Closed chip that holds
 * every Closed stage. Each chip carries its count, so a stage with nobody in
 * it reads as such before it is opened.
 *
 * For a role that works prospects (`rush:add`) the row starts with **Follow
 * up** (#5934, Winston's UI design v8 § 3b), and the list opens on it: the
 * viewer's follow-ups due today or earlier, then the prospects they own that
 * have gone the chapter's stale days without a contact, oldest first. It is
 * the recruiter's day, as ChapterBuilder's follow-up alerts and HubSpot's and
 * Pipedrive's "due today" task lists open on what's owed rather than on the
 * whole pipeline. Any other role opens on the first stage, where a new
 * prospect lands.
 *
 * The subtitle counts the prospects still in play (everyone not Closed),
 * the number a recruitment chair checks first, then the viewer's follow-ups
 * due today ("48 prospects · 3 follow-ups due today"). A row says who the
 * prospect is, who owns them and (for a role that may see results) their
 * rating, as ChapterBuilder's names list carries a name, its recruiter and a
 * score; then a follow-up mark ("Follow-up Thursday", or "Needs follow-up" for a
 * stale prospect, never on a closed one) and the first two tags. A row's
 * long press offers Log contact to a role that works prospects.
 *
 * A search over the open chip finds a name on event night, when 40 people
 * walk in and the list is long (`ifc-recruitment.md` § A recruitment week).
 *
 * **New prospect** is the floating "+" for `rush:add` (#5931), a one-name
 * sheet; once one is added the list shows the stage it landed in.
 */
type RushListView = "list" | "summary";

const RUSH_LIST_VIEWS = [
  { value: "list", label: "List" },
  { value: "summary", label: "Summary" },
] as const satisfies readonly { value: RushListView; label: string }[];

export function RushListScreen() {
  const router = useRouter();
  const entry = useRushEntry();
  const pipeline = useRushPipeline({ enabled: entry.show });
  const viewerId = useViewerUserId();
  const refresh = useRefetchAll([pipeline]);
  const menu = useItemMenu();
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  // List or Summary (#5973), web's Board / List / Summary on a phone's width.
  const [view, setView] = useState<RushListView>("list");
  const canWork = entry.access.add;
  const today = localIsoDate(new Date());

  const data = pipeline.data;
  const tabs = useMemo(
    () =>
      data
        ? rushListTabs(data.stages, data.candidates, {
            canWork,
            viewerId,
            staleDays: data.stale_days,
            today,
          })
        : [],
    [data, canWork, viewerId, today],
  );
  // Follow up (or the first stage) until the member picks another, and the
  // first again if the picked one leaves (an officer hid it while it was open).
  const tab = tabs.find((t) => t.id === picked) ?? tabs[0] ?? null;
  const openCount = data
    ? rushOpenProspectCount(data.stages, data.candidates)
    : null;
  const dueCount =
    data && viewerId !== null && canWork
      ? rushFollowUpsDueCount(data.candidates, viewerId, today)
      : 0;

  /** A row's long-press menu: Log contact, for a role that works prospects. */
  const menuFor = (candidate: RushPipelineCandidate) =>
    menu.handleFor(
      canWork && (candidate.user_id === null || candidate.user_id !== viewerId)
        ? {
            title: candidate.display_name,
            actions: [
              {
                key: "log-contact",
                label: RUSH_LOG_CONTACT,
                run: () => setLogging(candidate.id),
              },
            ],
          }
        : null,
    );

  if (entry.settled && !entry.show) return <Redirect href="/you" />;

  function renderBody() {
    if (!entry.settled || pipeline.isPending) {
      return (
        <SkeletonRegion label="Loading prospects" flush>
          <ListSection>
            {[0, 1, 2, 3].map((index) => (
              <ListRowSkeleton key={index} index={index} description />
            ))}
          </ListSection>
        </SkeletonRegion>
      );
    }
    if (pipeline.isError && !data) {
      return (
        <ErrorState
          title="Couldn't load prospects"
          body={describeLoadFailure(pipeline.error)}
          onRetry={() => void pipeline.refetch()}
          isRetrying={pipeline.isFetching}
        />
      );
    }
    if (!data || !tab) return null;
    if (view === "summary") {
      return (
        <RushSummary
          dashboard={rushDashboard(data.stages, data.candidates, {
            viewerId,
            staleDays: data.stale_days,
            today,
            viewResults: entry.access.viewResults,
          })}
          canOwn={canWork}
          onOpen={(candidateId) =>
            router.push({ pathname: "/rush-prospect", params: { candidateId } })
          }
        />
      );
    }
    return (
      <>
        <FilterChips
          scroll
          quiet
          accessibilityLabel="Stages"
          chips={tabs.map((t) => ({
            value: t.id,
            label: t.label,
            count: t.candidates.length,
          }))}
          selected={tab.id}
          onSelect={(value) => setPicked(value)}
        />
        <StageList
          tab={tab}
          tags={data.tags}
          search={search}
          staleDays={data.stale_days}
          today={today}
          menuFor={menuFor}
          onOpen={(candidate) =>
            router.push({
              pathname: "/rush-prospect",
              params: { candidateId: candidate.id },
            })
          }
        />
      </>
    );
  }

  return (
    <ScreenShell
      back={BACK_TO_YOU}
      title={entry.term}
      subtitle={
        openCount === null ? undefined : rushListSubtitle(openCount, dueCount)
      }
      refresh={refresh}
      views={
        data && data.candidates.length > 0
          ? {
              accessibilityLabel: "Show",
              options: RUSH_LIST_VIEWS,
              value: view,
              onChange: setView,
            }
          : undefined
      }
      keyboardShouldPersistTaps="handled"
      createAction={
        canWork
          ? {
              label: RUSH_ADD_PROSPECT.title,
              onPress: () => setAdding(true),
            }
          : undefined
      }
    >
      {data && data.candidates.length > 0 && view === "list" ? (
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search prospects"
          accessibilityLabel="Search prospects"
          autoCapitalize="words"
          searchGlyph
        />
      ) : null}
      {renderBody()}
      {menu.element}
      {adding ? (
        <RushAddProspectSheet
          // The new prospect is in the stage adds land in: show it.
          onAdded={() => {
            const landing = tabs.find((t) => t.receivesAdds);
            if (landing) setPicked(landing.id);
            setSearch("");
          }}
          onClosed={() => setAdding(false)}
        />
      ) : null}
      {logging ? (
        <RushLogContactSheet
          key={logging}
          candidateId={logging}
          onClosed={() => setLogging(null)}
        />
      ) : null}
    </ScreenShell>
  );
}

/** One chip's prospects, or the one line that says there are none. */
function StageList({
  tab,
  tags,
  search,
  staleDays,
  today,
  menuFor,
  onOpen,
}: {
  tab: RushStageTab;
  tags: readonly RushTag[];
  search: string;
  staleDays: number;
  today: string;
  menuFor: (candidate: RushPipelineCandidate) => ItemMenuHandle | null;
  onOpen: (candidate: RushPipelineCandidate) => void;
}) {
  const needle = search.trim().toLowerCase();
  const rows = needle
    ? tab.candidates.filter((c) =>
        c.display_name.toLowerCase().includes(needle),
      )
    : tab.candidates;

  if (tab.candidates.length === 0) {
    return <InlineNote>{emptyStageLine(tab, staleDays)}</InlineNote>;
  }
  if (rows.length === 0) {
    return (
      <InlineNote>{`No prospects in ${tab.label} match "${search.trim()}".`}</InlineNote>
    );
  }
  return (
    <ListSection>
      {rows.map((candidate) => (
        <ProspectRow
          key={candidate.id}
          candidate={candidate}
          tags={tags}
          staleDays={staleDays}
          today={today}
          menu={menuFor(candidate)}
          onPress={() => onOpen(candidate)}
        />
      ))}
    </ListSection>
  );
}

/**
 * What an empty chip says. Follow up says what lands there; a stage only that
 * it's empty, since a role that adds has the "+" for its first prospect.
 */
export function emptyStageLine(
  tab: Pick<RushStageTab, "label" | "closed" | "followUp">,
  staleDays: number,
): string {
  if (tab.followUp) {
    return `Nothing to follow up on. Your follow-ups show here when they're due, and prospects you own after ${staleDays} ${
      staleDays === 1 ? "day" : "days"
    } without a contact.`;
  }
  if (tab.closed) return "No closed prospects.";
  return `No prospects in ${tab.label}.`;
}

/**
 * A prospect's row: their name, their owner and rating summary on one muted
 * line, then the follow-up mark (a due one and a stale prospect in the
 * warning hue, a later one quiet), up to two tags and a count of the rest.
 */
export function ProspectRow({
  candidate,
  tags,
  staleDays,
  today,
  menu,
  onPress,
}: {
  candidate: RushPipelineCandidate;
  tags: readonly RushTag[];
  staleDays: number;
  today: string;
  menu?: ItemMenuHandle | null;
  onPress: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const rating = rushRatingSummary(candidate);
  const meta = [rushOwnerWords(candidate), rating].filter(Boolean).join(" · ");
  const mark = rushRowMark(candidate, staleDays, today);
  const labels = rushAppliedTags(candidate.tag_ids, tags).map((t) => t.label);
  const cut = rushTagOverflow(labels);
  return (
    <PressableRow
      onCard
      accessibilityRole="button"
      accessibilityLabel={candidate.display_name}
      accessibilityHint={[
        meta,
        mark?.label ?? null,
        labels.length ? labels.join(", ") : null,
      ]
        .filter(Boolean)
        .join(". ")}
      onPress={onPress}
      onLongPress={longPressOf(menu)}
      {...itemMenuAccessibility(menu)}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.name}>
          {candidate.display_name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {meta}
        </Text>
        {mark || cut.shown.length > 0 ? (
          <View style={styles.tags}>
            {mark ? (
              mark.tone === "planned" ? (
                <HairlineChip label={mark.label} />
              ) : (
                <StatusChip
                  label={mark.label}
                  hue={tokens.color.semantic.warning}
                />
              )
            ) : null}
            {cut.shown.map((label) => (
              <HairlineChip key={label} label={label} />
            ))}
            {cut.more > 0 ? <HairlineChip label={`+${cut.more}`} /> : null}
          </View>
        ) : null}
      </View>
      <ForwardGlyph color={tokens.color.text.mutedForeground} />
    </PressableRow>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      minHeight: tokens.touch.minimum,
    },
    rowText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    name: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
    meta: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
  });
}
