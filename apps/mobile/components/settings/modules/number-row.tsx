import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorCopy } from "@repo/hooks/error-copy";
import { readBoundedNumber } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { CloseGlyph } from "@/components/control-glyphs";
import { FormTextInput } from "@/components/form-text-input";
import { IconButton } from "@/components/icon-button";
import { ListRow } from "@/components/list-section";
import { useChapterBranding } from "@/lib/chapter-branding";
import { fieldTypeRole, typeRole, useFrappTheme } from "@/lib/theme";

/**
 * A number typed into a settings row on the phone (#6030): the label, its
 * line, and a small field with its unit at the trailing edge, as web's
 * `NumberRule` and Recruitment's day rows draw it. It saves on its own
 * (rulebook § 9): when the field is left or Done is pressed, with a quiet
 * "Saved" in the row's line. A number out of range says so in that line and
 * isn't sent, and a refused save puts the stored number back with the reason.
 * Checked on leaving the field, never per keystroke (Paul, 2026-11-06), by
 * `readBoundedNumber`, which web's rows read too.
 *
 * Read-only (`editable` false) it shows the stored number, muted, and the
 * row's line is the caller's (usually the role's).
 */
export function NumberRow({
  label,
  hint,
  suffix,
  value,
  min,
  max,
  allowEmpty = false,
  outOfRange,
  editable,
  onSave,
  onRemove,
}: {
  label: string;
  /** The row's line while nothing is saving or wrong. */
  hint?: string | null;
  suffix: string;
  /** The stored number; `null` for none (a goal left empty). */
  value: number | null;
  min: number;
  max: number;
  /** Empty is a value of its own (no goal), sent as `null`. */
  allowEmpty?: boolean;
  /** The line for a number outside `min`..`max`, where the row words its own. */
  outOfRange?: string;
  editable: boolean;
  /** Rejects with the server's refusal; the row says it and puts the number back. */
  onSave: (next: number | null) => Promise<unknown>;
  /**
   * A role's own goal can be taken off (web's ✕ on the row): a small close
   * control after the unit. A refusal is said in the row's line.
   */
  onRemove?: { label: string; run: () => Promise<unknown> };
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const stored = value === null ? "" : String(value);
  const [text, setText] = useState(stored);
  const [focused, setFocused] = useState(false);
  const [line, setLine] = useState<
    { kind: "saved" } | { kind: "error"; message: string } | null
  >(null);
  // A number saved elsewhere (another officer, web) replaces what the field
  // shows, unless the officer is typing in it; set during render, React's
  // pattern for state that follows a prop.
  const [shownFor, setShownFor] = useState(stored);
  if (shownFor !== stored && !focused) {
    setShownFor(stored);
    setText(stored);
  }

  function commit() {
    const trimmed = text.trim();
    if (trimmed === stored) return;
    let next: number | null;
    if (trimmed === "" && allowEmpty) {
      next = null;
    } else {
      const read = readBoundedNumber(trimmed, min, max);
      if ("error" in read) {
        setLine({ kind: "error", message: outOfRange ?? read.error });
        return;
      }
      next = read.value;
    }
    setLine(null);
    setShownFor(next === null ? "" : String(next));
    onSave(next).then(
      () => setLine({ kind: "saved" }),
      (error: unknown) => {
        setText(stored);
        setShownFor(stored);
        setLine({
          kind: "error",
          message: errorCopy(error, "It wasn't saved. Try again."),
        });
      },
    );
  }

  return (
    <ListRow
      label={label}
      description={
        line?.kind === "error"
          ? line.message
          : line?.kind === "saved"
            ? "Saved"
            : hint
      }
      descriptionTone={line?.kind === "error" ? "destructive" : "default"}
      trailing={
        <View style={styles.trailing}>
          <FormTextInput
            accessibilityLabel={`${label}, ${suffix}`}
            value={text}
            editable={editable}
            onChangeText={(next) => {
              if (!/^\d*$/.test(next)) return;
              setText(next);
              setLine(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={String(max).length}
            placeholder={allowEmpty ? "None" : undefined}
            placeholderTextColor={tokens.color.text.muted}
            style={[
              styles.field,
              focused ? styles.fieldFocused : null,
              editable ? null : styles.fieldReadOnly,
            ]}
          />
          <Text style={styles.suffix}>{suffix}</Text>
          {onRemove ? (
            <IconButton
              label={onRemove.label}
              onPress={() => {
                setLine(null);
                onRemove.run().catch((error: unknown) =>
                  setLine({
                    kind: "error",
                    message: errorCopy(error, "It wasn't removed. Try again."),
                  }),
                );
              }}
            >
              <CloseGlyph color={tokens.color.text.mutedForeground} size={18} />
            </IconButton>
          ) : null}
        </View>
      }
    />
  );
}

function createStyles(tokens: SignetTokens, accent: string) {
  return StyleSheet.create({
    trailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    field: {
      ...fieldTypeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
      minWidth: tokens.touch.minimum + tokens.spacing.lg,
      height: tokens.touch.minimum - tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.sm,
      borderRadius: tokens.radius.control,
      borderWidth: 1,
      borderColor: tokens.color.border.input,
      backgroundColor: tokens.color.surface.background,
      textAlign: "center",
    },
    fieldFocused: { borderColor: accent },
    fieldReadOnly: {
      color: tokens.color.text.muted,
      backgroundColor: "transparent",
    },
    suffix: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
  });
}
