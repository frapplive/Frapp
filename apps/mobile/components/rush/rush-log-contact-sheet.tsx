import { localIsoDate } from "@repo/formatting";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  useChapterRoster,
  useLogRushContact,
  useViewerUserId,
  type RushContactKind,
} from "@repo/hooks";
import {
  RUSH_CONTACT_KINDS,
  RUSH_CONTACT_KIND_LABELS,
  RUSH_CONTACT_LOOKBACK_DAYS,
  RUSH_CONTACT_NOTE_MAX,
  formatRushDay,
  shiftRushDayKey,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
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
import { typeRole, useFrappTheme } from "@/lib/theme";

/** The sheet's title, and the button that opens it. */
export const RUSH_LOG_CONTACT = "Log contact";

/** What the sheet keeps past a close (`useKeptSheetDraft`). */
interface LogContactDraft {
  note: string;
}

/** The kept note's name, one per prospect. */
export function rushContactDraftKey(candidateId: string): string {
  return `rush-contact:${candidateId}`;
}

/**
 * Log a contact (#5934, `rush.md` § Contacts, owner and follow-ups), two taps
 * from the prospect: **Log contact**, then how they were reached. A tap on a
 * kind logs it, for today, and closes, as a recruiter texts five prospects a
 * night and logs each in passing (`ifc-recruitment.md` § A recruitment week:
 * "two taps, with no form to fill"). Pipedrive's phone app logs a call the
 * same way, its activity types a row of one-tap choices, and HubSpot's "Log
 * activity" defaults the day to today.
 *
 * Under the kinds, the same sheet takes another day (the platform picker, back
 * to {@link RUSH_CONTACT_LOOKBACK_DAYS} days and never ahead) and a note of up
 * to {@link RUSH_CONTACT_NOTE_MAX} characters, both read when a kind is
 * tapped. The kinds sit above them so the keyboard, while the note is typed,
 * never covers them. The note is kept per prospect when the sheet closes
 * without a kind, as every form's draft is.
 *
 * The write is optimistic (`useLogRushContact`): the prospect's last contact
 * changes at once and the sheet is already down; a refusal says so in the
 * app's failure alert, with the note put back.
 *
 * The host mounts one per open (`key` on the prospect); it opens itself and
 * calls `onClosed` once it has gone.
 */
export function RushLogContactSheet({
  candidateId,
  onClosed,
}: {
  candidateId: string;
  onClosed: () => void;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const backgroundStyle = useSheetBackgroundStyle();
  const ref = useRef<BottomSheetModal>(null);
  const closeSheet = useSheetClose(ref);
  const { onAnimate, markClosed, dismiss } = useSheetVisit(ref);
  const log = useLogRushContact();
  const viewerId = useViewerUserId();
  const roster = useChapterRoster().data;
  const viewerName =
    roster?.find((member) => member.user_id === viewerId)?.display_name ??
    undefined;

  const today = localIsoDate(new Date());
  const draftName = rushContactDraftKey(candidateId);
  const opening = useKeptSheetOpening<LogContactDraft>(draftName);
  const [note, setNote] = useState(opening?.note ?? "");
  const [day, setDay] = useState(today);
  const [focused, setFocused] = useState(false);
  const kept = useKeptSheetDraft<LogContactDraft>(
    draftName,
    { note },
    undefined,
    opening,
  );
  // One log per open: a second tap while the sheet slides down is the same
  // contact, not another.
  const sent = useRef(false);

  useEffect(() => {
    ref.current?.present();
  }, []);

  const pick = async (kind: RushContactKind) => {
    if (sent.current) return;
    sent.current = true;
    const input = {
      candidateId,
      kind,
      contactedOn: day,
      note: note.trim() || undefined,
      byName: viewerName,
    };
    kept.hold();
    dismiss();
    try {
      await log.mutateAsync(input);
      kept.clear();
    } catch (error) {
      kept.release();
      alertFailure({
        title: "Couldn't log that contact",
        error,
        retry: () => log.mutate(input),
      });
    }
  };

  const dayWords = formatRushDay(day, today);

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
        <SheetHeader title={RUSH_LOG_CONTACT} />
        <View>
          {RUSH_CONTACT_KINDS.map((kind, index) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={RUSH_CONTACT_KIND_LABELS[kind]}
              accessibilityHint={`Logs it for ${dayWords.toLowerCase()}.`}
              onPress={() => void pick(kind)}
              style={({ pressed }) => [
                styles.kind,
                index === RUSH_CONTACT_KINDS.length - 1
                  ? styles.kindLast
                  : null,
                pressed ? styles.kindPressed : null,
              ]}
            >
              <Text style={styles.kindLabel}>
                {RUSH_CONTACT_KIND_LABELS[kind]}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.details}>
          <View style={styles.dayRow}>
            <DueDateField
              value={day}
              today={today}
              earliest={shiftRushDayKey(today, -RUSH_CONTACT_LOOKBACK_DAYS)}
              latest={today}
              label="Day"
              format={(picked) => formatRushDay(picked, today)}
              disabled={false}
              onChange={setDay}
            />
          </View>
          <View style={[styles.ring, focused ? styles.ringActive : null]}>
            <BottomSheetTextInput
              value={note}
              onChangeText={setNote}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Add a note"
              placeholderTextColor={tokens.color.text.muted}
              accessibilityLabel="Note"
              maxLength={RUSH_CONTACT_NOTE_MAX}
              multiline
              style={[
                styles.field,
                styles.fieldMultiline,
                focused ? styles.fieldFocused : null,
              ]}
            />
          </View>
        </View>
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
    kind: {
      minHeight: tokens.touch.minimum,
      justifyContent: "center",
      paddingVertical: tokens.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.color.border.hairline,
    },
    kindLast: {
      borderBottomWidth: 0,
    },
    kindPressed: {
      opacity: 0.7,
    },
    kindLabel: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    details: {
      gap: tokens.spacing.sm,
      paddingTop: tokens.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.color.border.hairline,
    },
    dayRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: tokens.touch.minimum,
    },
    ring: fields.ring,
    ringActive: fields.ringActive,
    field: fields.field,
    fieldMultiline: {
      ...fields.fieldMultilineText,
      minHeight: tokens.touch.minimum,
    },
    fieldFocused: fields.fieldFocused,
  });
}
