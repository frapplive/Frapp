import { localIsoDate } from "@repo/formatting";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  useClearRushFollowUp,
  useSetRushFollowUp,
  type RushPipelineCandidate,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  RUSH_FOLLOW_UP_AHEAD_DAYS,
  RUSH_FOLLOW_UP_NOTE_MAX,
  formatRushDay,
  shiftRushDayKey,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { CardButton } from "@/components/chat/chat-card";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetScrim,
  SHEET_STACK_BEHAVIOR,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  useSheetVisit,
} from "@/components/sheet-scaffold";
import { DueDateField } from "@/components/tasks/due-date-field";
import { useChapterBranding } from "@/lib/chapter-branding";
import { alertFailure } from "@/lib/failure-alert";
import { useKeptSheetDraft, useKeptSheetOpening } from "@/lib/kept-sheet-draft";
import { rushFollowUpTarget } from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** The sheet's title, and the prospect screen's row. */
export const RUSH_FOLLOW_UP = "Follow-up";

/** What the sheet keeps past a close. */
interface FollowUpDraft {
  day: string;
  note: string;
}

/** The kept draft's name, one per prospect. */
export function rushFollowUpDraftKey(candidateId: string): string {
  return `rush-follow-up:${candidateId}`;
}

/**
 * The day a follow-up sheet opens on: what was kept or is set, never a day
 * already gone, else tomorrow, as HubSpot's new task defaults to the next
 * business day rather than asking.
 */
export function followUpOpeningDay(
  kept: string | undefined,
  set: string | null,
  today: string,
): string {
  const day = kept ?? set;
  if (!day) return shiftRushDayKey(today, 1);
  return day < today ? today : day;
}

/**
 * A prospect's follow-up (#5934, `rush.md` § Contacts, owner and follow-ups):
 * the day (the platform picker, today to {@link RUSH_FOLLOW_UP_AHEAD_DAYS}
 * days ahead), what to do ("Invite to house dinner", up to
 * {@link RUSH_FOLLOW_UP_NOTE_MAX} characters), and who it's for, which is
 * whoever it is set for already, else the owner, else the member setting it.
 * HubSpot's task and ChapterBuilder's follow-up reminder carry the same three.
 * Save sets it; Clear follow-up takes it off. Its draft is kept per prospect
 * when the sheet closes another way.
 *
 * The host mounts one per open; it opens itself and calls `onClosed` once it
 * has gone.
 */
export function RushFollowUpSheet({
  candidate,
  viewerId,
  onClosed,
}: {
  candidate: RushPipelineCandidate;
  viewerId: string | null;
  onClosed: () => void;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const backgroundStyle = useSheetBackgroundStyle();
  const ref = useRef<BottomSheetModal>(null);
  const closeSheet = useSheetClose(ref);
  const { onAnimate, markClosed, dismiss, visit, isSameVisit } =
    useSheetVisit(ref);
  const save = useSetRushFollowUp();
  const clear = useClearRushFollowUp();

  const today = localIsoDate(new Date());
  const draftName = rushFollowUpDraftKey(candidate.id);
  const opening = useKeptSheetOpening<FollowUpDraft>(draftName);
  const [day, setDay] = useState(() =>
    followUpOpeningDay(opening?.day, candidate.follow_up_on, today),
  );
  const [note, setNote] = useState(
    opening?.note ?? candidate.follow_up_note ?? "",
  );
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kept = useKeptSheetDraft<FollowUpDraft>(
    draftName,
    { day, note },
    undefined,
    opening,
  );
  const sending = useRef(false);
  const target = rushFollowUpTarget(candidate, viewerId);
  const hasOne = candidate.follow_up_on !== null;

  useEffect(() => {
    ref.current?.present();
  }, []);

  const submit = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    const sentFrom = visit();
    kept.hold();
    try {
      await save.mutateAsync({
        candidateId: candidate.id,
        dueOn: day,
        note: note.trim() || undefined,
        // A follow-up already set stays with whoever it was for.
        forUserId: candidate.follow_up_user_id ?? undefined,
      });
      kept.clear();
      if (isSameVisit(sentFrom)) dismiss();
    } catch (error) {
      kept.release();
      if (isSameVisit(sentFrom)) {
        setProblem(
          errorCopy(error, "Couldn't save the follow-up. Try again.", {
            serverWritesForMembers: true,
          }),
        );
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const takeOff = () => {
    if (sending.current) return;
    kept.clear();
    dismiss();
    clear.mutate(candidate.id, {
      onError: (error) =>
        alertFailure({ title: "Couldn't clear the follow-up", error }),
    });
  };

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      enableDynamicSizing
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
      onAnimate={onAnimate}
      onDismiss={() => {
        markClosed();
        onClosed();
      }}
    >
      <SheetBackToClose onClose={closeSheet} />
      <BottomSheetView onAccessibilityEscape={closeSheet} style={styles.body}>
        <SheetHeader
          title={RUSH_FOLLOW_UP}
          onCancel={() => {
            if (sending.current) return;
            kept.clear();
            dismiss();
          }}
          cancelDisabled={busy}
          action={{
            label: "Save",
            accessibilityLabel: "Save follow-up",
            onPress: () => void submit(),
            disabled: busy,
            accent,
            onAccent: tokens.color.gold.onHouse,
          }}
        />
        <View style={styles.dayRow}>
          <DueDateField
            value={day}
            today={today}
            latest={shiftRushDayKey(today, RUSH_FOLLOW_UP_AHEAD_DAYS)}
            label="Day"
            format={(picked) => formatRushDay(picked, today)}
            disabled={busy}
            onChange={setDay}
          />
        </View>
        <View style={[styles.ring, focused ? styles.ringActive : null]}>
          <BottomSheetTextInput
            value={note}
            onChangeText={setNote}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!busy}
            placeholder="Invite to house dinner"
            placeholderTextColor={tokens.color.text.muted}
            accessibilityLabel="What to do"
            maxLength={RUSH_FOLLOW_UP_NOTE_MAX}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={[styles.field, focused ? styles.fieldFocused : null]}
          />
        </View>
        <Text style={styles.muted}>{target.words}</Text>
        {problem ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
        {hasOne ? (
          <View style={styles.clearRow}>
            <CardButton
              label="Clear follow-up"
              variant="link"
              disabled={busy}
              onPress={takeOff}
            />
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function createStyles(tokens: SignetTokens, accent: string) {
  const fields = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.md,
    },
    dayRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: tokens.touch.minimum,
    },
    ring: fields.ring,
    ringActive: fields.ringActive,
    field: fields.field,
    fieldFocused: fields.fieldFocused,
    muted: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
    },
    clearRow: {
      flexDirection: "row",
      justifyContent: "flex-start",
    },
  });
}
