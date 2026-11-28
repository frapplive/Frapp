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
  dropKeptDraft,
  readKeptDraft,
  useKeptDraftKeys,
  writeKeptDraft,
} from "@repo/hooks/kept-drafts";
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
 * With `draftKey`, an edit left on the way out that doesn't land (the save
 * fails, offline included, or `validate` refuses it) is kept, by member,
 * chapter and field (`@repo/hooks/kept-drafts`, rulebook § 4), and comes
 * back with its reason when the page opens again, as long as the saved
 * value hasn't changed since; leaving the field then saves it.
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
  draftKey,
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
  /** Names the field, to keep an edit that didn't land on the way out. */
  draftKey?: string;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const keys = useKeptDraftKeys();
  const keptKey = draftKey ? keys.draft(`setting:${draftKey}`) : null;
  // An edit kept from a visit whose save didn't land, over the value it was
  // made against; one made over a value changed since is let go.
  const [kept] = useState(() => {
    if (!keptKey) return undefined;
    const left = readKeptDraft<KeptSetting>(keptKey);
    if (!left) return undefined;
    dropKeptDraft(keptKey);
    return left.over === value ? left : undefined;
  });
  // What the officer is typing, or `null` while the field shows the saved text.
  const [draft, setDraft] = useState<string | null>(kept?.text ?? null);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(kept?.reason ?? null);
  const committing = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ draft, value, onSave, allowBlank, validate });
  useEffect(() => {
    latest.current = { draft, value, onSave, allowBlank, validate };
  });
  const keep = (text: string, over: string, reason: string) => {
    if (keptKey) writeKeptDraft(keptKey, { text, over, reason });
  };
  // Leaving the screen with the field still focused may unmount it before
  // it blurs: save what was typed then too. One that doesn't land is kept
  // (with `draftKey`), so Back never drops an edit.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const {
        draft: left,
        value: stored,
        onSave: save,
        allowBlank: blankOk,
        validate: check,
      } = latest.current;
      const next = left?.trim();
      if (next === undefined || committing.current) return;
      if ((!next && !blankOk) || next === stored) return;
      const refused = check?.(next);
      if (refused) {
        keep(next, stored, refused);
        return;
      }
      void save(next).then((result) => {
        if (result !== true) {
          keep(next, stored, typeof result === "string" ? result : NOT_SAVED);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on unmount with the latest values
  }, []);

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
    if (!mounted.current) {
      // Left while that save was out: one that failed is kept, as above.
      if (result !== true) {
        keep(next, value, typeof result === "string" ? result : NOT_SAVED);
      }
      return;
    }
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

/** An edit kept from a visit whose save didn't land. */
type KeptSetting = { text: string; over: string; reason: string };

const NOT_SAVED = "That didn't save. Try again.";

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
