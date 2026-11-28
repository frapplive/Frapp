import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type KeyboardTypeOptions } from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import {
  ChapterTextField,
  FormFields,
} from "@/components/settings/chapter-form";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * A text setting that saves on its own (rulebook § 9, "Settings save on their
 * own"): on Done or leaving the field, with a quiet "Saved" once it lands, as
 * web's `SettingsNameField`. A blank entry puts the saved text back unless
 * `allowBlank` (a longest answer cleared to "no limit"), and a change made
 * elsewhere replaces what it shows while it isn't being edited.
 *
 * A tier's name (#4074), a pledge class's, a member field's name and its
 * longest answer (#6029).
 */
export function SavedTextField({
  label,
  value,
  editable,
  failure,
  onSave,
  maxLength,
  placeholder,
  keyboardType,
  allowBlank = false,
}: {
  label: string;
  value: string;
  editable: boolean;
  /** Said under the field: a save that failed, or text the setting refuses. */
  failure: string | null;
  /** Resolves true once saved; false keeps the typed text for another try. */
  onSave: (next: string) => Promise<boolean>;
  maxLength?: number;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  allowBlank?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  // What the officer is typing, or `null` while the field shows the saved text.
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const committing = useRef(false);
  const latest = useRef({ draft, value, onSave, allowBlank });
  useEffect(() => {
    latest.current = { draft, value, onSave, allowBlank };
  });
  // Leaving the screen with the field still focused may unmount it before
  // it blurs: save what was typed then too, so Back never drops an edit.
  useEffect(
    () => () => {
      const {
        draft: left,
        value: stored,
        onSave: save,
        allowBlank: blankOk,
      } = latest.current;
      const next = left?.trim();
      if (next === undefined || committing.current) return;
      if ((next || blankOk) && next !== stored) void save(next);
    },
    [],
  );

  async function commit() {
    if (draft === null || committing.current) return;
    const next = draft.trim();
    if ((!next && !allowBlank) || next === value) {
      setDraft(null);
      return;
    }
    // Held until saved, so the field doesn't flick back to the old text; a
    // failed save keeps it for another try.
    committing.current = true;
    const ok = await onSave(next);
    committing.current = false;
    if (ok) {
      setDraft(null);
      setSaved(true);
    }
  }

  return (
    <FormFields>
      <View>
        <ChapterTextField
          label={label}
          value={draft ?? value}
          onChangeText={(text) => {
            setSaved(false);
            setDraft(text);
          }}
          onBlur={() => void commit()}
          editable={editable}
          maxLength={maxLength}
          placeholder={placeholder}
          keyboardType={keyboardType}
          error={failure}
        />
        {saved && !failure ? (
          <Text accessibilityLiveRegion="polite" style={styles.saved}>
            Saved
          </Text>
        ) : null}
      </View>
    </FormFields>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    saved: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.xs,
      paddingTop: tokens.spacing.xs,
    },
  });
}
