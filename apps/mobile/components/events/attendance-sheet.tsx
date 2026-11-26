import { forwardRef, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { SignetTokens } from "@repo/theme/signet";
import { useRoleTiers, useRoles } from "@repo/hooks";
import {
  attendanceTargets,
  type AttendanceTargetRow,
} from "@repo/hooks/attendance-targets";
import {
  ALUMNI_FOLLOWING_NOTE,
  ATTENDANCE_SEARCH_FROM,
  EVENT_ATTENDANCE_ANSWER_LABELS,
  alumniRoleIdOf,
  attendanceAnswerChoices,
  attendanceFloorOf,
  describeAttendance,
  everyoneAnswer,
  roleAnswer,
  withEveryoneAnswer,
  withRoleAnswer,
  type EventAttendanceAnswer,
  type EventAttendanceDraft,
} from "@repo/validation";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useChapterBranding } from "@/lib/chapter-branding";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetScrim,
  TallSheetHeader,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  useTallSheetProps,
  SHEET_STACK_BEHAVIOR,
} from "@/components/sheet-scaffold";
import { Segmented } from "@/components/segmented";
import { BottomSheetFlatList } from "@/lib/sheet-scrollables";

/**
 * "Who's coming": an event's attendance by tier and role
 * (`spec/behavior/events.md` § Attendance by role), a step stacked over the
 * New event sheet (#3706).
 *
 * "Everyone else" first (the answer for anyone whose roles aren't set
 * apart), then one row per tier (Paul, 2026-11-22: a tier like Cabinet is
 * picked whole, and stays current as roles join it), then one per role, each
 * with the same three answers, in the order web's editor lists them. Everyone
 * else adds a fourth, On the calendar only (#6098): the event is there for
 * information, nobody attends, and each role is then on it or Not invited
 * (`attendanceTargets`). A role in a tier that is set apart follows the
 * tier's answer. A role that only
 * follows Everyone else holds its answer in neutral ink; a role set apart is
 * lit in the accent, so what was changed reads at a glance. One line at the
 * top says the whole rule in words. Comparable: Discord's channel permission
 * overrides, a row per role with the same three-way switch and @everyone
 * first.
 *
 * Done, a swipe down and Android back all close it onto the New event sheet,
 * which stays presented underneath (`SHEET_STACK_BEHAVIOR`), with the
 * summary row filled in. Nothing here can lose the event being made.
 *
 * Built for a chapter at real scale (an imported Discord server brings a
 * hundred roles): the list is virtualized, a search narrows it once there are
 * more than {@link ATTENDANCE_SEARCH_FROM} roles, and the roles set apart when the sheet
 * opened lead the list. The order is taken once per visit, so a row never
 * jumps out from under a finger.
 *
 * Controlled: the parent's draft holds the answer.
 */
export interface AttendanceSheetProps {
  value: EventAttendanceDraft;
  onChange: (next: EventAttendanceDraft) => void;
  /**
   * False drops Required from the answers, for a member who may make events
   * but not require attendance; a row already Required keeps it so its answer
   * stays visible (`attendanceChoices`).
   */
  allowRequired?: boolean;
}

export const AttendanceSheet = forwardRef<
  BottomSheetModal,
  AttendanceSheetProps
>(function AttendanceSheet({ value, onChange, allowRequired = true }, ref) {
  const backgroundStyle = useSheetBackgroundStyle();
  const tall = useTallSheetProps();
  const close = useSheetClose(ref);

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      {...tall}
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
    >
      <SheetBackToClose onClose={close} />
      {/* gorhom mounts a modal's children only while it is presented, so the
          body's state (the search, the row order) starts fresh each visit. */}
      <AttendanceBody
        value={value}
        onChange={onChange}
        allowRequired={allowRequired}
        onDone={close}
      />
    </BottomSheetModal>
  );
});

type AttendanceRow = AttendanceTargetRow;

interface AttendanceBodyProps {
  value: EventAttendanceDraft;
  onChange: (next: EventAttendanceDraft) => void;
  allowRequired: boolean;
  onDone: () => void;
}

function AttendanceBody({
  value,
  onChange,
  allowRequired,
  onDone,
}: AttendanceBodyProps) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand.accent);
  const rolesQuery = useRoles();
  const tiersQuery = useRoleTiers();
  const [search, setSearch] = useState("");
  // The tiers and roles set apart as the sheet opens lead the list for this
  // visit.
  const [pinned] = useState(() => Object.keys(value.roles));

  // Until the roles load, a set-apart id can't be told from a deleted one.
  const loaded = rolesQuery.isSuccess;
  const { rows, total, nameOf } = useMemo(
    () =>
      attendanceTargets(rolesQuery.data, tiersQuery.data, pinned, search, {
        missingRole: loaded ? "Removed role" : "Role",
        missingTier: tiersQuery.isSuccess ? "Removed tier" : "Tier",
      }),
    [
      rolesQuery.data,
      tiersQuery.data,
      pinned,
      search,
      loaded,
      tiersQuery.isSuccess,
    ],
  );
  const alumniId = alumniRoleIdOf(rolesQuery.data);
  const searchable = total > ATTENDANCE_SEARCH_FROM;
  // Four answers on Everyone else since #6098: On the calendar only sits
  // beside Required, Optional and Not invited, and while it is held each
  // role offers only it or Not invited (`attendanceAnswerChoices`).
  const options = (answers: readonly EventAttendanceAnswer[]) =>
    answers.map((answer) => ({
      value: answer,
      label: EVENT_ATTENDANCE_ANSWER_LABELS[answer],
    }));
  const everyone = everyoneAnswer(value);

  const header = (
    <View style={styles.header}>
      <TallSheetHeader
        title="Who's coming"
        onClose={onDone}
        doneAccent={brand.accent}
      />
      <Text
        style={styles.summary}
        numberOfLines={2}
        accessibilityLiveRegion="polite"
      >
        {describeAttendance(value, nameOf)}
      </Text>
      {/* The name over its answers: four answers, one of them "On the
          calendar only", need the sheet's whole width. */}
      <View style={styles.everyoneRow}>
        <Text style={styles.everyoneName} numberOfLines={1}>
          Everyone else
        </Text>
        <Segmented
          options={options(
            attendanceAnswerChoices(
              value,
              { kind: "everyone" },
              { allowRequired, calendarOnlyAllowed: true },
            ),
          )}
          value={everyone}
          onChange={(answer: EventAttendanceAnswer) =>
            onChange(withEveryoneAnswer(value, answer))
          }
          accessibilityLabel="Attendance for everyone else"
          dense
        />
      </View>
      {rolesQuery.isError && rows.length > 0 ? (
        <Text style={styles.note}>
          Couldn&apos;t load your chapter&apos;s roles, so role names may be
          missing.
        </Text>
      ) : null}
      {searchable ? (
        <BottomSheetTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search tiers and roles"
          placeholderTextColor={tokens.color.text.muted}
          accessibilityLabel="Search tiers and roles"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.field}
        />
      ) : null}
    </View>
  );

  return (
    <BottomSheetFlatList
      onAccessibilityEscape={onDone}
      data={rows}
      keyExtractor={(role: AttendanceRow) => role.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
      stickyHeaderIndices={[0]}
      ListEmptyComponent={
        <Text style={styles.caption}>
          {rolesQuery.isPending
            ? "Loading roles…"
            : rolesQuery.isError
              ? "Couldn't load your chapter's roles."
              : total === 0
                ? "Your chapter has no roles yet."
                : "No tiers or roles match that search."}
        </Text>
      }
      renderItem={({ item }: { item: AttendanceRow }) => {
        const setApart = item.id in value.roles;
        const followsTier =
          !setApart && !!item.tierEntry && item.tierEntry in value.roles;
        const current = roleAnswer(value, item.id, item.tierEntry);
        const note =
          item.detail ??
          (followsTier && item.tierEntry
            ? `Follows ${nameOf(item.tierEntry)}`
            : item.id === alumniId &&
                !setApart &&
                value.everyone !== "not_invited"
              ? ALUMNI_FOLLOWING_NOTE
              : null);
        return (
          <View style={[styles.row, styles.roleRow]}>
            <View style={styles.nameColumn}>
              <Text
                style={[styles.roleName, setApart ? null : styles.following]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {note ? (
                <Text style={styles.note} numberOfLines={2}>
                  {note}
                </Text>
              ) : null}
            </View>
            <View style={styles.choice}>
              <Segmented
                options={options(
                  attendanceAnswerChoices(
                    value,
                    { kind: "role", current },
                    {
                      allowRequired,
                      calendarOnlyAllowed: true,
                      floor: attendanceFloorOf(value, item.tierEntry),
                    },
                  ),
                )}
                value={current}
                onChange={(next: EventAttendanceAnswer) =>
                  onChange(withRoleAnswer(value, item.id, next, item.tierEntry))
                }
                quiet={!setApart}
                dense
                accessibilityLabel={`Attendance for ${item.name}`}
              />
            </View>
          </View>
        );
      }}
    />
  );
}

function createStyles(tokens: SignetTokens, accent: string) {
  const fieldStyles = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    content: {
      paddingBottom: tokens.spacing.xl,
    },
    header: {
      gap: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.sm,
      // Sticky: rows scroll under it, so it is painted.
      backgroundColor: tokens.color.surface.popover,
    },
    summary: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
      // Two lines held, so a longer rule never pushes the rows down (P4).
      minHeight:
        2 *
        (tokens.typography.role.body.lineHeight ??
          tokens.typography.role.body.size * 1.5),
    },
    caption: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.sm,
    },
    field: fieldStyles.field,
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      minHeight: tokens.touch.minimum + tokens.spacing.xs,
    },
    everyoneRow: {
      gap: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.color.border.hairline,
    },
    everyoneName: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
    roleRow: {
      paddingHorizontal: tokens.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.color.border.hairline,
    },
    nameColumn: {
      flex: 1,
    },
    note: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    roleName: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    following: {
      color: tokens.color.text.mutedForeground,
    },
    // Wide enough for "Not invited" in full at the caption size, and for
    // "On the calendar only" beside it while the event is calendar-only.
    choice: {
      width: 228,
    },
  });
}
