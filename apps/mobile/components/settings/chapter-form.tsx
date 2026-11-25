import { useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import { errorCopy } from "@repo/hooks/error-copy";
import { FormTextInput } from "@/components/form-text-input";
import { sheetFieldStyles } from "@/components/sheet-scaffold";
import { TaskBarPill } from "@/components/tasks/task-action-bar";
import { useChapterBranding } from "@/lib/chapter-branding";
import { MONO_FONT_FAMILY, typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The pieces Chapter settings' forms share on the phone (#6027): the profile
 * on top of Chapter settings, and the Chapter mark, Identity & founding and
 * Vocabulary pages its rows push. Web's forms are `Label` over `Input` with a
 * Save button under them (`settings-org-tab.tsx`); these are the same parts
 * in the phone's controls: the sheet field (`sheetFieldStyles`), and the
 * commit pill the task screen's bar draws (`TaskBarPill`), sized to its
 * label rather than stretched across the page (rulebook § 7).
 */

/** A labelled text field. Read-only, its text muted, for a viewer who can't save it. */
export function ChapterTextField({
  label,
  value,
  onChangeText,
  editable,
  placeholder,
  maxLength,
  keyboardType,
  autoCapitalize,
  mono = false,
  error,
  onBlur,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  placeholder?: string;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  /** Set in the mono face, as web's Greek letters field is. */
  mono?: boolean;
  /** Shown under the field in the destructive hue once it applies. */
  error?: string | null;
  onBlur?: () => void;
  testID?: string;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.ring, focused ? styles.ringActive : null]}>
        <FormTextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={tokens.color.text.muted}
          maxLength={maxLength}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[
            styles.field,
            mono ? styles.mono : null,
            focused ? styles.fieldFocused : null,
            editable ? null : styles.fieldReadOnly,
          ]}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** What a form's last save came to, for {@link FormStatusLine}. */
export type FormSaveStatus =
  { kind: "idle" } | { kind: "saved" } | { kind: "failed"; message: string };

/**
 * A form's save status: "Saved" once a save lands, the reason once one
 * fails, and nothing again as soon as the officer edits. The phone has no
 * toast, so the outcome is a line beside the button (navigation.md §
 * Chapter settings).
 */
export function useFormSaveStatus() {
  const [status, setStatus] = useState<FormSaveStatus>({ kind: "idle" });
  return {
    status,
    saved: () => setStatus({ kind: "saved" }),
    failed: (error: unknown, fallback: string) =>
      setStatus({ kind: "failed", message: errorCopy(error, fallback) }),
    clear: () =>
      setStatus((prev) => (prev.kind === "idle" ? prev : { kind: "idle" })),
  };
}

/**
 * A form's commit row: the status (or the line saying the role can't save
 * here) on the left, the labelled pill on the right, as web's forms end in
 * the hint and the button. A viewer who can't save gets the line alone.
 */
export function FormCommitRow({
  label,
  onPress,
  disabled,
  busy,
  status,
  readOnlyLine,
  canSave,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
  status: FormSaveStatus;
  /** Why the viewer can't save, in place of the pill. */
  readOnlyLine: string;
  canSave: boolean;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  let line: ReactNode = null;
  if (!canSave) {
    line = <Text style={styles.status}>{readOnlyLine}</Text>;
  } else if (status.kind === "saved") {
    line = (
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        Saved
      </Text>
    );
  } else if (status.kind === "failed") {
    line = (
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.status, styles.statusFailed]}
      >
        {status.message}
      </Text>
    );
  }
  return (
    <View style={styles.commitRow}>
      <View style={styles.commitLine}>{line}</View>
      {canSave ? (
        <TaskBarPill
          label={label}
          fill={accent}
          ink={tokens.color.gold.onHouse}
          disabled={disabled}
          busy={busy}
          onPress={onPress}
        />
      ) : null}
    </View>
  );
}

/** A muted line under a group, for a page's hint (web's section hint). */
export function FormHint({ children }: { children: ReactNode }) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  return <Text style={styles.hint}>{children}</Text>;
}

/** A column of fields at the form rhythm: 16 between fields. */
export function FormFields({ children }: { children: ReactNode }) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  return <View style={styles.fields}>{children}</View>;
}

function createStyles(tokens: SignetTokens, accent: string) {
  const fieldStyles = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    // foundations §9's rhythm: 8 between a label and its field, 16 between
    // fields.
    fields: {
      gap: tokens.spacing.lg,
    },
    fieldGroup: {
      gap: tokens.spacing.sm,
    },
    label: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    ring: fieldStyles.ring,
    ringActive: fieldStyles.ringActive,
    field: fieldStyles.field,
    fieldFocused: fieldStyles.fieldFocused,
    fieldReadOnly: {
      color: tokens.color.text.mutedForeground,
    },
    mono: {
      fontFamily: MONO_FONT_FAMILY,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
    },
    commitRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    commitLine: {
      flex: 1,
    },
    status: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    statusFailed: {
      color: tokens.color.semantic.destructiveText,
    },
    hint: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
