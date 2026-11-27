import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { type OwnCustomField } from "@repo/hooks";
import { formatCustomFieldValue } from "@repo/formatting";
import { SignetTokens } from "@repo/theme/signet";
import {
  CUSTOM_FIELD_AUDIENCE_LINE,
  ONBOARDING_ABOUT_COPY,
  OWN_CUSTOM_FIELDS_COPY,
} from "@repo/validation";
import { DisclosureGlyph, ForwardGlyph } from "@/components/control-glyphs";
import { ListRow, ListSection } from "@/components/list-section";
import {
  OnboardingFieldLabel,
  OnboardingTextInput,
} from "@/components/onboarding/onboarding-field";
import { OnboardingPressable } from "@/components/onboarding/onboarding-pressable";
import { OptionSheet } from "@/components/option-sheet";
import { sheetFieldStyles } from "@/components/sheet-scaffold";
import { Toggle } from "@/components/toggle";
import {
  ownCustomFieldControl,
  ownCustomFieldInputProps,
  ownCustomFieldOptions,
} from "@/lib/more/own-custom-fields";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * s03's About you, the chapter's own fields (#5926): under the basics, every
 * one behind a collapsed See more (Shawn's pick, 2026-11-24) that opens and
 * closes in place. Web's About you draws the same fields in the same order
 * and words.
 *
 * Each field takes the You tab's More details controls for its type (#581,
 * `lib/more/own-custom-fields.ts`): a pick opens the option sheet with its
 * choices (and Not set unless required and set), yes or no is a switch, and
 * the rest is typed with the keyboard for its type. Under each, who else sees
 * it, or the refusal. Unlike the You tab, nothing saves here on a pick or a
 * flip: the host holds the draft and sends what changed on Continue, so Skip
 * for now saves nothing.
 */
export function AboutYouCustomFields({
  fields,
  open,
  onToggle,
  draft,
  problems,
  onEdit,
  onLeave,
  editable,
}: {
  fields: readonly OwnCustomField[];
  /** Whether See more is open. */
  open: boolean;
  onToggle: () => void;
  /** What each field shows, by field id. */
  draft: Readonly<Record<string, string>>;
  /** A refused field's reason, by field id. */
  problems: Readonly<Record<string, string>>;
  onEdit: (field: OwnCustomField, value: string) => void;
  /** The member left a typed field (a phone tidies then). */
  onLeave: (field: OwnCustomField) => void;
  editable: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const pickRef = useRef<BottomSheetModal>(null);
  const [picking, setPicking] = useState<OwnCustomField | null>(null);

  const line = (field: OwnCustomField) => {
    const problem = problems[field.field_id];
    return problem ? (
      <Text accessibilityRole="alert" style={styles.error}>
        {problem}
      </Text>
    ) : (
      <Text style={styles.hint}>
        {CUSTOM_FIELD_AUDIENCE_LINE[field.visibility]}
      </Text>
    );
  };

  const control = (field: OwnCustomField) => {
    const value = draft[field.field_id] ?? "";
    const invalid = !!problems[field.field_id];
    const kind = ownCustomFieldControl(field.type);
    if (kind === "switch") {
      // Label, who sees it, and the switch at the row's end, like the
      // birthday's share switch above.
      return (
        <View key={field.field_id} style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchLabel}>{field.label}</Text>
            {line(field)}
          </View>
          <Toggle
            house
            value={value === "true"}
            onValueChange={(on) => onEdit(field, on ? "true" : "false")}
            accessibilityLabel={field.label}
            disabled={!editable}
          />
        </View>
      );
    }
    if (kind === "pick") {
      const shown = formatCustomFieldValue(field.type, value || null);
      return (
        <View key={field.field_id} style={styles.group}>
          <OnboardingFieldLabel>{field.label}</OnboardingFieldLabel>
          <OnboardingPressable
            accessibilityRole="button"
            accessibilityLabel={field.label}
            accessibilityValue={{
              text: shown ?? OWN_CUSTOM_FIELDS_COPY.notSet,
            }}
            accessibilityHint="Opens a list to pick from"
            disabled={!editable}
            onPress={() => {
              setPicking(field);
              pickRef.current?.present();
            }}
            style={[styles.field, styles.pick, invalid ? styles.invalid : null]}
          >
            <Text style={shown ? styles.pickValue : styles.pickPlaceholder}>
              {shown ?? OWN_CUSTOM_FIELDS_COPY.notSet}
            </Text>
            <ForwardGlyph color={tokens.color.text.mutedForeground} />
          </OnboardingPressable>
          {line(field)}
        </View>
      );
    }
    return (
      <View key={field.field_id} style={styles.group}>
        <OnboardingFieldLabel>{field.label}</OnboardingFieldLabel>
        <OnboardingTextInput
          value={value}
          onChangeText={(next) => onEdit(field, next)}
          onBlur={() => onLeave(field)}
          editable={editable}
          accessibilityLabel={field.label}
          {...ownCustomFieldInputProps(field)}
          autoCapitalize={field.type === "text" ? "sentences" : "none"}
          style={invalid ? styles.invalid : null}
        />
        {line(field)}
      </View>
    );
  };

  if (fields.length === 0) return null;

  return (
    <View style={styles.fields}>
      {/* Opens and closes in place; what was typed stays either way. */}
      <ListSection>
        <ListRow
          label={ONBOARDING_ABOUT_COPY.seeMore}
          action
          trailing={
            <DisclosureGlyph
              color={tokens.color.text.mutedForeground}
              direction={open ? "down" : "right"}
            />
          }
          accessibilityHint={open ? "Hides the fields" : "Shows more fields"}
          disabled={!editable}
          onPress={onToggle}
        />
      </ListSection>
      {open ? fields.map(control) : null}
      <OptionSheet
        ref={pickRef}
        title={picking?.label ?? OWN_CUSTOM_FIELDS_COPY.title}
        options={picking ? ownCustomFieldOptions(picking) : []}
        selected={picking ? draft[picking.field_id] || null : null}
        onSelect={(value) => {
          if (picking) onEdit(picking, value ?? "");
        }}
      />
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  const fieldStyles = sheetFieldStyles(tokens, tokens.color.gold.askText);
  return StyleSheet.create({
    // 16 between fields, 8 between a label and its field (foundations §9),
    // as `AboutYouFields` above.
    fields: {
      marginTop: tokens.spacing.lg,
      gap: tokens.spacing.lg,
    },
    group: {
      gap: tokens.spacing.sm,
    },
    field: fieldStyles.field,
    pick: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    pickValue: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    pickPlaceholder: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.muted,
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
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    switchText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    switchLabel: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
  });
}
