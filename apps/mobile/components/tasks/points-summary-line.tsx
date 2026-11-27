import { StyleSheet, Text } from "react-native";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";
import type { HouseRank, PointsSummary } from "@/lib/tasks/points-card";

/**
 * The member's semester points and house rank, one muted line: "1,240
 * semester points · #3 of 42 in the house". It led the phone's Tasks screen
 * until that screen folded into Activity (#5948 slice 3); You draws its rank
 * half under the profile's head, since This semester's gauge says the
 * points.
 *
 * It was a card with a 32pt balance (`canvas-screens.dc.html:282-288`) until
 * #5570 (Paul, 2026-11-19): the card sat above the tasks and was bigger than
 * any of them, on a screen whose job is the tasks. Things 3 and Todoist keep
 * a list's own figures to one quiet line, and so does this.
 *
 * A half whose read hasn't answered, or that has nothing to report, is left
 * out rather than drawn as a dash or a "0": a "0" said to a member who has
 * 1,240 points is worse than saying nothing yet. A *real* zero still says 0,
 * since `selectPointsSummary` keeps the two apart. With neither half known
 * the line draws nothing.
 */
export interface PointsSummaryLineProps {
  summary: PointsSummary | null;
  rank: HouseRank | null;
}

export function pointsSummaryText(
  summary: PointsSummary | null,
  rank: HouseRank | null,
): string | null {
  const parts = [
    summary
      ? `${summary.balance.toLocaleString()} semester ${summary.balance === 1 ? "point" : "points"}`
      : null,
    rank ? `#${rank.rank} of ${rank.of} in the house` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function PointsSummaryLine({ summary, rank }: PointsSummaryLineProps) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const text = pointsSummaryText(summary, rank);
  if (text === null) return null;
  return (
    <Text
      style={styles.line}
      accessibilityLabel={text.replace(/#(\d+) of/, "Ranked $1 of")}
    >
      {text}
    </Text>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    line: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
  });
}
