import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { errorCopy } from "@repo/hooks/error-copy";
import { RENAME_DOCUMENT_TITLE } from "@repo/hooks/document-library";
import { DOCUMENT_TITLE_MAX_LENGTH } from "@repo/validation";
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
import { useFrappTheme } from "@/lib/theme";

/**
 * Rename a file (#5563), from its long-press sheet: one field holding the
 * file's name, and the commit, as web's Rename dialog asks it and as Drive's
 * and the Files app's Rename do. The host mounts it per file, so it opens on
 * that file's name; a refusal (a file that takes Drive's name, a role that
 * may not) stays on the sheet in the server's words.
 */
export function RenameDocumentSheet({
  name,
  onSubmit,
  onClosed,
}: {
  /** The file's name now. */
  name: string;
  /** Sends the new name; rejects with the server's error. */
  onSubmit: (title: string) => Promise<void>;
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
  const [title, setTitle] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const sending = useRef(false);
  const trimmed = title.trim();
  const unchanged = trimmed === name.trim();

  useEffect(() => {
    ref.current?.present();
  }, []);

  const submit = async () => {
    if (sending.current || !trimmed || unchanged) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    const sentFrom = visit();
    try {
      await onSubmit(trimmed);
      if (isSameVisit(sentFrom)) dismiss();
    } catch (error) {
      if (isSameVisit(sentFrom)) {
        setProblem(
          errorCopy(error, "Couldn't rename the file. Try again.", {
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
          title={RENAME_DOCUMENT_TITLE}
          onCancel={() => {
            if (sending.current) return;
            dismiss();
          }}
          cancelDisabled={busy}
        />
        <ReasonInput
          label="Name"
          placeholder={name}
          value={title}
          max={DOCUMENT_TITLE_MAX_LENGTH}
          editable={!busy}
          focused={focused}
          onFocusChange={setFocused}
          onChange={(text) => {
            setProblem(null);
            setTitle(text);
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
          label="Rename"
          onPress={() => void submit()}
          disabled={busy || !trimmed || unchanged}
          busy={busy}
          accent={accent}
          onAccent={tokens.color.gold.onHouse}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}
