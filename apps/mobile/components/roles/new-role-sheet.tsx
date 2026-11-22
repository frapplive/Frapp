import { forwardRef, useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useCreateRole } from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  NEW_PICKABLE_ROLE_COPY,
  ROLE_COLOR_PALETTE,
  ROLE_NAME_MAX_LENGTH,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";
import {
  useChapterBranding,
  type ChapterBranding,
} from "@/lib/chapter-branding";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetPrimaryButton,
  SheetScrim,
  SHEET_STACK_BEHAVIOR,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  useGuardedSheetRef,
} from "@/components/sheet-scaffold";
import { OptionSheet, type SheetOption } from "@/components/option-sheet";
import { CheckGlyph, ForwardGlyph } from "@/components/control-glyphs";
import { successHaptic } from "@/lib/haptics";
import { BottomSheetScrollView } from "@/lib/sheet-scrollables";

/** Where a chapter role can go: a tier the officer reaches, or none. */
export interface NewRolePlacement {
  /** `null` is outside the tiers. */
  value: string | null;
  label: string;
}

/**
 * A chapter role (#5296): placed in a tier, with a color. Absent, the sheet
 * makes a Non-chapter business role (#5736): outside the tiers, holding
 * nothing, already pickable.
 */
export interface NewChapterRole {
  /** The places the officer may put it, top tier first (`newRolePlacements`). */
  placements: readonly NewRolePlacement[];
  /** The tier heading, in the chapter's word ("Tier"). */
  tierLabel: string;
}

export interface NewRoleSheetProps {
  /** Opens the new role's page, where what it can do is changed. */
  onCreated: (roleId: string) => void;
  chapterRole?: NewChapterRole;
}

/** The words for a chapter role; a pickable one keeps `NEW_PICKABLE_ROLE_COPY`. */
const NEW_ROLE_COPY = {
  title: "New role",
  // Web's Add role row's placeholder (`roles-overview.tsx`).
  placeholder: "Philanthropy chair",
  color: "Color",
  noColor: "No color",
} as const;

/**
 * Add a role, on the phone. Two callers, one sheet:
 *
 * - **Chapter settings → New role** (#5296; Shawn, 2026-11-22: "maybe create
 *   new channels and roles but don't need to get into all the details"): a
 *   name, a tier and a color, then the role's page opens, where what it can
 *   do is switched. It starts with its tier's permissions (`permissions: []`
 *   means "take the tier's", as web's Add role row sends), so naming it is
 *   enough for most. Discord mobile's Create Role asks the same three: name,
 *   color, then the role's page. The tier choices are only those the officer
 *   ranks above (`reachesTier`), the API's rule for a new role
 *   (`spec/behavior/rbac.md` § Rank), so a pick can't be refused for rank.
 * - **Roles and groups → Non-chapter business → Add role** (#5736): one name
 *   field, and the role is created outside the tiers, holding nothing, and
 *   already marked for members to pick (`self_assignable: true`), in
 *   `NEW_PICKABLE_ROLE_COPY`'s words, which web's twin shares.
 *
 * The color is the palette's ten swatches and No color; web's hue slider for
 * any other color stays on the web. The name outlives a close, not a Cancel
 * (`spec/ui/mobile/patterns.md` § Bottom sheets).
 */
export const NewRoleSheet = forwardRef<BottomSheetModal, NewRoleSheetProps>(
  function NewRoleSheet({ onCreated, chapterRole }, ref) {
    const { tokens } = useFrappTheme();
    const brand = useChapterBranding();
    const styles = createStyles(tokens, brand);
    const backgroundStyle = useSheetBackgroundStyle();
    const closeSheet = useSheetClose(ref);
    const { modalRef, onAnimate, markClosed, dismiss, visit, isSameVisit } =
      useGuardedSheetRef(ref);
    const createRole = useCreateRole();
    const tierSheetRef = useRef<BottomSheetModal>(null);

    const placements = chapterRole?.placements ?? [];
    // The bottom place the officer reaches, as Discord puts a new role at the
    // bottom: least trusted until someone says otherwise.
    const defaultPlacement = placements.at(-1)?.value ?? null;
    const [name, setName] = useState("");
    const [placement, setPlacement] = useState<string | null>(defaultPlacement);
    const [color, setColor] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const sending = useRef(false);
    const trimmed = name.trim();
    // A tier the officer no longer reaches (a role change since the sheet
    // opened) falls back to the default rather than sending a refusal.
    const placed = placements.some((option) => option.value === placement)
      ? placement
      : defaultPlacement;
    const placedLabel =
      placements.find((option) => option.value === placed)?.label ?? "";

    const reset = useCallback(() => {
      setName("");
      setColor(null);
      setPlacement(defaultPlacement);
      setFailure(null);
    }, [defaultPlacement]);

    const closed = useCallback(() => {
      markClosed();
      setFocused(false);
      setFailure(null);
    }, [markClosed]);

    const cancel = useCallback(() => {
      if (sending.current) return;
      reset();
      dismiss();
    }, [dismiss, reset]);

    const add = useCallback(() => {
      if (!trimmed || sending.current) return;
      sending.current = true;
      setSaving(true);
      setFailure(null);
      const sentFrom = visit();
      createRole
        .mutateAsync(
          chapterRole
            ? {
                name: trimmed,
                permissions: [],
                tier_id: placed,
                ...(color ? { color } : {}),
              }
            : {
                name: trimmed,
                permissions: [],
                tier_id: null,
                self_assignable: true,
              },
        )
        .then(
          (created) => {
            sending.current = false;
            setSaving(false);
            successHaptic();
            reset();
            if (isSameVisit(sentFrom)) dismiss();
            if (created.id) onCreated(created.id);
          },
          (error: unknown) => {
            sending.current = false;
            setSaving(false);
            if (isSameVisit(sentFrom)) {
              setFailure(
                `${NEW_PICKABLE_ROLE_COPY.failed}. ${errorCopy(error, NEW_PICKABLE_ROLE_COPY.failedBody, { serverWritesForMembers: true })}`,
              );
            }
          },
        );
    }, [
      trimmed,
      chapterRole,
      placed,
      color,
      createRole,
      visit,
      isSameVisit,
      dismiss,
      reset,
      onCreated,
    ]);

    const tierOptions: SheetOption[] = placements.map((option) => ({
      value: option.value,
      label: option.label,
    }));

    return (
      <>
        <BottomSheetModal
          ref={modalRef}
          stackBehavior={SHEET_STACK_BEHAVIOR}
          enableDynamicSizing
          keyboardBehavior="interactive"
          backgroundStyle={backgroundStyle}
          handleComponent={SheetGrabber}
          backdropComponent={SheetScrim}
          onAnimate={onAnimate}
          onDismiss={closed}
        >
          <SheetBackToClose onClose={closeSheet} />
          <BottomSheetScrollView
            onAccessibilityEscape={closeSheet}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <SheetHeader
              title={
                chapterRole ? NEW_ROLE_COPY.title : NEW_PICKABLE_ROLE_COPY.title
              }
              onCancel={cancel}
              cancelDisabled={saving}
            />

            <View style={[styles.ring, focused ? styles.ringActive : null]}>
              <BottomSheetTextInput
                value={name}
                onChangeText={(next) => {
                  setName(next);
                  setFailure(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={add}
                returnKeyType="done"
                editable={!saving}
                placeholder={
                  chapterRole
                    ? NEW_ROLE_COPY.placeholder
                    : NEW_PICKABLE_ROLE_COPY.placeholder
                }
                placeholderTextColor={tokens.color.text.muted}
                accessibilityLabel="Role name"
                maxLength={ROLE_NAME_MAX_LENGTH}
                style={[styles.field, focused ? styles.fieldFocused : null]}
              />
            </View>
            {chapterRole ? null : (
              <Text style={styles.caption}>{NEW_PICKABLE_ROLE_COPY.hint}</Text>
            )}

            {chapterRole ? (
              <View style={styles.group}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${chapterRole.tierLabel}: ${placedLabel}`}
                  accessibilityState={{ disabled: saving }}
                  disabled={saving}
                  onPress={() => tierSheetRef.current?.present()}
                  style={styles.optionRow}
                >
                  <Text style={styles.optionLabel}>
                    {chapterRole.tierLabel}
                  </Text>
                  <Text style={styles.optionValue} numberOfLines={1}>
                    {placedLabel}
                  </Text>
                  <ForwardGlyph color={tokens.color.text.mutedForeground} />
                </Pressable>
                <View style={styles.groupDivider} />
                <View style={styles.colorRow}>
                  <Text style={styles.optionLabel}>{NEW_ROLE_COPY.color}</Text>
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel={NEW_ROLE_COPY.color}
                    style={styles.swatches}
                  >
                    <Swatch
                      hex={null}
                      label={NEW_ROLE_COPY.noColor}
                      on={color === null}
                      disabled={saving}
                      onPress={() => setColor(null)}
                      tokens={tokens}
                      styles={styles}
                    />
                    {ROLE_COLOR_PALETTE.map((swatch) => (
                      <Swatch
                        key={swatch.key}
                        hex={swatch.hex}
                        label={swatch.label}
                        on={color === swatch.hex}
                        disabled={saving}
                        onPress={() => setColor(swatch.hex)}
                        tokens={tokens}
                        styles={styles}
                      />
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            {failure ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {failure}
              </Text>
            ) : null}

            <SheetPrimaryButton
              label={saving ? "Adding…" : NEW_PICKABLE_ROLE_COPY.add}
              onPress={add}
              disabled={!trimmed || saving}
              busy={saving}
              accessibilityHint={trimmed ? undefined : "Name the role first."}
              accent={brand.accent}
              onAccent={tokens.color.gold.onHouse}
            />
          </BottomSheetScrollView>
        </BottomSheetModal>
        {chapterRole ? (
          <OptionSheet
            ref={tierSheetRef}
            title={chapterRole.tierLabel}
            options={tierOptions}
            selected={placed}
            onSelect={setPlacement}
          />
        ) : null}
      </>
    );
  },
);

/**
 * One color, a round swatch the size of a row control: No color is the
 * ringed empty circle, as web's picker draws its None.
 */
function Swatch({
  hex,
  label,
  on,
  disabled,
  onPress,
  tokens,
  styles,
}: {
  hex: string | null;
  label: string;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
  tokens: SignetTokens;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={[
        styles.swatch,
        hex ? { backgroundColor: hex } : styles.swatchNone,
        on ? styles.swatchOn : null,
      ]}
    >
      {on ? (
        <CheckGlyph
          color={hex ? tokens.color.gold.onHouse : tokens.color.text.foreground}
          size={16}
        />
      ) : null}
    </Pressable>
  );
}

function createStyles(tokens: SignetTokens, brand: ChapterBranding) {
  const fieldStyles = sheetFieldStyles(tokens, brand.accent);
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.sm,
    },
    ring: fieldStyles.ring,
    ringActive: fieldStyles.ringActive,
    field: fieldStyles.field,
    fieldFocused: fieldStyles.fieldFocused,
    caption: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    // The framed group of property rows, as the channel form draws its
    // Who can see and post (`channel-form-sheet.tsx`).
    group: {
      borderRadius: tokens.radius.control,
      borderWidth: 1,
      borderColor: tokens.color.border.input,
      backgroundColor: tokens.color.surface.surface1,
      paddingHorizontal: tokens.spacing.md,
    },
    groupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: tokens.color.border.hairline,
    },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      minHeight: tokens.touch.minimum + tokens.spacing.xs,
    },
    optionLabel: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    optionValue: {
      flex: 1,
      textAlign: "right",
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
    colorRow: {
      paddingVertical: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    swatches: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    swatch: {
      // The Row control step (32), foundations § 9.
      width: tokens.spacing["2xl"],
      height: tokens.spacing["2xl"],
      borderRadius: tokens.spacing["2xl"] / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    swatchNone: {
      borderWidth: 1,
      borderColor: tokens.color.border.input,
    },
    swatchOn: {
      borderWidth: 2,
      borderColor: tokens.color.text.foreground,
    },
  });
}
