import { forwardRef, useCallback, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import {
  describeChannelAccess,
  isEmptyChannelAccessChoice,
  matchesCategoryAccess,
  type ChannelAccessOption,
  type ChannelAccessQuestion,
} from "@repo/hooks/channel-access";
import { CHANNEL_SETTINGS_COPY } from "@repo/validation";
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
  useSheetVisit,
} from "@/components/sheet-scaffold";
import { OptionSheet } from "@/components/option-sheet";
import { ForwardGlyph } from "@/components/control-glyphs";
import {
  CHANNEL_ACCESS_TITLE,
  ChannelAccessSheet,
} from "@/components/chat/channel-access-sheet";
import { Toggle } from "@/components/toggle";
import { successHaptic } from "@/lib/haptics";
import { BottomSheetScrollView } from "@/lib/sheet-scrollables";

/** The option for "no category"; the option sheet keeps `null` for "any". */
const NO_CATEGORY = "__none__";

export interface ChannelFormCategory {
  id: string;
  name: string;
  /** The category's answers, which a new channel in it starts with. */
  who_can_see?: string[] | null;
  who_can_post?: string[] | null;
}

/**
 * What the sheet is for: a new channel, in the category it was opened from.
 * Editing one is its own screen since #6031 (`channel-settings-screen.tsx`).
 */
export type ChannelFormMode = { kind: "create"; categoryId: string | null };

export interface ChannelFormValues {
  name: string;
  /** Trimmed; empty means none. */
  description: string;
  categoryId: string | null;
  /** Create only: a private channel's members are added by hand. */
  isPrivate: boolean;
  /**
   * Who can see and who can post, when the officer changed either: left
   * out, the server copies the category's lists.
   */
  access: {
    who_can_see?: string[] | null;
    who_can_post?: string[] | null;
  };
}

/** The two answers a draft holds. */
interface AccessDraft {
  see: string[] | null;
  post: string[] | null;
}

const ACCESS_INCOMPLETE =
  "Add a tier, role or group to each chosen list, or pick Everyone.";

/**
 * New channel, on the phone (#3838; Shawn, 2026-11-11: "I should be able to
 * create new channels directly on the channel list"), as web's Create a
 * channel panel asks: the name, a description, the category, and whether it
 * is private, which is fixed after that. Editing a channel is its own screen
 * since #6031 (`channel-settings-screen.tsx`), as on web.
 *
 * Who can see and who can post (#3702): two rows, each opening a tall step
 * (`channel-access-sheet.tsx`) with web's two answers, Everyone or chosen
 * tiers and roles. A new channel starts with its category's answers and
 * follows a change of category until the officer changes one, as web's
 * Create a channel panel does. A private channel carries no lists.
 *
 * The category is a row that opens the shared option sheet (rulebook § 9:
 * never filter chips as a form picker). The host mounts a new sheet per
 * opening (`key`), so a draft never carries to the next.
 */
export const ChannelFormSheet = forwardRef<
  BottomSheetModal,
  {
    mode: ChannelFormMode;
    categories: readonly ChannelFormCategory[];
    /** Saves; rejects with the line to show when the server refuses. */
    onSubmit: (values: ChannelFormValues) => Promise<void>;
    /** What the lists can name: `GET /v1/channels/access-options`. */
    accessOptions: readonly ChannelAccessOption[];
    accessOptionsState: "ready" | "loading" | "error";
  }
>(function ChannelFormSheet(
  { mode, categories, onSubmit, accessOptions, accessOptionsState },
  ref,
) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand);
  const backgroundStyle = useSheetBackgroundStyle();
  const closeSheet = useSheetClose(ref);
  const { onAnimate, markClosed, dismiss, visit, isSameVisit } =
    useSheetVisit(ref);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>(
    mode.categoryId ?? NO_CATEGORY,
  );
  const [isPrivate, setIsPrivate] = useState(false);

  // Who can see and post: the category's, followed until the officer
  // changes one.
  const categoryOf = (id: string) =>
    id === NO_CATEGORY
      ? null
      : (categories.find((category) => category.id === id) ?? null);
  const [access, setAccess] = useState<AccessDraft>(() => {
    const category = mode.categoryId
      ? (categories.find((c) => c.id === mode.categoryId) ?? null)
      : null;
    return {
      see: category?.who_can_see ?? null,
      post: category?.who_can_post ?? null,
    };
  });
  const [accessTouched, setAccessTouched] = useState(false);
  const [question, setQuestion] = useState<ChannelAccessQuestion>("see");
  const accessSheetRef = useRef<BottomSheetModal>(null);
  const categorySheetRef = useRef<BottomSheetModal>(null);
  const [focused, setFocused] = useState<"name" | "description" | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Set the moment Save is pressed, so a second tap in the same batch can't
  // create the channel twice.
  const sending = useRef(false);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !saving;

  /** Whether the sheet asks who can see and post at all. */
  const takesLists = !isPrivate;
  const draftCategory = categoryOf(categoryId);
  const matches = matchesCategoryAccess(access.see, access.post, draftCategory);
  const accessIncomplete =
    takesLists &&
    (isEmptyChannelAccessChoice(access.see) ||
      isEmptyChannelAccessChoice(access.post));

  function accessBody(): ChannelFormValues["access"] {
    if (!takesLists) return {};
    // Left out, a new channel copies its category's lists on the server.
    return accessTouched
      ? { who_can_see: access.see, who_can_post: access.post }
      : {};
  }

  function pickCategory(value: string) {
    setCategoryId(value);
    // A new channel follows its category until a list is changed.
    if (!accessTouched) {
      const category = categoryOf(value);
      setAccess({
        see: category?.who_can_see ?? null,
        post: category?.who_can_post ?? null,
      });
    }
  }

  function changeAccess(next: string[] | null) {
    setAccess((current) =>
      question === "see"
        ? { ...current, see: next }
        : { ...current, post: next },
    );
    setAccessTouched(true);
    setFailure(null);
  }

  function openAccess(which: ChannelAccessQuestion) {
    Keyboard.dismiss();
    setQuestion(which);
    accessSheetRef.current?.present?.();
  }

  const closed = useCallback(() => {
    markClosed();
    setFocused(null);
    setFailure(null);
  }, [markClosed]);

  const save = useCallback(() => {
    if (!canSave || sending.current) return;
    if (accessIncomplete) {
      setFailure(ACCESS_INCOMPLETE);
      return;
    }
    sending.current = true;
    setSaving(true);
    setFailure(null);
    const sentFrom = visit();
    void onSubmit({
      name: trimmed,
      description: description.trim(),
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      isPrivate,
      access: accessBody(),
    })
      .then(() => {
        successHaptic();
        if (isSameVisit(sentFrom)) dismiss();
      })
      .catch((error: unknown) => {
        if (!isSameVisit(sentFrom)) return;
        setFailure(
          error instanceof Error && error.message
            ? error.message
            : "Couldn't create the channel. Try again.",
        );
      })
      .finally(() => {
        sending.current = false;
        setSaving(false);
      });
    // `accessBody` reads this render's draft, which the deps below cover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canSave,
    accessIncomplete,
    access,
    accessTouched,
    visit,
    onSubmit,
    trimmed,
    description,
    categoryId,
    isPrivate,
    isSameVisit,
    dismiss,
  ]);

  const categoryOptions = [
    { value: NO_CATEGORY, label: CHANNEL_SETTINGS_COPY.noCategory },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];
  const categoryName = draftCategory?.name ?? CHANNEL_SETTINGS_COPY.noCategory;

  return (
    <>
      <BottomSheetModal
        ref={ref}
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
            title="New channel"
            onCancel={closeSheet}
            cancelDisabled={saving}
          />

          <Text style={styles.groupLabel}>Name</Text>
          <View
            style={[styles.ring, focused === "name" ? styles.ringActive : null]}
          >
            <BottomSheetTextInput
              value={name}
              onChangeText={(next) => {
                setName(next);
                setFailure(null);
              }}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused(null)}
              editable={!saving}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="announcements"
              placeholderTextColor={tokens.color.text.muted}
              accessibilityLabel="Channel name"
              maxLength={80}
              style={[
                styles.field,
                focused === "name" ? styles.fieldFocused : null,
              ]}
            />
          </View>

          <Text style={styles.groupLabel}>Description</Text>
          <View
            style={[
              styles.ring,
              focused === "description" ? styles.ringActive : null,
            ]}
          >
            <BottomSheetTextInput
              value={description}
              onChangeText={(next) => {
                setDescription(next);
                setFailure(null);
              }}
              onFocus={() => setFocused("description")}
              onBlur={() => setFocused(null)}
              editable={!saving}
              placeholder="What it's for"
              placeholderTextColor={tokens.color.text.muted}
              accessibilityLabel="Channel description"
              multiline
              maxLength={500}
              style={[
                styles.field,
                styles.fieldMultiline,
                focused === "description" ? styles.fieldFocused : null,
              ]}
            />
          </View>

          <View style={styles.group}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${CHANNEL_SETTINGS_COPY.category}: ${categoryName}`}
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={() => {
                Keyboard.dismiss();
                categorySheetRef.current?.present?.();
              }}
              style={styles.optionRow}
            >
              <Text style={styles.optionLabel}>
                {CHANNEL_SETTINGS_COPY.category}
              </Text>
              <Text style={styles.optionValue} numberOfLines={1}>
                {categoryName}
              </Text>
              <ForwardGlyph color={tokens.color.text.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>Private channel</Text>
              <Text style={styles.caption}>
                Only people you add can see it, starting with you. This
                can&apos;t be changed later.
              </Text>
            </View>
            <Toggle
              value={isPrivate}
              onValueChange={setIsPrivate}
              accessibilityLabel="Private channel"
            />
          </View>

          {takesLists ? (
            <>
              <Text style={styles.groupLabel}>Who can see and post</Text>
              <View style={styles.group}>
                {(["see", "post"] as const).map((which, index) => {
                  const list = which === "see" ? access.see : access.post;
                  const valueText = describeChannelAccess(
                    list,
                    which,
                    accessOptions,
                  );
                  return (
                    <View key={which}>
                      {index > 0 ? <View style={styles.groupDivider} /> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${CHANNEL_ACCESS_TITLE[which]}: ${valueText}`}
                        accessibilityState={{ disabled: saving }}
                        disabled={saving}
                        onPress={() => openAccess(which)}
                        style={styles.optionRow}
                      >
                        <Text style={styles.optionLabel}>
                          {CHANNEL_ACCESS_TITLE[which]}
                        </Text>
                        <Text style={styles.optionValue} numberOfLines={1}>
                          {valueText}
                        </Text>
                        <ForwardGlyph
                          color={tokens.color.text.mutedForeground}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              {draftCategory && matches ? (
                <Text style={styles.caption}>
                  Same as {draftCategory.name}.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.caption}>
              You can add people once it&apos;s created.
            </Text>
          )}

          {failure ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {failure}
            </Text>
          ) : null}

          <SheetPrimaryButton
            label="Create channel"
            onPress={save}
            disabled={!canSave}
            busy={saving}
            accessibilityHint={trimmed ? undefined : "Give the channel a name."}
            accent={brand.accent}
            onAccent={tokens.color.gold.onHouse}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
      {/* A sibling, as Who's coming is to New event: it stacks over this
        sheet (`SHEET_STACK_BEHAVIOR`), which stays presented under it. */}
      {takesLists ? (
        <ChannelAccessSheet
          ref={accessSheetRef}
          question={question}
          value={question === "see" ? access.see : access.post}
          onChange={changeAccess}
          options={accessOptions}
          optionsState={accessOptionsState}
        />
      ) : null}
      <OptionSheet
        ref={categorySheetRef}
        title={CHANNEL_SETTINGS_COPY.category}
        options={categoryOptions}
        selected={categoryId}
        onSelect={(value) => {
          if (value !== null) pickCategory(value);
        }}
      />
    </>
  );
});

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
    fieldMultiline: { ...fieldStyles.fieldMultilineText, minHeight: 72 },
    fieldFocused: fieldStyles.fieldFocused,
    groupLabel: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
      marginTop: tokens.spacing.xs,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      minHeight: tokens.touch.minimum,
      marginTop: tokens.spacing.xs,
    },
    toggleText: { flexShrink: 1, gap: tokens.spacing.xs },
    toggleLabel: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    caption: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
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
  });
}
