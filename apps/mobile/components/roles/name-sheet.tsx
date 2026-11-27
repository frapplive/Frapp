import { forwardRef, useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";
import {
  useChapterBranding,
  type ChapterBranding,
} from "@/lib/chapter-branding";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetPrimaryButton,
  SheetScrim,
  SHEET_STACK_BEHAVIOR,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  useGuardedSheetRef,
} from "@/components/sheet-scaffold";
import { successHaptic } from "@/lib/haptics";
import { BottomSheetScrollView } from "@/lib/sheet-scrollables";

export interface NameSheetProps {
  /** The sheet's title and its button: "Add tier", "New group". */
  title: string;
  submitLabel: string;
  placeholder: string;
  /** What a screen reader calls the field: "New tier name". */
  fieldLabel: string;
  maxLength: number;
  /**
   * Makes the thing. Resolves `null` once made, which closes the sheet, or the
   * failure to say under the field, which keeps the name for another try.
   */
  onSubmit: (name: string) => Promise<string | null>;
}

/**
 * Name one thing and make it (#6029): Roles and groups' Add tier and New
 * group on the phone, where web's rows open a name field in place. The
 * single-field form of Add role's sheet (`new-role-sheet.tsx`), on the same
 * scaffold: the name outlives a close, not a Cancel
 * (`spec/ui/mobile/patterns.md` § Bottom sheets).
 */
export const NameSheet = forwardRef<BottomSheetModal, NameSheetProps>(
  function NameSheet(
    { title, submitLabel, placeholder, fieldLabel, maxLength, onSubmit },
    ref,
  ) {
    const { tokens } = useFrappTheme();
    const brand = useChapterBranding();
    const styles = createStyles(tokens, brand);
    const backgroundStyle = useSheetBackgroundStyle();
    const closeSheet = useSheetClose(ref);
    const { modalRef, onAnimate, markClosed, dismiss, visit, isSameVisit } =
      useGuardedSheetRef(ref);
    const [name, setName] = useState("");
    const [focused, setFocused] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const sending = useRef(false);
    const trimmed = name.trim();

    const closed = useCallback(() => {
      markClosed();
      setFocused(false);
      setFailure(null);
    }, [markClosed]);

    const cancel = useCallback(() => {
      if (sending.current) return;
      setName("");
      setFailure(null);
      dismiss();
    }, [dismiss]);

    const add = useCallback(() => {
      if (!trimmed || sending.current) return;
      sending.current = true;
      setSaving(true);
      setFailure(null);
      const sentFrom = visit();
      void onSubmit(trimmed).then((failed) => {
        sending.current = false;
        setSaving(false);
        if (failed === null) {
          successHaptic();
          setName("");
          if (isSameVisit(sentFrom)) dismiss();
        } else if (isSameVisit(sentFrom)) {
          setFailure(failed);
        }
      });
    }, [trimmed, onSubmit, visit, isSameVisit, dismiss]);

    return (
      <BottomSheetModal
        ref={modalRef}
        stackBehavior={SHEET_STACK_BEHAVIOR}
        enableDynamicSizing
        keyboardBehavior="interactive"
        backgroundStyle={backgroundStyle}
        handleComponent={SheetGrabber}
        backdropComponent={SheetScrim}
        onAnimate={onAnimate}
        onDismiss={closed}
      >
        <SheetBackToClose onClose={closeSheet} />
        <BottomSheetScrollView
          onAccessibilityEscape={closeSheet}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <SheetHeader
            title={title}
            onCancel={cancel}
            cancelDisabled={saving}
          />
          <View style={[styles.ring, focused ? styles.ringActive : null]}>
            <BottomSheetTextInput
              value={name}
              onChangeText={(next) => {
                setName(next);
                setFailure(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={add}
              returnKeyType="done"
              editable={!saving}
              placeholder={placeholder}
              placeholderTextColor={tokens.color.text.muted}
              accessibilityLabel={fieldLabel}
              maxLength={maxLength}
              style={[styles.field, focused ? styles.fieldFocused : null]}
            />
          </View>
          {failure ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {failure}
            </Text>
          ) : null}
          <SheetPrimaryButton
            label={submitLabel}
            onPress={add}
            disabled={!trimmed || saving}
            busy={saving}
            accessibilityHint={trimmed ? undefined : "Type a name first."}
            accent={brand.accent}
            onAccent={tokens.color.gold.onHouse}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

function createStyles(tokens: SignetTokens, brand: ChapterBranding) {
  const fieldStyles = sheetFieldStyles(tokens, brand.accent);
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.sm,
    },
    ring: fieldStyles.ring,
    ringActive: fieldStyles.ringActive,
    field: fieldStyles.field,
    fieldFocused: fieldStyles.fieldFocused,
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
  });
}
