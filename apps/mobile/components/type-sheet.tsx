import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SignetTokens } from "@repo/theme/signet";
import { errorCopy } from "@repo/hooks";
import {
  addTypeLabel,
  editTypeLabel,
  TYPE_DELETE,
  TYPE_FIND,
  TYPE_FIND_OR_ADD,
  TYPE_NO_MATCH,
  TYPE_NONE,
  TYPE_SEARCH_FROM,
  typeMatchesSearch,
} from "@repo/validation";
import {
  BackGlyph,
  CheckGlyph,
  PencilGlyph,
  PlusGlyph,
  TrashGlyph,
} from "@/components/control-glyphs";
import {
  MAX_ROWS_SIZED_TO_CONTENT,
  pickSheetSizing,
} from "@/components/option-sheet";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetScrim,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  SHEET_STACK_BEHAVIOR,
} from "@/components/sheet-scaffold";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useChapterBranding } from "@/lib/chapter-branding";
import { BottomSheetFlatList } from "@/lib/sheet-scrollables";

/**
 * The phone's one Type sheet (`spec/ui/design-system/components.md` § Type
 * menu), the phone half of web's `TypeMenu`: a chapter's own types picked,
 * made, renamed and deleted from the sheet that applies them, for event types
 * and document types alike (Paul 2026-11-22). Stacked over the form that
 * opened it and sized to its rows, as every pick-one sheet is (Paul
 * 2026-11-20: a sheet "taking the whole screen" hides what you're dealing
 * with); past {@link MAX_ROWS_SIZED_TO_CONTENT} rows it stops at 70% and
 * scrolls.
 *
 * - "No type" first; the held type checked in the chapter's accent.
 * - Someone who can add a type always has the search, "Find or add a type",
 *   and a name no type has yet offers `Create “…”`; return holds the one
 *   match left, or makes the typed name when none is left.
 * - Someone who can manage the list has a pencil at each row's end, which
 *   turns the sheet into that type's edit view: back, its name, the caller's
 *   other fields, and Delete type, confirmed by the platform alert. Back,
 *   return, and closing the sheet save what changed.
 */

/** What every type in the sheet carries. */
export interface TypeSheetItem {
  id: string;
  name: string;
}

/** What the sheet hands the caller's edit view. */
export interface TypeSheetEditorHandle {
  /** Back to the list, with nothing left to save. */
  done: () => void;
  /** The view hands the sheet its save-and-leave, run when the sheet closes. */
  setLeave: (leave: (() => void) | null) => void;
}

type Row<T> =
  | { kind: "none" }
  | { kind: "held-new"; name: string }
  | { kind: "type"; type: T }
  | { kind: "create"; name: string };

function rowKey<T extends TypeSheetItem>(row: Row<T>) {
  return row.kind === "type" ? row.type.id : row.kind;
}

export interface TypeSheetProps<T extends TypeSheetItem> {
  types: readonly T[];
  isHeld: (type: T) => boolean;
  /** A name held that isn't on the list yet (a document type the upload adds). */
  heldNewName?: string | null;
  /** Picking closes the sheet; `null` is No type. */
  onPick: (type: T | null) => void;
  /** What `Create “…”` would make from the search; absent when nobody here can add. */
  toAdd?: (typed: string) => string | null;
  /** Makes (or holds) the typed type, then the sheet closes; a throw is said in the sheet. */
  onCreate?: (name: string) => Promise<void> | void;
  /** A muted line at a type's end ("10 points · Required"). */
  describe?: (type: T) => string;
  /** One type's edit view; absent when the list can't be managed here. */
  renderEditor?: (type: T, handle: TypeSheetEditorHandle) => ReactNode;
}

function TypeSheetInner<T extends TypeSheetItem>(
  props: TypeSheetProps<T>,
  ref: React.ForwardedRef<BottomSheetModal>,
) {
  const backgroundStyle = useSheetBackgroundStyle();
  const close = useSheetClose(ref);
  const { tokens } = useFrappTheme();
  const insets = useSafeAreaInsets();
  const leaveRef = useRef<(() => void) | null>(null);
  // One row more than the types at most (No type while the search is empty,
  // or Create while it offers, never both), plus a held new name. Held for
  // the sheet's life, so a type made here can't resize it as it closes.
  const [fits] = useState(
    () =>
      props.types.length + 1 + (props.heldNewName ? 1 : 0) <=
      MAX_ROWS_SIZED_TO_CONTENT,
  );
  const [sheetKey, setSheetKey] = useState(0);
  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      {...pickSheetSizing(fits)}
      // The search raises it with the keyboard: never under the status bar.
      topInset={insets.top + tokens.spacing.sm}
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
      onDismiss={() => {
        // An open edit saves on the way out; the next open starts on the list.
        leaveRef.current?.();
        leaveRef.current = null;
        setSheetKey((key) => key + 1);
      }}
    >
      <SheetBackToClose onClose={close} />
      <TypeSheetBody
        key={sheetKey}
        {...props}
        fits={fits}
        setLeave={(leave) => {
          leaveRef.current = leave;
        }}
        onPick={(type) => {
          props.onPick(type);
          close();
        }}
        onCreated={close}
        onDone={close}
      />
    </BottomSheetModal>
  );
}

/** The sheet itself; `ref` presents it. */
export const TypeSheet = forwardRef(TypeSheetInner) as <
  T extends TypeSheetItem,
>(
  props: TypeSheetProps<T> & { ref?: React.Ref<BottomSheetModal> },
) => ReturnType<typeof TypeSheetInner>;

function TypeSheetBody<T extends TypeSheetItem>({
  types,
  isHeld,
  heldNewName = null,
  onPick,
  toAdd,
  onCreate,
  describe,
  renderEditor,
  fits,
  setLeave,
  onCreated,
  onDone,
}: TypeSheetProps<T> & {
  fits: boolean;
  setLeave: (leave: (() => void) | null) => void;
  onCreated: () => void;
  onDone: () => void;
}) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const insets = useSafeAreaInsets();
  const styles = createStyles(tokens, brand.accent);
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canAdd = toAdd !== undefined && onCreate !== undefined;
  const showSearch = canAdd || types.length > TYPE_SEARCH_FROM;
  const adding = canAdd ? toAdd(search) : null;
  const editing =
    editingId === null
      ? null
      : (types.find((type) => type.id === editingId) ?? null);
  const rows = useMemo<Row<T>[]>(() => {
    const searching = search.trim() !== "";
    const matching = types.filter((type) =>
      typeMatchesSearch(type.name, search),
    );
    return [
      ...(searching ? [] : [{ kind: "none" } as const]),
      ...(!searching && heldNewName !== null
        ? [{ kind: "held-new", name: heldNewName } as const]
        : []),
      ...matching.map((type) => ({ kind: "type", type }) as const),
      ...(adding ? [{ kind: "create", name: adding } as const] : []),
    ];
  }, [types, search, adding, heldNewName]);
  const noneHeld = heldNewName === null && !types.some((t) => isHeld(t));

  async function create(name: string) {
    if (!onCreate || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      await onCreate(name);
      setSearch("");
      onCreated();
    } catch (error) {
      setCreateError(errorCopy(error, "Couldn't make the type. Try again."));
    } finally {
      setCreating(false);
    }
  }

  if (editing && renderEditor) {
    return (
      <BottomSheetView
        style={{ paddingBottom: insets.bottom + tokens.spacing.md }}
      >
        {renderEditor(editing, {
          done: () => {
            setLeave(null);
            setEditingId(null);
          },
          setLeave,
        })}
      </BottomSheetView>
    );
  }

  const header = (
    <View style={styles.listHeader}>
      <SheetHeader title="Type" />
      {showSearch ? (
        <BottomSheetTextInput
          value={search}
          onChangeText={(next) => {
            setSearch(next);
            setCreateError(null);
          }}
          placeholder={canAdd ? TYPE_FIND_OR_ADD : TYPE_FIND}
          placeholderTextColor={tokens.color.text.muted}
          accessibilityLabel={canAdd ? TYPE_FIND_OR_ADD : TYPE_FIND}
          autoCapitalize={canAdd ? "words" : "none"}
          autoCorrect={false}
          returnKeyType="done"
          // Return holds the one type the search leaves, or makes the typed
          // name when none is left, as Enter picks the top match on web; a
          // half-typed search never becomes a type.
          onSubmitEditing={() => {
            const shown = rows.filter((row) => row.kind === "type");
            if (shown.length === 1 && shown[0]!.kind === "type") {
              onPick(shown[0]!.type);
            } else if (shown.length === 0 && adding) {
              void create(adding);
            }
          }}
          style={styles.search}
        />
      ) : null}
      {createError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {createError}
        </Text>
      ) : null}
    </View>
  );

  const renderRow = (row: Row<T>) => {
    if (row.kind === "create") {
      return (
        <Pressable
          key="create"
          accessibilityRole="button"
          accessibilityLabel={addTypeLabel(row.name)}
          accessibilityState={{ disabled: creating }}
          disabled={creating}
          onPress={() => void create(row.name)}
          style={({ pressed }) => [
            styles.typeRow,
            pressed || creating ? styles.pressed : null,
          ]}
        >
          <View style={styles.check}>
            <PlusGlyph color={tokens.color.text.mutedForeground} size={18} />
          </View>
          <Text style={styles.typeName} numberOfLines={1}>
            {addTypeLabel(row.name)}
          </Text>
        </Pressable>
      );
    }
    const type = row.kind === "type" ? row.type : null;
    const name =
      row.kind === "type"
        ? row.type.name
        : row.kind === "held-new"
          ? row.name
          : TYPE_NONE;
    const held =
      row.kind === "type"
        ? isHeld(row.type)
        : row.kind === "held-new"
          ? true
          : noneHeld;
    return (
      <View key={rowKey(row)} style={styles.typeRow}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: held }}
          accessibilityLabel={name}
          onPress={() => (row.kind === "held-new" ? onDone() : onPick(type))}
          style={({ pressed }) => [
            styles.pickArea,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.check}>
            {held ? <CheckGlyph color={brand.accent} size={18} /> : null}
          </View>
          <Text
            style={[styles.typeName, row.kind === "none" ? styles.muted : null]}
            numberOfLines={1}
          >
            {name}
          </Text>
          {type && describe ? (
            <Text style={styles.typeSets} numberOfLines={1}>
              {describe(type)}
            </Text>
          ) : null}
          {row.kind === "held-new" ? (
            <Text style={styles.typeSets}>New</Text>
          ) : null}
        </Pressable>
        {type && renderEditor ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editTypeLabel(type.name)}
            hitSlop={tokens.spacing.xs}
            onPress={() => setEditingId(type.id)}
            style={({ pressed }) => [
              styles.editButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <PencilGlyph color={tokens.color.text.mutedForeground} size={18} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const empty =
    rows.length === 0 ? (
      <Text style={styles.caption}>{TYPE_NO_MATCH}</Text>
    ) : null;
  const bottomPad = { paddingBottom: insets.bottom + tokens.spacing.md };

  if (fits) {
    return (
      <BottomSheetView
        accessibilityRole="radiogroup"
        onAccessibilityEscape={onDone}
        style={bottomPad}
      >
        {header}
        {rows.map(renderRow)}
        {empty}
      </BottomSheetView>
    );
  }
  return (
    <BottomSheetFlatList
      onAccessibilityEscape={onDone}
      data={rows}
      keyExtractor={rowKey}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[styles.listContent, bottomPad]}
      ListHeaderComponent={header}
      stickyHeaderIndices={[0]}
      ListEmptyComponent={empty}
      renderItem={({ item }: { item: Row<T> }) => renderRow(item)}
    />
  );
}

/**
 * One type's edit view in the sheet: back beside its name, the caller's other
 * fields, then Delete type, confirmed by the platform alert with what it does
 * to the records that carry it.
 */
export function TypeSheetEditPane({
  name,
  nameMaxLength,
  onNameChange,
  error,
  saving,
  onLeave,
  deleteBody,
  deleting,
  onDelete,
  children,
}: {
  name: string;
  nameMaxLength: number;
  onNameChange: (name: string) => void;
  error: string | null;
  saving: boolean;
  onLeave: () => void;
  /** What deleting does, said in the confirm. */
  deleteBody: string;
  deleting: boolean;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand.accent);
  return (
    <View style={styles.editPane}>
      <View style={styles.editHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to types"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={onLeave}
          style={({ pressed }) => [
            styles.editButton,
            pressed || saving ? styles.pressed : null,
          ]}
        >
          <BackGlyph color={tokens.color.text.foreground} size={20} />
        </Pressable>
        <BottomSheetTextInput
          value={name}
          onChangeText={onNameChange}
          accessibilityLabel="Name"
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={nameMaxLength}
          returnKeyType="done"
          onSubmitEditing={onLeave}
          style={[styles.search, styles.editName]}
        />
      </View>
      {children ? <View style={styles.editFields}>{children}</View> : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, styles.editFields]}
        >
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={TYPE_DELETE}
        accessibilityState={{ disabled: deleting }}
        disabled={deleting}
        onPress={() => {
          void confirmAlert({
            title: `Delete “${name}”?`,
            body: deleteBody,
            confirmLabel: "Delete",
            destructive: true,
          }).then((confirmed) => {
            if (confirmed) onDelete();
          });
        }}
        style={({ pressed }) => [
          styles.deleteRow,
          pressed || deleting ? styles.pressed : null,
        ]}
      >
        <TrashGlyph color={tokens.color.semantic.destructive} size={18} />
        <Text style={styles.deleteText}>{TYPE_DELETE}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The state every caller's edit view keeps: a save-and-leave that skips an
 * unchanged draft and says a refused save in place, and a delete that leaves
 * once it lands. The phone twin of web's `useTypeEditor`.
 */
export function useTypeSheetEditor({
  handle,
  changed,
  save,
  remove,
}: {
  handle: TypeSheetEditorHandle;
  changed: boolean;
  /** Saves the draft; returns an inline refusal, or null once saved. */
  save: () => Promise<string | null>;
  remove: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function leave() {
    if (saving) return;
    if (!changed) {
      handle.done();
      return;
    }
    setSaving(true);
    try {
      const refused = await save();
      if (refused) setError(refused);
      else handle.done();
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't save the type. Try again."));
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    handle.setLeave(() => void leave());
  });

  async function onDelete() {
    setDeleting(true);
    try {
      await remove();
      handle.done();
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't delete the type. Try again."));
    } finally {
      setDeleting(false);
    }
  }

  return {
    error,
    clearError: () => setError(null),
    saving,
    deleting,
    leave: () => void leave(),
    onDelete: () => void onDelete(),
  };
}

function createStyles(tokens: SignetTokens, accent?: string) {
  const body = typeRole(tokens.typography.role.body);
  return StyleSheet.create({
    pressed: {
      opacity: 0.6,
    },
    listContent: {
      paddingBottom: tokens.spacing.xl,
    },
    listHeader: {
      gap: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.sm,
      backgroundColor: tokens.color.surface.popover,
    },
    search: sheetFieldStyles(tokens, accent ?? tokens.color.text.foreground)
      .field,
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    caption: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.sm,
    },
    typeRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: tokens.touch.minimum + tokens.spacing.xs,
      paddingLeft: tokens.spacing.lg,
      paddingRight: tokens.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.color.border.hairline,
    },
    pickArea: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      alignSelf: "stretch",
      paddingRight: tokens.spacing.sm,
    },
    check: {
      width: 18,
    },
    typeName: {
      ...body,
      flex: 1,
      color: tokens.color.text.foreground,
    },
    muted: {
      color: tokens.color.text.muted,
    },
    typeSets: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    editButton: {
      width: tokens.touch.minimum,
      height: tokens.touch.minimum,
      alignItems: "center",
      justifyContent: "center",
    },
    editPane: {
      gap: tokens.spacing.md,
      paddingTop: tokens.spacing.sm,
    },
    editHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      paddingLeft: tokens.spacing.sm,
      paddingRight: tokens.spacing.lg,
    },
    editName: {
      flex: 1,
    },
    editFields: {
      gap: tokens.spacing.sm,
      paddingLeft: tokens.spacing.sm + tokens.touch.minimum + tokens.spacing.xs,
      paddingRight: tokens.spacing.lg,
    },
    deleteRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      minHeight: tokens.touch.minimum,
      paddingHorizontal: tokens.spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.color.border.hairline,
    },
    deleteText: {
      ...body,
      color: tokens.color.semantic.destructive,
    },
  });
}
