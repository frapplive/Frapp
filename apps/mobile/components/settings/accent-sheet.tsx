import { errorCopy } from "@repo/hooks/error-copy";
import { forwardRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useCurrentChapter, useUpdateChapter } from "@repo/hooks";
import { normalizeAccentInput } from "@repo/hooks/chapter-identity";
import { orgColorsFor } from "@repo/org-archetypes";
import { SignetTokens } from "@repo/theme/signet";
import { AccentPicker } from "@/components/chapter/accent-picker";
import {
  SheetGrabber,
  SheetHeader,
  SheetScrim,
  useSheetBackgroundStyle,
  SheetBackToClose,
  useSheetClose,
  SHEET_STACK_BEHAVIOR,
} from "@/components/sheet-scaffold";
import { useChapterBranding } from "@/lib/chapter-branding";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The stored accent seed, read the way `spec/behavior/branding.md` § Accent
 * Color orders it: `branding.colors.accent` is authoritative and
 * `accent_color` its mirror.
 */
export function storedAccentOf(
  chapter:
    | { accent_color?: string | null; branding?: Record<string, unknown> }
    | undefined,
): string {
  const colors = chapter?.branding?.colors;
  const fromBranding =
    colors && typeof colors === "object"
      ? (colors as Record<string, unknown>).accent
      : undefined;
  return normalizeAccentInput(
    typeof fromBranding === "string" ? fromBranding : chapter?.accent_color,
  );
}

/**
 * Settings → Chapter accent, on the phone. Before this sheet the row was a
 * swatch over "edited on the web dashboard", so an officer who set the wrong
 * color during onboarding could not fix it from the app.
 *
 * The accent saves on its own (#6033): a swatch the moment it is tapped, a
 * typed hex when the field is left, with a quiet "Saved" under it; the sheet
 * stays open, and Done closes it.
 *
 * Saves through `PATCH /v1/chapters/current`, the call web's Accent tab makes,
 * which recomputes the chapter's palette server-side; the current-chapter
 * refetch then repaints the whole app in the new accent. The row opens this
 * sheet only for a member who holds `CHAPTER_PROFILE_PERMISSIONS`, the route's
 * own guard.
 */
export const AccentSheet = forwardRef<BottomSheetModal>(function AccentSheet(
  _props,
  ref,
) {
  const closeSheet = useSheetClose(ref);
  const backgroundStyle = useSheetBackgroundStyle();
  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      enableDynamicSizing
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
    >
      <SheetBackToClose onClose={closeSheet} />
      <AccentSheetBody onDone={closeSheet} />
    </BottomSheetModal>
  );
});

function AccentSheetBody({ onDone }: { onDone: () => void }) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const chapter = useCurrentChapter();

  // The picker starts from the stored accent, so it waits for it: starting
  // from the house default while the read is in flight would show a color
  // the chapter doesn't have.
  if (!chapter.data) {
    return (
      <BottomSheetView
        style={styles.body}
        onAccessibilityEscape={onDone}
      >
        <SheetHeader title="Chapter accent" onCancel={onDone} cancelLabel="Done" />
        {chapter.isError ? (
          <Text style={styles.error}>
            Couldn&apos;t load the chapter. Check your connection and try again.
          </Text>
        ) : (
          <ActivityIndicator color={tokens.color.text.muted} />
        )}
      </BottomSheetView>
    );
  }
  return (
    <AccentSheetForm chapter={chapter.data} onDone={onDone} />
  );
}

function AccentSheetForm({
  chapter,
  onDone,
}: {
  chapter: NonNullable<ReturnType<typeof useCurrentChapter>["data"]>;
  onDone: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const updateChapter = useUpdateChapter();
  const { accent } = useChapterBranding();

  const stored = storedAccentOf(chapter);
  // The modal mounts this form on every present, so the draft starts from
  // whatever is stored at that moment.
  const [draft, setDraft] = useState(stored);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(hex: string) {
    if (hex.toUpperCase() === stored.toUpperCase()) return;
    setError(null);
    setSaved(false);
    try {
      await updateChapter.mutateAsync({ accent_color: hex });
      setSaved(true);
    } catch (caught) {
      setError(
        errorCopy(caught, "Couldn't save the accent. Try again in a moment."),
      );
    }
  }

  return (
    <BottomSheetView
      style={styles.body}
      onAccessibilityEscape={onDone}
    >
      <SheetHeader title="Chapter accent" onCancel={onDone} cancelLabel="Done" />
      {/* The one line the picker can't show: Settings is otherwise a screen
          of personal preferences, and this save repaints every member's app. */}
      <Text style={styles.helper}>
        Changes the color for everyone in the chapter.
      </Text>
      <AccentPicker
        label="Chapter accent"
        value={draft}
        onChange={(hex) => {
          setSaved(false);
          setDraft(hex);
        }}
        onCommit={(hex) => void save(hex)}
        // Keyed by the chapter's name, which is its organization's name when
        // it was created from the directory. A chapter renamed since gets the
        // presets only (#3372).
        orgColors={orgColorsFor(chapter.name)}
        disabled={updateChapter.isPending}
        inputComponent={BottomSheetTextInput}
        focusColor={accent}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : saved ? (
        <Text accessibilityLiveRegion="polite" style={styles.helper}>
          Saved
        </Text>
      ) : null}
    </BottomSheetView>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.md,
    },
    helper: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
  });
}
