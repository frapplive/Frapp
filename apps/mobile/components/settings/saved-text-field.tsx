import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
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
 * `validate` refuses text the setting can't take (a founded year out of
 * range): its words show under the field and nothing is sent. `onSave` may
 * resolve the words of a failure instead of `false`, shown under the field
 * until the officer edits it.
 *
 * A tier's name (#4074), a pledge class's, a member field's name and its
 * longest answer (#6029); the Chapter tab's fields (#6033).
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
  autoCapitalize,
  mono,
  validate,
  testID,
  allowBlank = false,
}: {
  label: string;
  value: string;
  editable: boolean;
  /** Said under the field: a save that failed, or text the setting refuses. */
  failure?: string | null;
  /**
   * Resolves true once saved; false, or the words of the failure, keeps the
   * typed text for another try.
   */
  onSave: (next: string) => Promise<boolean | string>;
  maxLength?: number;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  mono?: boolean;
  /** What's wrong with the trimmed text, or `null` when it can be saved. */
  validate?: (next: string) => string | null;
  testID?: string;
  allowBlank?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  // What the officer is typing, or `null` while the field shows the saved text.
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const committing = useRef(false);
  const latest = useRef({ draft, value, onSave, allowBlank, validate });
  useEffect(() => {
    latest.current = { draft, value, onSave, allowBlank, validate };
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
        validate: check,
      } = latest.current;
      const next = left?.trim();
      if (next === undefined || committing.current) return;
      if (check?.(next)) return;
      if ((next || blankOk) && next !== stored) void save(next);
    },
    [],
  );

  async function commit() {
    if (draft === null || committing.current) return;
    const next = draft.trim();
    if ((!next && !allowBlank) || next === value) {
      setDraft(null);
      setProblem(null);
      return;
    }
    const refused = validate?.(next) ?? null;
    setProblem(refused);
    if (refused) return;
    // Held until saved, so the field doesn't flick back to the old text; a
    // failed save keeps it for another try.
    committing.current = true;
    const result = await onSave(next);
    committing.current = false;
    if (result === true) {
      setDraft(null);
      setSaved(true);
    } else if (typeof result === "string") {
      setProblem(result);
    }
  }

  const shownFailure = problem ?? failure ?? null;

  return (
    <FormFields>
      <View>
        <ChapterTextField
          label={label}
          value={draft ?? value}
          onChangeText={(text) => {
            setSaved(false);
            setProblem(null);
            setDraft(text);
          }}
          onBlur={() => void commit()}
          editable={editable}
          maxLength={maxLength}
          placeholder={placeholder}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          mono={mono}
          testID={testID}
          error={shownFailure}
        />
        {saved && !shownFailure ? (
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
