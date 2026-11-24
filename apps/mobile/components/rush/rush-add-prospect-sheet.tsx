import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useAddRushProspect } from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
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
import { useChapterBranding } from "@/lib/chapter-branding";
import { useKeptSheetDraft, useKeptSheetOpening } from "@/lib/kept-sheet-draft";
import {
  RUSH_ADD_PROSPECT,
  RUSH_PROSPECT_NAME_MAX,
  rushAddProspectProblem,
} from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** The kept draft's name: one half-typed name per chapter. */
export const RUSH_ADD_PROSPECT_DRAFT = "rush-add-prospect";

interface AddProspectDraft {
  name: string;
}

/**
 * New prospect on the phone (#5931 item 3; `rush.md` § Pipeline): one name,
 * the write `/<word> add` sends from chat and web's New prospect dialog sends,
 * opened from the list's floating "+" for a role with `rush:add`. A name the
 * chapter already has (409) is said under the field in web's words, so the
 * member changes it without starting over. Add prospect commits from the
 * sheet's header (`SheetHeader`'s `action`), as New event's Create does; the
 * name is kept when the sheet closes another way, and Cancel gives it up.
 *
 * The host mounts one per open; it opens itself and calls `onClosed` once it
 * has gone, and `onAdded` once the prospect is on the list.
 */
export function RushAddProspectSheet({
  onAdded,
  onClosed,
}: {
  onAdded: () => void;
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
  const add = useAddRushProspect();
  const opening = useKeptSheetOpening<AddProspectDraft>(
    RUSH_ADD_PROSPECT_DRAFT,
  );
  const [name, setName] = useState(opening?.name ?? "");
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kept = useKeptSheetDraft<AddProspectDraft>(
    RUSH_ADD_PROSPECT_DRAFT,
    { name },
    undefined,
    opening,
  );
  const sending = useRef(false);
  const trimmed = name.trim();

  useEffect(() => {
    ref.current?.present();
  }, []);

  const submit = async () => {
    if (!trimmed || sending.current) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    const sentFrom = visit();
    kept.hold();
    try {
      await add.mutateAsync(trimmed);
      kept.clear();
      onAdded();
      if (isSameVisit(sentFrom)) dismiss();
    } catch (error) {
      kept.release();
      if (isSameVisit(sentFrom)) {
        setProblem(
          rushAddProspectProblem(error, trimmed) ??
            errorCopy(error, "Couldn't add them. Try again."),
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
          title={RUSH_ADD_PROSPECT.title}
          onCancel={() => {
            if (sending.current) return;
            kept.clear();
            dismiss();
          }}
          cancelDisabled={busy}
          action={{
            label: RUSH_ADD_PROSPECT.commit,
            accessibilityLabel: RUSH_ADD_PROSPECT.commit,
            onPress: () => void submit(),
            disabled: !trimmed || busy,
            accessibilityHint: trimmed ? undefined : RUSH_ADD_PROSPECT.missing,
            accent,
            onAccent: tokens.color.gold.onHouse,
          }}
        />
        <View style={[styles.ring, focused ? styles.ringActive : null]}>
          <BottomSheetTextInput
            value={name}
            onChangeText={(next) => {
              setName(next);
              if (problem) setProblem(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!busy}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={RUSH_ADD_PROSPECT.field}
            placeholderTextColor={tokens.color.text.muted}
            accessibilityLabel={RUSH_ADD_PROSPECT.field}
            maxLength={RUSH_PROSPECT_NAME_MAX}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={[styles.field, focused ? styles.fieldFocused : null]}
          />
        </View>
        {problem ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {problem}
          </Text>
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
    ring: fields.ring,
    ringActive: fields.ringActive,
    field: fields.field,
    fieldFocused: fields.fieldFocused,
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
    },
  });
}
