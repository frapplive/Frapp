import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  TASK_EXTENSION_COPY,
  TASK_EXTENSION_DECLINE_MAX_LENGTH,
} from "@repo/validation";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetPrimaryButton,
  SheetScrim,
  useSheetBackgroundStyle,
  useSheetClose,
  useSheetVisit,
  SHEET_STACK_BEHAVIOR,
} from "@/components/sheet-scaffold";
import {
  createReasonStyles,
  ReasonInput,
} from "@/components/tasks/ask-more-time-sheet";
import { useChapterBranding } from "@/lib/chapter-branding";
import { useKeptSheetDraft, useKeptSheetOpening } from "@/lib/kept-sheet-draft";
import { declineProblem } from "@/lib/tasks/extension";
import { useFrappTheme } from "@/lib/theme";

/** The name a Decline's reason is kept under, one per request. */
export function declineDraftKey(requestId: string): string {
  return `task-extension-decline:${requestId}`;
}

/**
 * An officer's Decline on a request for more time (#6096), built as Send
 * back's sheet is (`send-back-sheet.tsx`): a required one-line reason with a
 * counter, which the member is told, kept past the sheet by request until it
 * is sent or Cancelled. It rises over Activity's sheet that showed the
 * request. A refusal (someone answered first, a 409) stays on the sheet in
 * the server's words; the host re-reads.
 */
export function DeclineExtensionSheet({
  requestId,
  taskTitle,
  onSubmit,
  onClosed,
}: {
  requestId: string;
  taskTitle: string;
  /** Makes the write; rejects with the server's error. */
  onSubmit: (reason: string) => Promise<void>;
  onClosed: () => void;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createReasonStyles(tokens, accent);
  const backgroundStyle = useSheetBackgroundStyle();
  const ref = useRef<BottomSheetModal>(null);
  const closeSheet = useSheetClose(ref);
  const { onAnimate, markClosed, dismiss, visit, isSameVisit } =
    useSheetVisit(ref);
  const keptName = declineDraftKey(requestId);
  const opening = useKeptSheetOpening<{ reason: string }>(keptName, {
    waitsOnSend: true,
  });
  const [reason, setReason] = useState(opening?.reason ?? "");
  const kept = useKeptSheetDraft<{ reason: string }>(
    keptName,
    { reason },
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

  const submit = async () => {
    if (sending.current || kept.sendingElsewhere) return;
    const refused = declineProblem(reason);
    if (refused) {
      setProblem(refused);
      return;
    }
    sending.current = true;
    setBusy(true);
    setProblem(null);
    const sentFrom = visit();
    kept.hold();
    try {
      await onSubmit(reason.trim());
      kept.clear();
      if (isSameVisit(sentFrom)) dismiss();
    } catch (error) {
      kept.release();
      if (isSameVisit(sentFrom)) {
        setProblem(
          errorCopy(error, TASK_EXTENSION_COPY.declineFailed, {
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
          title={TASK_EXTENSION_COPY.declineTitle}
          onCancel={() => {
            if (sending.current || kept.sendingElsewhere) return;
            kept.clear();
            dismiss();
          }}
          cancelDisabled={locked}
        />
        <Text style={styles.subtitle} numberOfLines={2}>
          {taskTitle}
        </Text>
        <ReasonInput
          label={TASK_EXTENSION_COPY.declineReasonLabel}
          placeholder={TASK_EXTENSION_COPY.declineReasonPlaceholder}
          value={reason}
          max={TASK_EXTENSION_DECLINE_MAX_LENGTH}
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
        {problem ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
        <SheetPrimaryButton
          label={TASK_EXTENSION_COPY.decline}
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
