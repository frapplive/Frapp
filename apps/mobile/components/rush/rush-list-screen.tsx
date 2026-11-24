import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import {
  rushProspectCount,
  rushRatingSummary,
  useRushPipeline,
  type RushPipelineCandidate,
  type RushTag,
  rushAppliedTags,
  rushOpenProspectCount,
  rushTagOverflow,
  rushAddedByLine,
} from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
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
import { HairlineChip } from "@/components/status-chip";
import { InlineNote } from "@/components/inline-note";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { useRefetchAll } from "@/components/pull-to-refresh";
import {
  rushStageTabs,
  useRushEntry,
  type RushStageTab,
} from "@/lib/rush/rush-entry";
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
 * every Closed stage. It opens on the first stage, where a new prospect
 * lands. Each chip carries its count, so a stage with nobody in it reads as
 * such before it is opened.
 *
 * The subtitle counts the prospects still in play (everyone not Closed),
 * the number a recruitment chair checks first. A row says who the prospect
 * is, who added them, and (for a role that may see results) their rating, as
 * ChapterBuilder's names list carries a name, its recruiter and a score; then
 * the first two tags.
 *
 * A search over the open chip finds a name on event night, when 40 people
 * walk in and the list is long (`ifc-recruitment.md` § A recruitment week).
 *
 * Adding is in chat for now (`/rush add Name`, under the chapter's word), so
 * an empty chip where adds land says how; this screen has no create button
 * yet (`@repo/hooks` has no add hook outside chat).
 */
export function RushListScreen() {
  const router = useRouter();
  const entry = useRushEntry();
  const pipeline = useRushPipeline({ enabled: entry.show });
  const refresh = useRefetchAll([pipeline]);
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const data = pipeline.data;
  const tabs = useMemo(
    () => (data ? rushStageTabs(data.stages, data.candidates) : []),
    [data],
  );
  // The first stage until the member picks another, and the first again if
  // the picked one leaves (an officer hid it while it was open).
  const tab = tabs.find((t) => t.id === picked) ?? tabs[0] ?? null;
  const openCount = data
    ? rushOpenProspectCount(data.stages, data.candidates)
    : null;

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
          canAdd={entry.access.add}
          command={entry.command}
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
      subtitle={openCount === null ? undefined : rushProspectCount(openCount)}
      refresh={refresh}
      keyboardShouldPersistTaps="handled"
    >
      {data && data.candidates.length > 0 ? (
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
    </ScreenShell>
  );
}

/** One chip's prospects, or the one line that says there are none. */
function StageList({
  tab,
  tags,
  search,
  canAdd,
  command,
  onOpen,
}: {
  tab: RushStageTab;
  tags: readonly RushTag[];
  search: string;
  canAdd: boolean;
  command: string;
  onOpen: (candidate: RushPipelineCandidate) => void;
}) {
  const needle = search.trim().toLowerCase();
  const rows = needle
    ? tab.candidates.filter((c) =>
        c.display_name.toLowerCase().includes(needle),
      )
    : tab.candidates;

  if (tab.candidates.length === 0) {
    return <InlineNote>{emptyStageLine(tab, canAdd, command)}</InlineNote>;
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
          onPress={() => onOpen(candidate)}
        />
      ))}
    </ListSection>
  );
}

/**
 * What an empty chip says. Where adds land (the New stage, whatever the
 * chapter calls it) it says how to add one, for a role that may; the rest
 * only say they're empty, since nobody is added straight into them.
 */
export function emptyStageLine(
  tab: Pick<RushStageTab, "label" | "closed" | "receivesAdds">,
  canAdd: boolean,
  command: string,
): string {
  if (tab.closed) return "No closed prospects.";
  if (tab.receivesAdds && canAdd) {
    return `No prospects in ${tab.label}. Add one in chat with ${command} add and their name.`;
  }
  return `No prospects in ${tab.label}.`;
}

/**
 * A prospect's row: their name, "Added by …" and their rating summary on
 * one muted line, then up to two tags and a count of the rest.
 */
export function ProspectRow({
  candidate,
  tags,
  onPress,
}: {
  candidate: RushPipelineCandidate;
  tags: readonly RushTag[];
  onPress: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const rating = rushRatingSummary(candidate);
  const meta = [rushAddedByLine(candidate), rating].filter(Boolean).join(" · ");
  const labels = rushAppliedTags(candidate.tag_ids, tags).map((t) => t.label);
  const cut = rushTagOverflow(labels);
  return (
    <PressableRow
      onCard
      accessibilityRole="button"
      accessibilityLabel={candidate.display_name}
      accessibilityHint={[meta, labels.length ? labels.join(", ") : null]
        .filter(Boolean)
        .join(". ")}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.name}>
          {candidate.display_name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {meta}
        </Text>
        {cut.shown.length > 0 ? (
          <View style={styles.tags}>
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
