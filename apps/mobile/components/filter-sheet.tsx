import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetTextInput,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import { SignetTokens } from "@repo/theme/signet";
import {
  clearFilters,
  filterValueLabel,
  filtersOn,
  hasFilterQuery,
  isFilterSearchable,
  searchFilterOptions,
  type FilterRow,
  type FilterRowOption,
} from "@repo/hooks/filter-rows";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useChapterBranding } from "@/lib/chapter-branding";
import { BackGlyph, CheckGlyph, CloseGlyph } from "@/components/control-glyphs";
import { Chip, ChipRow } from "@/components/filter-chips";
import { InlineNote } from "@/components/inline-note";
import { ListRow, ListSection } from "@/components/list-section";
import { TaskBarPill } from "@/components/tasks/task-action-bar";
import {
  SheetBackToClose,
  SheetCloseButton,
  SheetGrabber,
  SheetScrim,
  TallSheetHeader,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  useTallSheetProps,
  SHEET_STACK_BEHAVIOR,
} from "@/components/sheet-scaffold";
import {
  BottomSheetFlatList,
  BottomSheetScrollView,
} from "@/lib/sheet-scrollables";

/**
 * A filter row as the phone draws it: web's `FilterRow`, plus what a list
 * read from the server needs while it hasn't answered (the Directory's Role,
 * read from `GET /v1/roles`).
 */
export type FilterSheetFilter = FilterRow & {
  /**
   * Until the options' read has answered, the row's list is empty for want of
   * a read, not because there are none, so its options say so in one line
   * ("Loading roles…"), with a retry once it failed, instead of listing only
   * "Any".
   */
  optionsNote?: { text: string; onRetry?: () => void };
  /** The one line under its "any" row when it has no other options. */
  emptyNote?: string;
};

/**
 * The one way to filter a list on the phone (rulebook § 9,
 * `spec/ui/design-system/components.md` § 13 Filter bar), the sheet behind a
 * screen's one Filters chip. It lists web's `FilterMenu` rows in web's order,
 * each with its current value, as iOS Settings and Gmail's and LinkedIn's
 * phone filter sheets list theirs; a tap opens that row's options in the same
 * sheet with a way back, since a picker never opens a sheet over a sheet
 * (NN/g, bottom sheets). A pick applies at once and returns to the rows, so
 * the list behind is already narrowed. Past `FILTER_SEARCH_THRESHOLD`
 * options the list gets a search field, matching by word start as web's
 * does. Sort rows sit in their own group and are never counted; Clear all is
 * last while any filter is on. The sheet ends in one pill naming what the
 * list now holds ("Show 23 members"), as Airbnb's and Zillow's filter sheets
 * end, which closes it.
 *
 * Pair it with {@link ActiveFilterChips} under the screen's search field, fed
 * the same rows: Baymard's testing found people lose track of filters that
 * hide behind the button.
 */
export const FilterSheet = forwardRef<
  BottomSheetModal,
  {
    /** "Filter actives". */
    title: string;
    filters: readonly FilterSheetFilter[];
    /** The pill's words, from the list as it now stands: "Show 23 members". */
    showLabel: string;
  }
>(function FilterSheet({ title, filters, showLabel }, ref) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand.accent);
  const backgroundStyle = useSheetBackgroundStyle();
  const tallSheet = useTallSheetProps();
  const closeSheet = useSheetClose(ref);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // A row that went away while open (a standing's Period once the sort
  // changes, a Group whose groups emptied) drops back to the rows, its typed
  // search with it, so the next row opens whole and the same key coming back
  // doesn't reopen it.
  const open = filters.find((f) => f.key === openKey) ?? null;
  const back = () => {
    setOpenKey(null);
    setQuery("");
  };
  // Adjusted while rendering, React's pattern for state that follows props.
  if (openKey !== null && open === null) back();
  // Back and VoiceOver's escape step out of a row's options to the rows, and
  // out of the rows close the sheet.
  const backOrClose = open ? back : closeSheet;

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      {...tallSheet}
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
      onDismiss={back}
      footerComponent={(footer: BottomSheetFooterProps) => (
        <BottomSheetFooter {...footer}>
          <View style={styles.footer}>
            <TaskBarPill
              label={showLabel}
              fill={brand.accent}
              ink={tokens.color.gold.onHouse}
              onPress={closeSheet}
            />
          </View>
        </BottomSheetFooter>
      )}
    >
      <SheetBackToClose onClose={backOrClose} />
      {open ? (
        <FilterOptions
          filter={open}
          query={query}
          onQuery={setQuery}
          onEscape={backOrClose}
          onClose={closeSheet}
          onPick={(value) => {
            open.onChange(value);
            back();
          }}
        />
      ) : (
        <FilterRows
          title={title}
          filters={filters}
          onOpen={setOpenKey}
          onEscape={backOrClose}
        />
      )}
    </BottomSheetModal>
  );
});

function FilterRows({
  title,
  filters,
  onOpen,
  onEscape,
}: {
  title: string;
  filters: readonly FilterSheetFilter[];
  onOpen: (key: string) => void;
  /** Closes the sheet: its X and VoiceOver's escape. */
  onEscape: () => void;
}) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand.accent);
  const on = filtersOn(filters);
  const narrowing = filters.filter((f) => !f.isSort);
  const sorts = filters.filter((f) => f.isSort);
  const row = (filter: FilterSheetFilter) => (
    <ListRow
      key={filter.key}
      label={filter.label}
      value={filterValueLabel(filter)}
      onPress={() => onOpen(filter.key)}
    />
  );
  return (
    <BottomSheetScrollView
      onAccessibilityEscape={onEscape}
      contentContainerStyle={[
        styles.content,
        styles.rows,
        styles.contentWithFooter,
      ]}
    >
      <TallSheetHeader title={title} onClose={onEscape} />
      {narrowing.length > 0 ? (
        <ListSection>{narrowing.map(row)}</ListSection>
      ) : null}
      {sorts.length > 0 ? <ListSection>{sorts.map(row)}</ListSection> : null}
      {on.length > 0 ? (
        <ListSection>
          <ListRow
            label="Clear all"
            action
            accessibilityHint={
              on.length === 1
                ? "Turns the filter off."
                : `Turns all ${on.length} filters off.`
            }
            onPress={() => clearFilters(filters)}
          />
        </ListSection>
      ) : null}
    </BottomSheetScrollView>
  );
}

function FilterOptions({
  filter,
  query,
  onQuery,
  onEscape,
  onClose,
  onPick,
}: {
  filter: FilterSheetFilter;
  query: string;
  onQuery: (next: string) => void;
  /** Back to the rows: the back row and VoiceOver's escape. */
  onEscape: () => void;
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand.accent);
  const note = filter.optionsNote;
  const pending = note !== undefined;
  const searchable = !pending && isFilterSearchable(filter);
  const shown = pending ? [] : searchFilterOptions(filter, query);
  const choices = filter.options.filter((o) => o.value !== filter.anyValue);
  // A dot column only for a list whose options carry a colour (roles), so
  // names line up whether or not each has one.
  const dots = filter.options.some((o) => o.color !== undefined);
  const searchLabel = `Search ${filter.label.toLowerCase()}`;

  return (
    <BottomSheetFlatList
      onAccessibilityEscape={onEscape}
      accessibilityRole="radiogroup"
      accessibilityLabel={filter.label}
      data={shown}
      keyExtractor={(option: FilterRowOption) => option.value}
      contentContainerStyle={[styles.content, styles.contentWithFooter]}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.optionsHeader}>
          <View style={styles.backRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to filters"
              onPress={onEscape}
              hitSlop={tokens.spacing.sm}
              style={styles.back}
            >
              <BackGlyph color={tokens.color.text.foreground} />
            </Pressable>
            <Text
              accessibilityRole="header"
              style={styles.optionsTitle}
              numberOfLines={1}
            >
              {filter.label}
            </Text>
            <SheetCloseButton onPress={onClose} />
          </View>
          {searchable ? (
            // `BottomSheetTextInput`, not `SearchField`: a plain input breaks
            // the sheet's keyboard handling (`patterns.md`).
            <BottomSheetTextInput
              value={query}
              onChangeText={onQuery}
              placeholder={searchLabel}
              placeholderTextColor={tokens.color.text.muted}
              accessibilityLabel={searchLabel}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              // Return picks the first match, as web's Enter does.
              onSubmitEditing={() => {
                const first = shown[0];
                if (hasFilterQuery(query) && first) onPick(first.value);
              }}
              style={styles.field}
            />
          ) : null}
        </View>
      }
      ListFooterComponent={
        // A list with nothing but its "any" row says why in one line.
        !pending && choices.length === 0 && filter.emptyNote ? (
          <Text style={styles.empty}>{filter.emptyNote}</Text>
        ) : null
      }
      ListEmptyComponent={
        note?.onRetry ? (
          <InlineNote action={{ label: "Retry", onPress: note.onRetry }}>
            {note.text}
          </InlineNote>
        ) : (
          <Text style={styles.empty}>
            {note ? note.text : `No matches for "${query.trim()}".`}
          </Text>
        )
      }
      renderItem={({ item }: { item: FilterRowOption }) => {
        const selected = item.value === filter.value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onPick(item.value)}
            style={({ pressed }) => [
              styles.option,
              pressed ? styles.optionPressed : null,
            ]}
          >
            {dots ? (
              item.color === undefined ? (
                <View style={styles.dotSlot} />
              ) : (
                <View
                  style={[
                    styles.dot,
                    item.color ? { backgroundColor: item.color } : null,
                  ]}
                />
              )
            ) : null}
            <Text
              style={[styles.optionLabel, selected ? styles.optionOn : null]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {/* A fixed slot, so names line up whichever row is picked. */}
            <View
              style={styles.check}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {selected ? <CheckGlyph color={brand.accent} size={20} /> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

/**
 * The filters that are on, as removable chips under a screen's search field,
 * with Clear all once two are on; nothing at all while none are on. The same
 * rows as the screen's {@link FilterSheet}, as web's `ActiveFilterChips` takes
 * its `FilterMenu`'s. A chip names its filter and value ("Role: Treasurer")
 * and takes it off on a tap.
 */
export function ActiveFilterChips({
  filters,
}: {
  filters: readonly FilterRow[];
}) {
  const { tokens } = useFrappTheme();
  const on = filtersOn(filters);
  if (on.length === 0) return null;
  return (
    <ChipRow scroll>
      {on.map((filter) => {
        const value = filterValueLabel(filter);
        return (
          <Chip
            key={filter.key}
            accessibilityRole="button"
            accessibilityState={{}}
            accessibilityLabel={`Remove filter ${filter.label}: ${value}`}
            label={`${filter.label}: ${value}`}
            on
            quiet
            trailing={
              <CloseGlyph color={tokens.color.text.mutedForeground} size={14} />
            }
            onPress={() => filter.onChange(filter.anyValue)}
          />
        );
      })}
      {on.length > 1 ? (
        <Chip
          accessibilityRole="button"
          accessibilityState={{}}
          label="Clear all"
          on={false}
          quiet
          onPress={() => clearFilters(filters)}
        />
      ) : null}
    </ChipRow>
  );
}

/** Room under the list for the footer's pill, so the last rows scroll clear. */
const FOOTER_ROOM = 112;

function createStyles(tokens: SignetTokens, accent: string) {
  const fieldStyles = sheetFieldStyles(tokens, accent);
  const dotSize = 10;
  return StyleSheet.create({
    content: {
      paddingHorizontal: tokens.spacing.lg,
    },
    contentWithFooter: {
      paddingBottom: FOOTER_ROOM,
    },
    rows: {
      gap: tokens.spacing.md,
    },
    footer: {
      alignItems: "center",
      paddingTop: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
      backgroundColor: tokens.color.surface.popover,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.color.border.hairline,
    },
    optionsHeader: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xs,
    },
    backRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      minHeight: tokens.touch.minimum,
    },
    back: {
      minWidth: tokens.touch.minimum / 2,
      justifyContent: "center",
    },
    optionsTitle: {
      ...typeRole(tokens.typography.role.title),
      color: tokens.color.text.foreground,
      flex: 1,
    },
    field: fieldStyles.field,
    empty: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingVertical: tokens.spacing.md,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      minHeight: tokens.touch.minimum,
      paddingVertical: tokens.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.color.border.hairline,
    },
    optionPressed: {
      opacity: 0.7,
    },
    dot: {
      width: dotSize,
      height: dotSize,
      borderRadius: dotSize / 2,
      backgroundColor: tokens.color.border.hairline,
    },
    dotSlot: {
      width: dotSize,
    },
    optionLabel: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
      flex: 1,
    },
    optionOn: {
      ...typeRole(tokens.typography.role.label),
    },
    check: {
      width: 20,
      alignItems: "center",
    },
  });
}
