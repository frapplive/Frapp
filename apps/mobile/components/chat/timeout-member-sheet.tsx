import { forwardRef, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { SignetTokens } from "@repo/theme/signet";
import {
  useLiftChatTimeout,
  useMemberByUserId,
  useNowDate,
  useTimeOutMember,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { CHAT_TIMEOUT_COPY } from "@repo/chat-core/chat-timeout";
import {
  CHAT_TIMEOUT_DURATIONS,
  CHAT_TIMEOUT_REASON_MAX,
  isChatTimeoutActive,
  type ChatTimeoutDurationKey,
} from "@repo/validation";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useChapterBranding } from "@/lib/chapter-branding";
import { Segmented } from "@/components/segmented";
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
import { BottomSheetScrollView } from "@/lib/sheet-scrollables";
import { ListRow, ListSection } from "@/components/list-section";

/** Who the sheet is about: a member, by their `users.id`, and their name. */
export interface TimeoutSheetTarget {
  userId: string;
  name: string;
}

/** A pick, a field and a button: a fixed detent tall enough with the keyboard up. */
const SNAP_POINTS = ["60%"];

const DURATION_OPTIONS = CHAT_TIMEOUT_DURATIONS.map((duration) => ({
  value: duration.key,
  label: duration.label,
}));

/**
 * Time a member out of the chapter's channels (#6006,
 * `spec/behavior/chat/README.md` § Timeouts), from a message's long-press or
 * a member's profile. The phone half of web's `TimeoutMemberDialog`, with
 * the same words and choices (`CHAT_TIMEOUT_COPY`, `CHAT_TIMEOUT_DURATIONS`):
 * how long, an optional reason the member sees, and Lift timeout while one is
 * running.
 *
 * It reads the member's profile first, so a member ranked too high is told
 * so here, before anything is sent (`viewer_can_timeout`); the server checks
 * again.
 */
export const TimeoutMemberSheet = forwardRef<
  BottomSheetModal,
  { target: TimeoutSheetTarget | null }
>(function TimeoutMemberSheet({ target }, ref) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const backgroundStyle = useSheetBackgroundStyle();
  const closeSheet = useSheetClose(ref);
  const profile = useMemberByUserId(target?.userId ?? "");
  const timeOut = useTimeOutMember();
  const lift = useLiftChatTimeout();
  const now = useNowDate();
  const { onAnimate, markClosed, dismiss, visit, isSameVisit } =
    useSheetVisit(ref);
  const sending = useRef(false);

  const [duration, setDuration] = useState<ChatTimeoutDurationKey>("1h");
  const [reason, setReason] = useState("");
  const [focused, setFocused] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Each opening starts fresh, reset while rendering when the member changes.
  const targetUserId = target?.userId ?? null;
  const [openedFor, setOpenedFor] = useState(targetUserId);
  if (targetUserId !== openedFor) {
    setOpenedFor(targetUserId);
    setDuration("1h");
    setReason("");
    setFailure(null);
  }

  const member = profile.data;
  const memberId = member?.id ?? null;
  const allowed = member?.viewer_can_timeout === true;
  const runningUntil =
    member?.chat_timeout_until &&
    isChatTimeoutActive(member.chat_timeout_until, now.getTime())
      ? member.chat_timeout_until
      : null;
  const pending = timeOut.isPending || lift.isPending;

  function run(write: "time-out" | "lift") {
    if (!memberId || !allowed || pending || sending.current) return;
    sending.current = true;
    setFailure(null);
    const sentFrom = visit();
    const settle = {
      onSuccess: () => {
        if (isSameVisit(sentFrom)) dismiss();
      },
      onError: (error: unknown) =>
        setFailure(
          errorCopy(
            error,
            write === "lift"
              ? CHAT_TIMEOUT_COPY.liftFailed
              : CHAT_TIMEOUT_COPY.failed,
            // The routes' refusals are sentences for members ("You can only
            // time out members ranked below you.").
            { serverWritesForMembers: true },
          ),
        ),
      onSettled: () => {
        sending.current = false;
      },
    };
    if (write === "lift") lift.mutate({ memberId }, settle);
    else timeOut.mutate({ memberId, duration, reason }, settle);
  }

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      backdropComponent={SheetScrim}
      handleComponent={SheetGrabber}
      onAnimate={onAnimate}
      onDismiss={markClosed}
    >
      <SheetBackToClose onClose={closeSheet} />
      <BottomSheetScrollView
        onAccessibilityEscape={closeSheet}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <SheetHeader
          title={CHAT_TIMEOUT_COPY.title(target?.name ?? "")}
          onCancel={dismiss}
        />
        <Text style={styles.note}>{CHAT_TIMEOUT_COPY.effect}</Text>

        {runningUntil ? (
          <Text style={styles.running}>
            {CHAT_TIMEOUT_COPY.until(runningUntil, now)}
            {member?.chat_timeout_reason
              ? ` · ${member.chat_timeout_reason}`
              : ""}
          </Text>
        ) : null}

        {member && !allowed ? (
          <Text accessibilityRole="alert" style={styles.note}>
            {CHAT_TIMEOUT_COPY.outOfReach}
          </Text>
        ) : (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{CHAT_TIMEOUT_COPY.duration}</Text>
              <Segmented
                options={DURATION_OPTIONS}
                value={duration}
                onChange={setDuration}
                accessibilityLabel={CHAT_TIMEOUT_COPY.duration}
                disabled={pending || !member}
                dense
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{CHAT_TIMEOUT_COPY.reason}</Text>
              <BottomSheetTextInput
                value={reason}
                onChangeText={setReason}
                editable={!pending && !!member}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                maxLength={CHAT_TIMEOUT_REASON_MAX}
                placeholder={CHAT_TIMEOUT_COPY.reasonPlaceholder}
                placeholderTextColor={tokens.color.text.muted}
                accessibilityLabel={CHAT_TIMEOUT_COPY.reason}
                style={[styles.field, focused ? styles.fieldFocused : null]}
              />
            </View>
          </>
        )}

        {failure ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {failure}
          </Text>
        ) : null}

        {allowed ? (
          <SheetPrimaryButton
            label={CHAT_TIMEOUT_COPY.commit}
            onPress={() => run("time-out")}
            disabled={pending}
            accent={accent}
            onAccent={tokens.color.gold.onHouse}
          />
        ) : null}
        {runningUntil && allowed ? (
          <ListSection>
            <ListRow
              label={CHAT_TIMEOUT_COPY.lift}
              action
              onPress={() => run("lift")}
            />
          </ListSection>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

function createStyles(tokens: SignetTokens, accent: string) {
  const fieldStyles = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.lg,
    },
    fieldGroup: {
      gap: tokens.spacing.sm,
    },
    label: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    field: fieldStyles.field,
    fieldFocused: fieldStyles.fieldFocused,
    note: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    running: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.foreground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
  });
}
