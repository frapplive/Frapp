import { StyleSheet, View } from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import {
  RUSH_DASHBOARD_TITLES,
  rushDashboardBidRows,
  rushDashboardStats,
  rushRankedFact,
  type RushDashboard,
  type RushRankedProspect,
} from "@repo/hooks";
import { InlineNote } from "@/components/inline-note";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { useFrappTheme } from "@/lib/theme";

/**
 * The recruitment dashboard on the phone (#5973, `spec/behavior/rush.md`
 * § Funnel): the Summary view beside List, in web's order and words
 * (`rushDashboardStats`, `RUSH_DASHBOARD_TITLES`), so the two apps read as one.
 * Each number is a count of the list's own prospects (`rushDashboard`).
 *
 * Read-only fact rows, as iOS Settings' About and Pipedrive's phone insights
 * list a number beside its name: the counts, then the funnel by stage in the
 * chapter's order, then the bids by where they stand, then, only with `rush:view_results`, who members rate
 * highest and who has the most votes, each opening the prospect.
 */
export function RushSummary({
  dashboard,
  canOwn,
  onOpen,
}: {
  dashboard: RushDashboard;
  canOwn: boolean;
  onOpen: (candidateId: string) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const stats = rushDashboardStats(dashboard, { canOwn });
  return (
    <View style={styles.sections}>
      <ListSection>
        {stats.map((stat) => (
          <ListRow
            key={stat.key}
            variant="detail"
            label={stat.label}
            value={String(stat.value)}
          />
        ))}
      </ListSection>
      <View>
        <SectionHeader>{RUSH_DASHBOARD_TITLES.funnel}</SectionHeader>
        <ListSection>
          {dashboard.funnel.map((row) => (
            <ListRow
              key={row.id}
              variant="detail"
              label={row.label}
              value={String(row.count)}
            />
          ))}
        </ListSection>
      </View>
      <View>
        <SectionHeader>{RUSH_DASHBOARD_TITLES.bids}</SectionHeader>
        <ListSection>
          {rushDashboardBidRows(dashboard.bids).map((row) => (
            <ListRow
              key={row.key}
              variant="detail"
              label={row.label}
              value={String(row.value)}
            />
          ))}
        </ListSection>
      </View>
      {dashboard.results ? (
        <>
          <Ranked
            title={RUSH_DASHBOARD_TITLES.topRated}
            rows={dashboard.results.topRated}
            kind="rating"
            empty="Nobody has rated an open prospect yet."
            onOpen={onOpen}
          />
          <Ranked
            title={RUSH_DASHBOARD_TITLES.mostVotes}
            rows={dashboard.results.mostVotes}
            kind="votes"
            empty="Nobody has voted on an open prospect yet."
            onOpen={onOpen}
          />
        </>
      ) : null}
    </View>
  );
}

function Ranked({
  title,
  rows,
  kind,
  empty,
  onOpen,
}: {
  title: string;
  rows: readonly RushRankedProspect[];
  kind: "rating" | "votes";
  empty: string;
  onOpen: (candidateId: string) => void;
}) {
  return (
    <View>
      <SectionHeader>{title}</SectionHeader>
      {rows.length === 0 ? (
        <InlineNote>{empty}</InlineNote>
      ) : (
        <ListSection>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              label={row.display_name}
              value={rushRankedFact(row, kind)}
              onPress={() => onOpen(row.id)}
            />
          ))}
        </ListSection>
      )}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    sections: { gap: tokens.spacing.xl },
  });
}
