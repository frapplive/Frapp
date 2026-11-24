import { forwardRef, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import {
  type OwnCustomField,
  ownCustomFieldFormChanges,
  ownCustomFieldShownValue,
  ownCustomFieldTidied,
  useOwnCustomFields,
  usePermissionList,
  useUpdateOwnCustomFields,
  withoutField,
} from "@repo/hooks";
import { SignetTokens } from "@repo/theme/signet";
import {
  can,
  CUSTOM_FIELD_AUDIENCE_LINE,
  OWN_CUSTOM_FIELDS_COPY as COPY,
} from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { OptionSheet } from "@/components/option-sheet";
import { Toggle } from "@/components/toggle";
import {
  SHEET_STACK_BEHAVIOR,
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetScrim,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
} from "@/components/sheet-scaffold";
import { useChapterBranding } from "@/lib/chapter-branding";
import {
  ownCustomFieldInputProps,
  ownCustomFieldOptions,
  ownCustomFieldRows,
} from "@/lib/more/own-custom-fields";
import { BottomSheetScrollView } from "@/lib/sheet-scrollables";
import { typeRole, useFrappTheme } from "@/lib/theme";

const SAVE_FAILED = "That didn't save. Try again.";

/** A refused save's message from the API, or the plain fallback. */
function refusal(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : SAVE_FAILED;
}

/**
 * "More details" on the You tab (#581): the fields the chapter keeps on a
 * member (T-shirt size, allergies, an emergency contact), every one, even
 * those only officers or the president read, since they are the member's
 * own. Each row says who else sees it. Under Details, where the member's own
 * facts already sit, as on web `/profile` the section follows Directory
 * profile.
 *
 * Tap what you want to change, like the rows above (#3711): a pick opens the
 * pick sheet and saves on the pick; yes or no is a switch in the row and saves
 * on the flip (Slack's and iOS Settings' rows); anything typed opens a
 * one-field sheet with the keyboard for its type. Slack's custom profile
 * fields and Discord's server profile edit theirs the same way, one field at
 * a time.
 *
 * Nothing draws for a chapter with no fields, or for a viewer outside the
 * directory (`members:view`, the route's gate); like Details, nothing draws
 * until the read answers.
 */
export function OwnCustomFieldsSection() {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const canViewMembers = can("members:view", usePermissionList());
  const query = useOwnCustomFields({ enabled: canViewMembers });
  const update = useUpdateOwnCustomFields();
  const fields = query.data;
  const rows = useMemo(() => ownCustomFieldRows(fields), [fields]);
  const pickRef = useRef<BottomSheetModal>(null);
  const typeRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<OwnCustomField | null>(null);
  // A row whose pick or switch didn't save says so under its label.
  const [failed, setFailed] = useState<Record<string, string>>({});

  if (!canViewMembers) return null;
  if (query.isError && !fields) {
    return (
      <>
        <SectionHeader>{COPY.title}</SectionHeader>
        <ListSection>
          <ListRow
            label="Couldn't load your details"
            description="Tap to try again."
            descriptionTone="destructive"
            action
            onPress={() => void query.refetch()}
          />
        </ListSection>
      </>
    );
  }
  if (!fields || fields.length === 0) return null;

  const fieldById = new Map(fields.map((field) => [field.field_id, field]));
  const save = (fieldId: string, value: string | null) => {
    setFailed((prev) => withoutField(prev, fieldId));
    update.mutate([{ field_id: fieldId, value }], {
      onError: (error) =>
        setFailed((prev) => ({ ...prev, [fieldId]: refusal(error) })),
    });
  };

  return (
    <>
      <SectionHeader>{COPY.title}</SectionHeader>
      <ListSection>
        {rows.map((row) => {
          const field = fieldById.get(row.fieldId);
          if (!field) return null;
          const problem = failed[row.fieldId];
          if (row.control === "switch") {
            return (
              <ListRow
                key={row.fieldId}
                variant="detail"
                label={row.label}
                description={problem ?? row.audience}
                descriptionTone={problem ? "destructive" : "default"}
                trailing={
                  // The value side of a detail row, so the switch sits at
                  // the row's end like the values above it.
                  <View style={styles.switchSlot}>
                    <Toggle
                      value={row.on}
                      onValueChange={(on) =>
                        save(row.fieldId, on ? "true" : "false")
                      }
                      accessibilityLabel={row.label}
                      disabled={update.isPending}
                    />
                  </View>
                }
              />
            );
          }
          return (
            <ListRow
              key={row.fieldId}
              variant="detail"
              label={row.label}
              value={row.value}
              description={problem ?? row.audience}
              descriptionTone={problem ? "destructive" : "default"}
              accessibilityHint={
                row.control === "pick"
                  ? "Opens a list to pick from"
                  : "Opens a sheet to edit it"
              }
              onPress={() => {
                setActive(field);
                if (row.control === "pick") pickRef.current?.present();
                else typeRef.current?.present();
              }}
            />
          );
        })}
      </ListSection>

      <OptionSheet
        ref={pickRef}
        title={active?.label ?? COPY.title}
        options={active ? ownCustomFieldOptions(active) : []}
        selected={active?.value ?? null}
        onSelect={(value) => {
          if (active && value !== active.value) save(active.field_id, value);
        }}
      />
      <OwnCustomFieldSheet ref={typeRef} field={active} />
    </>
  );
}

/**
 * One typed field (text, a number, a decimal, a phone) in a short sheet with
 * its keyboard up, saved from the header. Checked on Save, never per key; a
 * refused value stays typed with the reason under it.
 */
const OwnCustomFieldSheet = forwardRef<
  BottomSheetModal,
  { field: OwnCustomField | null }
>(function OwnCustomFieldSheet({ field }, ref) {
  const closeSheet = useSheetClose(ref);
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const backgroundStyle = useSheetBackgroundStyle();
  const update = useUpdateOwnCustomFields();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const commit = () => {
    if (!field) return;
    const { values, problems } = ownCustomFieldFormChanges([field], {
      [field.field_id]: draft,
    });
    const refused = problems[field.field_id];
    if (refused) {
      setProblem(refused);
      return;
    }
    if (values.length === 0) {
      closeSheet();
      return;
    }
    update.mutate(values, {
      onSuccess: () => closeSheet(),
      onError: (error) => setProblem(refusal(error)),
    });
  };

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      enableDynamicSizing
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      backdropComponent={SheetScrim}
      handleComponent={SheetGrabber}
      // Each open starts from what is saved: a field opened again shows its
      // value, not the last visit's refused draft.
      onChange={(index) => {
        if (index >= 0 && field) {
          setDraft(ownCustomFieldShownValue(field));
          setProblem(null);
        }
      }}
    >
      <SheetBackToClose onClose={closeSheet} />
      <BottomSheetScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        onAccessibilityEscape={closeSheet}
      >
        <SheetHeader
          title={field?.label ?? COPY.title}
          onCancel={closeSheet}
          cancelDisabled={update.isPending}
          action={{
            label: update.isPending ? "Saving…" : "Save",
            onPress: commit,
            disabled: update.isPending || !field,
            accent,
            onAccent: tokens.color.gold.onHouse,
          }}
        />
        {field ? (
          <View style={styles.fieldGroup}>
            <BottomSheetTextInput
              autoFocus
              value={draft}
              onChangeText={(next: string) => {
                setProblem(null);
                setDraft(next);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                // A number reads (518) 555-0142 once the member leaves it.
                setDraft(ownCustomFieldTidied(field, draft));
              }}
              onSubmitEditing={commit}
              editable={!update.isPending}
              accessibilityLabel={field.label}
              placeholder={COPY.notSet}
              placeholderTextColor={tokens.color.text.muted}
              {...ownCustomFieldInputProps(field)}
              style={[
                styles.field,
                focused ? styles.fieldFocused : null,
                problem ? styles.fieldInvalid : null,
              ]}
            />
            {problem ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {problem}
              </Text>
            ) : (
              <Text style={styles.hint}>
                {CUSTOM_FIELD_AUDIENCE_LINE[field.visibility]}
              </Text>
            )}
          </View>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

function createStyles(tokens: SignetTokens, accent: string) {
  const fieldStyles = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.lg,
    },
    fieldGroup: {
      gap: tokens.spacing.sm,
    },
    switchSlot: {
      flex: 1,
      alignItems: "flex-end",
    },
    field: fieldStyles.field,
    fieldFocused: fieldStyles.fieldFocused,
    fieldInvalid: {
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
  });
}
