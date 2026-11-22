import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  EVENT_PAGE_COPY,
  statusLabel,
  type EventAttendanceFields,
  type EventPagePhase,
} from "@repo/validation";
import {
  EVENT_PEOPLE_SHOWN,
  eventRosterCounts,
  eventRosterMarks,
  eventRosterRows,
  eventRosterStatusText,
  eventRosterTally,
  orderEventRoster,
  rosterRowCame,
  useAttendance,
  useAutoAbsent,
  useEventInvitees,
  useMarkEventRosterRow,
  type EventRosterRow,
  type EventRosterStatus,
} from "@repo/hooks";
import { memberLabel } from "@repo/hooks/display-names";
import { formatTimeOfDay } from "@repo/formatting";
import { SignetTokens } from "@repo/theme/signet";
import { MemberAvatar } from "@/components/member-avatar";
import { HairlineChip, StatusChip } from "@/components/status-chip";
import { ListPanel, PressableRow } from "@/components/list-section";
import { eyebrowStyle } from "@/components/eyebrow";
import { openItemMenu, pressAt } from "@/components/item-actions-menu";
import { alertFailure } from "@/lib/failure-alert";
import { TextAction } from "@/components/events/event-excuses";
import { initialsFor } from "@/lib/more/narrow";
import { avatarRadius, typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The people half of the event page (Paul, 2026-11-22), web's side list in
 * the same words and order:
 *
 * - **Who's coming**, the people the event invites, for everyone before
 *   check-in opens and for anyone who doesn't take attendance after.
 * - **Attendance**, from when check-in opens, for an `events:update` holder:
 *   "9 of 15 checked in", the tally, and one row a person whose status opens
 *   the glass menu with the four answers. The phone had no roster until
 *   this; an exec at the door could not fix a missed check-in.
 */
export function EventPeopleSection({
  eventId,
  audience,
  phase,
  canTakeAttendance,
}: {
  eventId: string;
  audience: EventAttendanceFields;
  phase: EventPagePhase;
  canTakeAttendance: boolean;
}) {
  if (canTakeAttendance && phase !== "upcoming") {
    return <EventRoster eventId={eventId} audience={audience} phase={phase} />;
  }
  return <EventPeople audience={audience} />;
}

function EventPeople({ audience }: { audience: EventAttendanceFields }) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const invitees = useEventInvitees(audience);
  const [showAll, setShowAll] = useState(false);
  if (invitees === null || invitees.length === 0) return null;
  const shown = showAll ? invitees : invitees.slice(0, EVENT_PEOPLE_SHOWN);
  return (
    <View style={styles.section} accessibilityLabel="Who's coming">
      <Text style={styles.label}>
        {`WHO'S COMING · ${EVENT_PAGE_COPY.people(invitees.length).toUpperCase()}`}
      </Text>
      <ListPanel>
        {shown.map((member, index) => {
          const name = memberLabel(member.display_name, member.user_id);
          return (
            <View
              key={member.user_id}
              style={[styles.row, index > 0 ? styles.divider : null]}
              accessible
              accessibilityLabel={name}
            >
              <MemberAvatar
                uri={member.avatar_url}
                initials={initialsFor(name)}
                size={tokens.spacing.xl}
                style={styles.avatar}
                textStyle={styles.avatarText}
              />
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
            </View>
          );
        })}
        <ShowAllRow
          total={invitees.length}
          showAll={showAll}
          onToggle={() => setShowAll((value) => !value)}
          styles={styles}
        />
      </ListPanel>
    </View>
  );
}

function EventRoster({
  eventId,
  audience,
  phase,
}: {
  eventId: string;
  audience: EventAttendanceFields;
  phase: Exclude<EventPagePhase, "upcoming">;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const invitees = useEventInvitees(audience);
  // No realtime on the phone: the roster reads again every 15 seconds while
  // check-in is open, so arrivals show up at the door.
  const attendanceQuery = useAttendance(eventId, {
    refetchInterval: phase === "live" ? 15_000 : false,
  });
  const markRow = useMarkEventRosterRow(eventId);
  const autoAbsent = useAutoAbsent();
  const [marked, setMarked] = useState<Record<string, EventRosterStatus>>({});
  const [showAll, setShowAll] = useState(false);

  if (invitees === null) return null;
  if (attendanceQuery.data === undefined) {
    if (!attendanceQuery.isError) return null;
    return (
      <View style={styles.section} accessibilityLabel="Attendance">
        <Text style={styles.label}>ATTENDANCE</Text>
        <Text style={styles.tally}>{"Couldn't load attendance."}</Text>
        <TextAction
          label="Try again"
          onPress={() => void attendanceQuery.refetch()}
        />
      </View>
    );
  }
  const attendance = Array.isArray(attendanceQuery.data)
    ? attendanceQuery.data
    : [];
  const rows = orderEventRoster(
    eventRosterRows(invitees, attendance, marked),
    phase,
  );
  if (rows.length === 0) return null;
  const counts = eventRosterCounts(rows);
  const here = counts.PRESENT + counts.LATE;
  const tally = eventRosterTally(counts, phase)
    .map((entry) => `${entry.count} ${entry.label}`)
    .join(" · ");
  const shown = showAll ? rows : rows.slice(0, EVENT_PEOPLE_SHOWN);

  const clear = (userId: string) =>
    setMarked((current) => {
      const rest = { ...current };
      delete rest[userId];
      return rest;
    });

  // The answer shows at once and stays until the roster reads it back, so
  // the row doesn't flick to its old status while the read is in flight.
  const mark = async (
    row: EventRosterRow,
    status: Exclude<EventRosterStatus, "UNRECORDED">,
  ) => {
    setMarked((current) => ({ ...current, [row.userId]: status }));
    try {
      await markRow(row, status);
    } catch (error) {
      clear(row.userId);
      alertFailure({
        title: "Couldn't update attendance",
        error,
        fallback: "Your change hasn't been saved. Try again in a moment.",
        retry: () => mark(row, status),
      });
      return;
    }
    await attendanceQuery.refetch();
    clear(row.userId);
  };

  const runAutoAbsent = async () => {
    try {
      await autoAbsent.mutateAsync(eventId);
    } catch (error) {
      alertFailure({
        title: "Couldn't mark no-shows absent",
        error,
        fallback: "Try again in a moment.",
        retry: runAutoAbsent,
      });
    }
  };

  return (
    <View style={styles.section} accessibilityLabel="Attendance">
      <Text style={styles.label}>
        {(phase === "past"
          ? `ATTENDANCE · ${EVENT_PAGE_COPY.came(here, rows.length)}`
          : `ATTENDANCE · ${EVENT_PAGE_COPY.checkedIn(here, rows.length)}`
        ).toUpperCase()}
      </Text>
      {tally ? <Text style={styles.tally}>{tally}</Text> : null}
      <ListPanel>
        {shown.map((row, index) => {
          const text = eventRosterStatusText(row.status, phase);
          const detail =
            rosterRowCame(row) && row.checkInTime
              ? formatTimeOfDay(row.checkInTime)
              : row.status === "EXCUSED"
                ? row.excuseReason
                : null;
          return (
            <PressableRow
              key={row.userId}
              accessibilityRole="button"
              accessibilityLabel={`${row.displayName}, ${text}`}
              accessibilityHint="Changes their attendance."
              onPress={(event) =>
                openItemMenu(
                  {
                    title: row.displayName,
                    actions: eventRosterMarks(row).map((status) => ({
                      key: status,
                      label: statusLabel("attendance", status),
                      run: () => void mark(row, status),
                    })),
                  },
                  pressAt(event),
                )
              }
              style={[styles.row, index > 0 ? styles.divider : null]}
            >
              <MemberAvatar
                uri={row.avatarUrl}
                initials={initialsFor(row.displayName)}
                size={tokens.spacing.xl}
                style={styles.avatar}
                textStyle={styles.avatarText}
              />
              <View style={styles.grow}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.displayName}
                </Text>
                {detail ? (
                  <Text style={styles.detail} numberOfLines={1}>
                    {detail}
                  </Text>
                ) : null}
              </View>
              {rosterStatusHue(row.status, tokens) ? (
                <StatusChip
                  label={text}
                  hue={rosterStatusHue(row.status, tokens) as string}
                />
              ) : (
                <HairlineChip label={text} />
              )}
            </PressableRow>
          );
        })}
        <ShowAllRow
          total={rows.length}
          showAll={showAll}
          onToggle={() => setShowAll((value) => !value)}
          styles={styles}
        />
      </ListPanel>
      {phase === "past" ? (
        <TextAction
          label="Mark no-shows absent"
          hint="Marks members this event requires who didn't check in and aren't excused."
          disabled={autoAbsent.isPending}
          onPress={() => void runAutoAbsent()}
        />
      ) : null}
    </View>
  );
}

/** The status hues web's badges use; excused and unmarked stay hairline. */
function rosterStatusHue(
  status: EventRosterStatus,
  tokens: SignetTokens,
): string | null {
  switch (status) {
    case "PRESENT":
      return tokens.color.semantic.success;
    case "LATE":
      return tokens.color.semantic.warning;
    case "ABSENT":
      return tokens.color.semantic.destructive;
    default:
      return null;
  }
}

function ShowAllRow({
  total,
  showAll,
  onToggle,
  styles,
}: {
  total: number;
  showAll: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  if (total <= EVENT_PEOPLE_SHOWN) return null;
  return (
    <PressableRow
      accessibilityRole="button"
      accessibilityState={{ expanded: showAll }}
      onPress={onToggle}
      style={[styles.row, styles.divider]}
    >
      <Text style={styles.more}>
        {showAll ? EVENT_PAGE_COPY.showFewer : EVENT_PAGE_COPY.showAll(total)}
      </Text>
    </PressableRow>
  );
}

function createStyles(tokens: SignetTokens) {
  // 24pt, the member rows' avatar (`components.md` § Chat member list).
  const AVATAR_SIZE = tokens.spacing.xl;
  return StyleSheet.create({
    section: {
      gap: tokens.spacing.xs,
    },
    label: {
      ...eyebrowStyle(tokens),
      color: tokens.color.text.muted,
    },
    tally: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      minHeight: tokens.touch.minimum,
      paddingVertical: tokens.spacing.xs,
    },
    divider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.color.border.hairline,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: avatarRadius(AVATAR_SIZE),
      backgroundColor: tokens.color.surface.surface1,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    grow: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      flex: 1,
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    detail: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    more: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
  });
}
