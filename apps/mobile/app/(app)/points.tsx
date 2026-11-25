import { describeLoadFailure } from "@repo/hooks/error-copy";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useActivityStanding,
  useMyPoints,
  usePermissionList,
  useSemesters,
  type SemesterArchive,
} from "@repo/hooks";
import {
  can,
  isLivePointsPeriod,
  pointsPeriodOptions,
  signedPoints,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { useRefetchAll } from "@/components/pull-to-refresh";
import { BACK_TO_YOU } from "@/components/back-row";
import { HistoryRow, HistoryRowsSkeleton } from "@/components/history-row";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { OptionSheet } from "@/components/option-sheet";
import { InlineNote } from "@/components/inline-note";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { selectPointRows } from "@/lib/more/points";
import { MONO_FONT_FAMILY, typeRole, useFrappTheme } from "@/lib/theme";
import { pageSurfaces } from "@/lib/surfaces";

/**
 * Your points (#5950): the balance for the period, where you rank this
 * semester, and every transaction behind the number, newest first. Pushed
 * from the points figure in You's title row and from the Points gauge under
 * it. The phone had no list of a member's own transactions until this
 * screen; web's twin is the Points panel on Profile, with the same period
 * pick and the same rows.
 *
 * Drawn like its sibling "my numbers" screens, Service hours, Study and
 * Dues: a sentence-case caption over a display-role figure, then the unboxed
 * history rows (`HistoryRow`).
 *
 * It reads only. Adjusting a member's points and the chapter ledger are
 * officer work on web (`spec/behavior/points.md` § Where points are read).
 */
export default function PointsScreen() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const router = useRouter();
  const periodSheetRef = useRef<BottomSheetModal>(null);
  const [period, setPeriod] = useState<string>("all");
  const live = isLivePointsPeriod(period);

  const pointsQuery = useMyPoints(
    live ? period : "all",
    live ? undefined : period,
  );
  const semestersQuery = useSemesters();
  const standingQuery = useActivityStanding();
  const refresh = useRefetchAll([pointsQuery, standingQuery]);
  // The Directory is `members:view`'s; the link to its standings follows it.
  const canSeeDirectory = can("members:view", usePermissionList());

  const periodOptions = useMemo(
    () =>
      pointsPeriodOptions(
        Array.isArray(semestersQuery.data)
          ? (semestersQuery.data as SemesterArchive[])
          : [],
      ),
    [semestersQuery.data],
  );
  const periodLabel =
    periodOptions.find((option) => option.value === period)?.label ??
    "All time";

  const summary = pointsQuery.data as
    { balance?: number; transactions?: unknown } | undefined;
  const rows = useMemo(
    () => selectPointRows(summary?.transactions),
    [summary?.transactions],
  );
  const balance = typeof summary?.balance === "number" ? summary.balance : null;
  const place = standingQuery.data?.points ?? null;

  function renderList() {
    if (pointsQuery.isPending) {
      return (
        <SkeletonRegion label="Loading your points" flush>
          <HistoryRowsSkeleton rows={4} trailingWidth={tokens.spacing["2xl"]} />
        </SkeletonRegion>
      );
    }
    if (pointsQuery.isError && pointsQuery.data === undefined) {
      return (
        <ErrorState
          title="Couldn't load your points"
          body={describeLoadFailure(pointsQuery.error)}
          onRetry={() => void pointsQuery.refetch()}
          isRetrying={pointsQuery.isFetching}
        />
      );
    }
    if (rows.length === 0) {
      return <InlineNote>No points in this period yet.</InlineNote>;
    }
    return (
      <View>
        {rows.map((row, index) => (
          <HistoryRow
            key={row.id}
            title={row.title}
            meta={row.meta}
            isLast={index === rows.length - 1}
            trailing={
              <Text
                style={[
                  styles.amount,
                  row.amount < 0 ? styles.amountTaken : styles.amountEarned,
                ]}
                accessibilityLabel={`${signedPoints(row.amount)} points`}
              >
                {signedPoints(row.amount)}
              </Text>
            }
          />
        ))}
      </View>
    );
  }

  return (
    <ScreenShell back={BACK_TO_YOU} title="Points" refresh={refresh}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>{periodLabel}</Text>
        <Text
          style={styles.summaryValue}
          accessibilityLabel={
            balance === null
              ? "Points not available yet"
              : `${balance.toLocaleString()} points, ${periodLabel.toLowerCase()}`
          }
        >
          {balance === null ? "—" : balance.toLocaleString()}
        </Text>
        {/* A place only once there is something to place: "#24 of 24" for a
            new member at zero says nothing they can act on. */}
        {place && place.rank !== null && place.total > 0 ? (
          <Text style={styles.summaryDetail}>
            {`#${place.rank} of ${place.ranked} this semester`}
          </Text>
        ) : null}
      </View>

      <ListSection>
        <ListRow
          label="Period"
          value={periodLabel}
          accessibilityHint="Changes which period's points are listed."
          onPress={() => periodSheetRef.current?.present()}
        />
        {canSeeDirectory ? (
          <ListRow
            label="Standings"
            accessibilityHint="Opens the Directory sorted by points."
            onPress={() =>
              router.push({ pathname: "/directory", params: { sort: "points" } })
            }
          />
        ) : null}
      </ListSection>

      <SectionHeader>History</SectionHeader>
      {renderList()}

      <OptionSheet
        ref={periodSheetRef}
        title="Period"
        options={periodOptions}
        selected={period}
        onSelect={(value) => setPeriod(value ?? "all")}
      />
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  const surfaces = pageSurfaces(tokens);
  return StyleSheet.create({
    summaryCard: {
      borderRadius: tokens.radius.cardLarge,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: surfaces.card,
      padding: tokens.spacing.lg,
    },
    summaryLabel: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    summaryValue: {
      ...typeRole(tokens.typography.role.display),
      letterSpacing: -0.8,
      color: tokens.color.text.foreground,
      marginTop: tokens.spacing.sm,
    },
    summaryDetail: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      marginTop: tokens.spacing.xs,
    },
    amount: {
      ...typeRole(tokens.typography.role.label),
      fontFamily: MONO_FONT_FAMILY,
      fontVariant: ["tabular-nums"],
    },
    amountEarned: { color: tokens.color.semantic.success },
    amountTaken: { color: tokens.color.semantic.destructive },
  });
}
