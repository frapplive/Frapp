import { forwardRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Path } from "react-native-svg";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { SignetTokens } from "@repo/theme/signet";
import {
  EVENT_FORM_GLYPHS,
  type EventFormGlyphName,
} from "@repo/theme/event-form-glyphs";
import {
  useCreateEventType,
  useDeleteEventType,
  useUpdateEventType,
  type EventType,
} from "@repo/hooks";
import {
  describeEventTypeSets,
  EVENT_TYPE_NAME_MAX_LENGTH,
  EVENT_TYPES_MAX,
  tidyTypeName,
  typeToAdd,
  type EventTypeDraft,
} from "@repo/validation";
import { Frame, paint } from "@/components/glyph-recipe";
import { ForwardGlyph } from "@/components/control-glyphs";
import { Segmented } from "@/components/segmented";
import { sheetFieldStyles } from "@/components/sheet-scaffold";
import {
  TypeSheet,
  TypeSheetEditPane,
  useTypeSheetEditor,
  type TypeSheetEditorHandle,
} from "@/components/type-sheet";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useChapterBranding } from "@/lib/chapter-branding";

/**
 * The New event sheet's property rows (#5561,
 * `spec/ui/design-system/components.md` § Property rows): a mark, a quiet
 * label and the value, one row per setting in grouped lists (#5742), the order
 * web's event form draws (`EVENT_FORM_ROWS`) with the same marks
 * (`@repo/theme/event-form-glyphs`) and words, so the form reads as one on
 * both apps. A row that opens something shows a chevron, as Settings rows do.
 */

/** A row's mark. Decorative: the row names itself. */
export function EventFormGlyph({
  name,
  color,
  size = 18,
}: {
  name: EventFormGlyphName;
  color: string;
  size?: number;
}) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      {EVENT_FORM_GLYPHS[name].map((d) => (
        <Path key={d} d={d} {...detail} />
      ))}
    </Frame>
  );
}

/**
 * One row: the mark, the label, then `children` (a field typed in place) or
 * `value` with `onPress` (a row that opens its picker or sheet).
 */
export function PropertyRow({
  glyph,
  label,
  value,
  empty = false,
  invalid = false,
  onPress,
  disabled = false,
  accessibilityHint,
  children,
}: {
  glyph: EventFormGlyphName;
  label: string;
  value?: string;
  /** The value is a placeholder ("None", "Add a place"): drawn muted. */
  empty?: boolean;
  invalid?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  children?: ReactNode;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const inner = (
    <>
      <EventFormGlyph name={glyph} color={tokens.color.text.mutedForeground} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {children ?? (
        <Text
          style={[
            styles.value,
            empty ? styles.valueEmpty : null,
            invalid ? styles.valueInvalid : null,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
      {onPress ? (
        <ForwardGlyph color={tokens.color.text.mutedForeground} />
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{inner}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? ""}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      {inner}
    </Pressable>
  );
}

/** The hairline between two rows of the group. */
export function RowDivider() {
  const { tokens } = useFrappTheme();
  return <View style={createStyles(tokens).divider} />;
}

/**
 * "Type": the chapter's event types in the shared Type sheet
 * (`components/type-sheet.tsx`), stacked over the New event sheet, each
 * saying what it sets (`describeEventTypeSets`, the words web's Type menu
 * shows), with "No type" first. Picking one closes it onto the form.
 *
 * `typeFromForm`, for someone who can make types (`events:update`), shows the
 * search as "Find or add a type" whatever the count, and a name no type has
 * yet offers "Create “Work party”", which makes the type from the form's
 * points and attendance and holds it, as web's Type menu does. The same
 * person edits a type from its row's pencil: name, points, attendance, and
 * Delete type (Paul 2026-11-22, one Type menu on both apps).
 */
export const EventTypeSheet = forwardRef<
  BottomSheetModal,
  {
    types: readonly EventType[];
    value: string | null;
    /**
     * `made` is true for a type just made from the form, which the form
     * holds without refilling from it.
     */
    onPick: (type: EventType | null, made?: boolean) => void;
    /** Whether each type says what it sets: not for a member (#3709). */
    showSets: boolean;
    /** The type "Create “…”" makes; absent for someone who can't make one. */
    typeFromForm?: (name: string) => EventTypeDraft;
  }
>(function EventTypeSheet(
  { types, value, onPick, showSets, typeFromForm },
  ref,
) {
  const createType = useCreateEventType();
  const canManage = typeFromForm !== undefined;
  return (
    <TypeSheet
      ref={ref}
      types={types}
      isHeld={(type) => type.id === value}
      onPick={(type) => onPick(type)}
      toAdd={
        canManage
          ? (typed) =>
              typeToAdd(typed, types, {
                max: EVENT_TYPES_MAX,
                maxLength: EVENT_TYPE_NAME_MAX_LENGTH,
              })
          : undefined
      }
      onCreate={
        typeFromForm
          ? async (name) => {
              const created = await createType.mutateAsync(typeFromForm(name));
              onPick(created, true);
            }
          : undefined
      }
      describe={showSets ? describeEventTypeSets : undefined}
      renderEditor={
        canManage
          ? (type, handle) => (
              <EventTypeEdit key={type.id} type={type} handle={handle} />
            )
          : undefined
      }
    />
  );
});

const ATTENDANCE_OPTIONS = [
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
] as const;

/**
 * One event type's edit view in the Type sheet: its name, the points and
 * attendance picking it fills in, and Delete type, as web's edit view.
 */
function EventTypeEdit({
  type,
  handle,
}: {
  type: EventType;
  handle: TypeSheetEditorHandle;
}) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand.accent);
  const updateType = useUpdateEventType();
  const deleteType = useDeleteEventType();
  const [name, setName] = useState(type.name);
  const [points, setPoints] = useState(String(type.point_value));
  const [required, setRequired] = useState(type.is_mandatory);
  const tidy = tidyTypeName(name);
  const editor = useTypeSheetEditor({
    handle,
    changed:
      tidy !== type.name ||
      points.trim() !== String(type.point_value) ||
      required !== type.is_mandatory,
    save: async () => {
      if (!tidy) return "Give the type a name.";
      const trimmed = points.trim();
      const pointValue = trimmed === "" ? 0 : Number(trimmed);
      if (!Number.isInteger(pointValue) || pointValue < 0) {
        return "Points must be a whole number of 0 or more.";
      }
      await updateType.mutateAsync({
        id: type.id,
        body: { name: tidy, point_value: pointValue, is_mandatory: required },
      });
      return null;
    },
    remove: () => deleteType.mutateAsync(type.id),
  });
  return (
    <TypeSheetEditPane
      name={name}
      nameMaxLength={EVENT_TYPE_NAME_MAX_LENGTH}
      onNameChange={(next) => {
        editor.clearError();
        setName(next);
      }}
      error={editor.error}
      saving={editor.saving}
      onLeave={editor.leave}
      deleteBody="Its events keep their points and lose the type."
      deleting={editor.deleting}
      onDelete={editor.onDelete}
    >
      <View style={styles.row}>
        <Text style={styles.label}>Points</Text>
        <BottomSheetTextInput
          value={points}
          onChangeText={(next) => {
            if (!/^\d*$/.test(next)) return;
            editor.clearError();
            setPoints(next);
          }}
          accessibilityLabel="Points"
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={editor.leave}
          style={[styles.search, styles.pointsField]}
        />
      </View>
      <Segmented
        accessibilityLabel="Attendance for everyone"
        options={ATTENDANCE_OPTIONS}
        value={required ? "required" : "optional"}
        onChange={(next) => setRequired(next === "required")}
      />
    </TypeSheetEditPane>
  );
}

function createStyles(tokens: SignetTokens, accent?: string) {
  const body = typeRole(tokens.typography.role.body);
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      minHeight: tokens.touch.minimum + tokens.spacing.xs,
    },
    pressed: {
      opacity: 0.6,
    },
    label: {
      ...body,
      width: 104,
      color: tokens.color.text.mutedForeground,
    },
    value: {
      ...body,
      flex: 1,
      color: tokens.color.text.foreground,
    },
    valueEmpty: {
      color: tokens.color.text.muted,
    },
    valueInvalid: {
      color: tokens.color.semantic.destructive,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: tokens.color.border.hairline,
      // Under the label, not the mark, as Settings insets its separators.
      marginLeft: 18 + tokens.spacing.sm,
    },
    search: sheetFieldStyles(tokens, accent ?? tokens.color.text.foreground)
      .field,
    pointsField: {
      width: 88,
      textAlign: "center",
    },
  });
}
