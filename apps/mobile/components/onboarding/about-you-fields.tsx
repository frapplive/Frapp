import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BIRTHDAY_COPY,
  MAJOR_MAX_LENGTH,
  majorSuggestions,
  parseBirthdayVisibility,
  PHONE_MAX_LENGTH,
  PROFILE_FIELD_COPY,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ListRow, ListSection } from "@/components/list-section";
import {
  OnboardingFieldLabel,
  OnboardingTextInput,
} from "@/components/onboarding/onboarding-field";
import { Toggle } from "@/components/toggle";
import type { ProfileDraft, ProfileDraftField } from "@/lib/more/edit-profile";
import { typeRole, useFrappTheme } from "@/lib/theme";

const copy = PROFILE_FIELD_COPY;

/** The graduation year's width beside Major, as on the Edit sheet. */
const YEAR_FIELD_WIDTH = 96;

/**
 * s03's About you fields (#5284): Phone, Major with Grad year, and Birthday
 * with the switch that shares it, in the Edit sheet's order, labels and
 * limits (`edit-profile-sheet.tsx`). The rules are the sheet's too
 * (`aboutYouPatch` in `lib/more/edit-profile.ts`); this only draws the draft
 * the host holds and the refusal it says to show.
 *
 * Onboarding's own field (`OnboardingTextInput`), not the sheet's
 * `BottomSheetTextInput`, which works only inside a sheet; the switch is
 * house gold, since nothing in `(auth)` has a chapter accent yet.
 */
export function AboutYouFields({
  draft,
  onEdit,
  onLeave,
  refusal,
  majors,
  editable,
}: {
  draft: ProfileDraft;
  onEdit: (field: ProfileDraftField, value: string) => void;
  /** The member left a field: its refusal, if any, shows from now on. */
  onLeave: (field: ProfileDraftField) => void;
  refusal: { field: ProfileDraftField; message: string } | null;
  /** The chapter's majors, offered under Major while it has focus (#5778). */
  majors: string[];
  editable: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const [focused, setFocused] = useState<ProfileDraftField | null>(null);
  const visibility = parseBirthdayVisibility(draft.birthdayVisibility);
  const birthdayTyped =
    draft.birthdayMonth.trim() !== "" && draft.birthdayDay.trim() !== "";
  // At most four, so the list under Major stays above the keyboard.
  const majorOptions = majorSuggestions(majors, draft.major, 4);

  const input = (
    name: ProfileDraftField,
    options: {
      label: string;
      placeholder: string;
      keyboardType?: "number-pad" | "phone-pad";
      textContentType?: "telephoneNumber";
      autoCapitalize?: "words";
      maxLength: number;
    },
  ) => (
    <OnboardingTextInput
      value={draft[name]}
      onChangeText={(value) => onEdit(name, value)}
      onFocus={() => setFocused(name)}
      onBlur={() => {
        setFocused((current) => (current === name ? null : current));
        onLeave(name);
      }}
      editable={editable}
      placeholder={options.placeholder}
      accessibilityLabel={options.label}
      keyboardType={options.keyboardType}
      textContentType={options.textContentType}
      autoCapitalize={options.autoCapitalize ?? "none"}
      autoCorrect={false}
      maxLength={options.maxLength}
      style={refusal?.field === name ? styles.invalid : null}
    />
  );

  const rowRefusal = (fields: ProfileDraftField[]) =>
    refusal !== null && fields.includes(refusal.field) ? (
      <Text accessibilityRole="alert" style={styles.error}>
        {refusal.message}
      </Text>
    ) : null;

  return (
    <View style={styles.fields}>
      <View style={styles.group}>
        <OnboardingFieldLabel>{copy.phone.label}</OnboardingFieldLabel>
        {input("phone", {
          label: copy.phone.label,
          placeholder: copy.phone.placeholder,
          keyboardType: "phone-pad",
          textContentType: "telephoneNumber",
          maxLength: PHONE_MAX_LENGTH,
        })}
        {rowRefusal(["phone"]) ?? (
          <Text style={styles.hint}>{copy.phone.hint}</Text>
        )}
      </View>

      <View style={styles.group}>
        <View style={styles.row}>
          <View style={[styles.group, styles.grow]}>
            <OnboardingFieldLabel>{copy.major.label}</OnboardingFieldLabel>
            {input("major", {
              label: copy.major.label,
              placeholder: copy.major.placeholder,
              autoCapitalize: "words",
              maxLength: MAJOR_MAX_LENGTH,
            })}
          </View>
          <View style={[styles.group, styles.year]}>
            <OnboardingFieldLabel>
              {copy.graduationYear.label}
            </OnboardingFieldLabel>
            {input("graduationYear", {
              label: copy.graduationYear.accessibleLabel,
              placeholder: copy.graduationYear.placeholder,
              keyboardType: "number-pad",
              maxLength: 4,
            })}
          </View>
        </View>
        {rowRefusal(["major", "graduationYear"])}
        {/* The chapter's majors matching what is typed (#5778), as on the
            Edit sheet: a tap takes the chapter's spelling. */}
        {focused === "major" && majorOptions.length > 0 ? (
          <View
            accessibilityRole="list"
            accessibilityLabel={copy.major.suggestionsLabel}
          >
            <ListSection>
              {majorOptions.map((major) => (
                <ListRow
                  key={major}
                  label={major}
                  action
                  onPress={() => onEdit("major", major)}
                />
              ))}
            </ListSection>
          </View>
        ) : null}
      </View>

      <View style={styles.group}>
        <OnboardingFieldLabel>{BIRTHDAY_COPY.label}</OnboardingFieldLabel>
        <View style={styles.row}>
          <View style={styles.grow}>
            {input("birthdayMonth", {
              label: "Birthday month, 1 to 12",
              placeholder: "MM",
              keyboardType: "number-pad",
              maxLength: 2,
            })}
          </View>
          <View style={styles.grow}>
            {input("birthdayDay", {
              label: "Birthday day",
              placeholder: "DD",
              keyboardType: "number-pad",
              maxLength: 2,
            })}
          </View>
          <View style={styles.grow}>
            {input("birthdayYear", {
              label: "Birth year, optional",
              placeholder: "YYYY",
              keyboardType: "number-pad",
              maxLength: 4,
            })}
          </View>
        </View>
        {rowRefusal(["birthdayMonth", "birthdayDay", "birthdayYear"]) ?? (
          <Text style={styles.hint}>{BIRTHDAY_COPY.yearHint}</Text>
        )}
        {/* Who sees it (#5282): drawn once a month and day are typed, since
            it governs nothing without them. */}
        {birthdayTyped ? (
          <View style={styles.shareRow}>
            <View style={styles.shareText}>
              <Text style={styles.shareLabel}>
                {BIRTHDAY_COPY.visibilityLabel}
              </Text>
              <Text style={styles.hint}>
                {BIRTHDAY_COPY.visibilityHint[visibility]}
              </Text>
            </View>
            <Toggle
              house
              value={visibility === "chapter"}
              onValueChange={(on) =>
                onEdit("birthdayVisibility", on ? "chapter" : "nobody")
              }
              accessibilityLabel={BIRTHDAY_COPY.visibilityLabel}
              disabled={!editable}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    // 16 between fields, 8 between a label and its field (foundations §9).
    fields: {
      marginTop: tokens.spacing.xl,
      gap: tokens.spacing.lg,
    },
    group: {
      gap: tokens.spacing.sm,
    },
    row: {
      flexDirection: "row",
      gap: tokens.spacing.md,
    },
    grow: {
      flex: 1,
    },
    year: {
      width: YEAR_FIELD_WIDTH,
    },
    invalid: {
      borderColor: tokens.color.semantic.destructive,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    hint: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    shareRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      marginTop: tokens.spacing.xs,
    },
    shareText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    shareLabel: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
  });
}
