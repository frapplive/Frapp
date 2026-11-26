import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { errorCopy } from "@repo/hooks/error-copy";
import { localIsoDate, suggestedDueTime } from "@repo/formatting";
import {
  TASK_EXTENSION_COPY,
  TASK_EXTENSION_REASON_MAX_LENGTH,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetPrimaryButton,
  SheetScrim,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  useSheetVisit,
  SHEET_STACK_BEHAVIOR,
} from "@/components/sheet-scaffold";
import { DueDateField } from "@/components/tasks/due-date-field";
import { DueTimeField } from "@/components/tasks/due-time-field";
import { useChapterBranding } from "@/lib/chapter-branding";
import {
  useDropKeptSheetDraft,
  useKeptSheetDraft,
  useKeptSheetOpening,
} from "@/lib/kept-sheet-draft";
import type { TaskRowModel } from "@/lib/tasks/board";
import {
  EXTENSION_ASK_FAILED,
  extensionAsk,
  extensionDraftOf,
  type ExtensionDueDraft,
} from "@/lib/tasks/extension";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** What Ask for more time keeps past the sheet, by task. */
interface AskDraft {
  due: ExtensionDueDraft;
  reason: string;
  /** The due it was asked against: a re-dated task starts the ask over. */
  from: string | null;
}

/** The name an ask's draft is kept under, one per task. */
export function askDraftKey(taskId: string): string {
  return `task-extension:${taskId}`;
}

/** What the sheet sends; rejects with the server's error. */
export type AskForMoreTimeSubmit = (body: {
  due_date: string;
  due_at?: string;
  reason: string;
}) => Promise<void>;

/**
 * Ask for more time on the phone (#6096), web's `AskForMoreTimeDialog` as a
 * sheet, built as Send back's sheet is (`send-back-sheet.tsx`): a reason
 * typed over the task, required, with a counter, kept past the sheet
 * (`task-extension:<id>`) until it is sent or Cancelled. Above it the new
 * due on the platform's own date picker, and its time on a task due at one,
 * opening a day after the task's due, the longest that is approved without
 * an officer (`extensionDraftOf`). Canvas and Google Classroom take a
 * student's extension request the same way: a new date and why.
 *
 * The host mounts one per ask (`key` on the task); it opens itself and calls
 * `onClosed` once it has gone. A refusal stays on the sheet in the server's
 * words, the draft kept.
 */
export function AskForMoreTimeSheet({
  row,
  onSubmit,
  onClosed,
}: {
  row: TaskRowModel;
  onSubmit: AskForMoreTimeSubmit;
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
  // Read once per visit, so the earliest day doesn't move mid-ask.
  const [openedAt] = useState(() => new Date());
  const from = row.dueAt ?? row.dueDay;
  const keptName = askDraftKey(row.id);
  const stored = useKeptSheetOpening<AskDraft>(keptName, { waitsOnSend: true });
  const fits = stored !== undefined && stored.from === from;
  const opening = fits ? stored : undefined;
  useDropKeptSheetDraft(keptName, stored !== undefined && !fits);
  // An undated task can't be asked about (`cantAskForMoreTime`), so the
  // fallback is never drawn; it only keeps the field's type whole.
  const [due, setDue] = useState<ExtensionDueDraft>(
    () =>
      opening?.due ??
      extensionDraftOf(row, openedAt) ?? {
        date: localIsoDate(openedAt),
        time: null,
      },
  );
  const [reason, setReason] = useState(opening?.reason ?? "");
  const kept = useKeptSheetDraft<AskDraft>(
    keptName,
    { due, reason, from },
    undefined,
    opening,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = busy || kept.sendingElsewhere;
  useEffect(() => {
    if (kept.landedElsewhere) dismiss();
  }, [kept.landedElsewhere, dismiss]);
  const [focused, setFocused] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    ref.current?.present();
  }, []);

  const today = localIsoDate(openedAt);
  // Never a day before the task's own: a due can only move later.
  const earliest =
    row.dueDay && row.dueDay.slice(0, 10) > today
      ? row.dueDay.slice(0, 10)
      : today;

  const submit = async () => {
    if (sending.current || kept.sendingElsewhere) return;
    const ask = extensionAsk(row, due, reason, new Date());
    if (!ask.ok) {
      setProblem(ask.problem);
      return;
    }
    sending.current = true;
    setBusy(true);
    setProblem(null);
    const sentFrom = visit();
    kept.hold();
    try {
      await onSubmit(ask.body);
      kept.clear();
      if (isSameVisit(sentFrom)) dismiss();
    } catch (error) {
      kept.release();
      if (isSameVisit(sentFrom)) {
        setProblem(
          errorCopy(error, EXTENSION_ASK_FAILED, {
            serverWritesForMembers: true,
          }),
        );
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
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
          title={TASK_EXTENSION_COPY.title}
          onCancel={() => {
            if (sending.current || kept.sendingElsewhere) return;
            kept.clear();
            dismiss();
          }}
          cancelDisabled={locked}
        />
        <Text style={styles.subtitle} numberOfLines={2}>
          {row.title}
        </Text>

        <View style={styles.group}>
          <Text style={styles.label}>{TASK_EXTENSION_COPY.newDue}</Text>
          <View style={styles.box}>
            <DueDateField
              value={due.date}
              today={today}
              earliest={earliest}
              label={TASK_EXTENSION_COPY.newDue}
              disabled={locked}
              onChange={(date) => {
                setProblem(null);
                setDue({ ...due, date });
              }}
            />
          </View>
          {due.time ? (
            <View style={styles.box}>
              <DueTimeField
                value={due.time}
                suggested={suggestedDueTime(due.date, openedAt)}
                disabled={locked}
                clearable={false}
                onChange={(time) => {
                  if (!time) return;
                  setProblem(null);
                  setDue({ ...due, time });
                }}
              />
            </View>
          ) : null}
        </View>

        <ReasonInput
          label={TASK_EXTENSION_COPY.reasonLabel}
          placeholder={TASK_EXTENSION_COPY.reasonPlaceholder}
          value={reason}
          max={TASK_EXTENSION_REASON_MAX_LENGTH}
          editable={!locked}
          focused={focused}
          onFocusChange={setFocused}
          onChange={(text) => {
            setProblem(null);
            setReason(text);
          }}
          onSubmit={() => void submit()}
          styles={styles}
          mutedColor={tokens.color.text.muted}
        />

        <Text style={styles.hint}>{TASK_EXTENSION_COPY.hint}</Text>

        {problem ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}

        <SheetPrimaryButton
          label={TASK_EXTENSION_COPY.send}
          onPress={() => void submit()}
          disabled={locked}
          busy={locked}
          accent={accent}
          onAccent={tokens.color.gold.onHouse}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export type ReasonSheetStyles = ReturnType<typeof createReasonStyles>;

/**
 * A required reason in a sheet, with its counter: Send back's field
 * (`send-back-sheet.tsx`), shared by Ask for more time and Decline (#6096).
 */
export function ReasonInput({
  label,
  placeholder,
  value,
  max,
  editable,
  focused,
  onFocusChange,
  onChange,
  onSubmit,
  styles,
  mutedColor,
}: {
  label: string;
  placeholder: string;
  value: string;
  max: number;
  editable: boolean;
  focused: boolean;
  onFocusChange: (focused: boolean) => void;
  onChange: (text: string) => void;
  onSubmit: () => void;
  styles: ReasonSheetStyles;
  mutedColor: string;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.ring, focused ? styles.ringActive : null]}>
        <BottomSheetTextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={mutedColor}
          accessibilityLabel={label}
          maxLength={max}
          returnKeyType="send"
          onSubmitEditing={onSubmit}
          style={[styles.field, focused ? styles.fieldFocused : null]}
        />
      </View>
      <Text style={styles.counter}>
        {value.length}/{max}
      </Text>
    </View>
  );
}

/** The reason sheets' styles: Send back's, with a framed box for the due. */
export function createReasonStyles(tokens: SignetTokens, accent: string) {
  const fields = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.md,
    },
    subtitle: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
    group: {
      gap: tokens.spacing.xs,
    },
    label: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
      flexShrink: 1,
    },
    box: {
      ...fields.field,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    ring: fields.ring,
    ringActive: fields.ringActive,
    field: fields.field,
    fieldFocused: fields.fieldFocused,
    counter: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      alignSelf: "flex-end",
    },
    hint: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
    },
  });
}

const createStyles = createReasonStyles;
