import { useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import { FormTextInput } from "@/components/form-text-input";
import { sheetFieldStyles } from "@/components/sheet-scaffold";
import { useChapterBranding } from "@/lib/chapter-branding";
import { MONO_FONT_FAMILY, typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The pieces Chapter settings' pages share on the phone (#6027): the labelled
 * field (`sheetFieldStyles`) that `SavedTextField` saves on its own (#6033),
 * as web's `SettingsTextField` does, and the hint line under a group. Every
 * page saves on its own (#6033), so none ends in a Save button.
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
    hint: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
