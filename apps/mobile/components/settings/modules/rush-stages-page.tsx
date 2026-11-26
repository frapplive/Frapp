import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import {
  rushPipelineAccess,
  usePermissionList,
  useRushPipeline,
  useSaveRushStages,
  type RushStage,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import type { StageDraft } from "@repo/hooks/rush-stage-drafts";
import { useRushStageEditor } from "@repo/hooks/use-rush-stage-editor";
import {
  RUSH_SETTINGS_COPY,
  RUSH_STAGE_CATEGORIES,
  RUSH_STAGE_CATEGORY_LABELS,
  RUSH_STAGE_LABEL_MAX,
  type RushStageCategory,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { DragHandleGlyph, PlusGlyph } from "@/components/control-glyphs";
import { InlineNote } from "@/components/inline-note";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { FormHint } from "@/components/settings/chapter-form";
import { SkeletonRegion } from "@/components/state-block";
import { Toggle } from "@/components/toggle";
import {
  agendaDropIndex,
  agendaRowShift,
  type AgendaRowBox,
} from "@/lib/events/agenda-drag";
import { pressHaptic, selectionHaptic } from "@/lib/haptics";
import { useRaisedSurfaces } from "@/lib/surfaces";
import { fieldTypeRole, typeRole, useFrappTheme } from "@/lib/theme";

const COPY = RUSH_SETTINGS_COPY.stages;

/** How long the rows a held stage passes take to slide apart. */
const SHIFT_MS = 150;

let newRow = 0;

/**
 * Recruitment → Stages on the phone (#6030), web's `RushStageEditor`: the
 * stages grouped by the six fixed categories, each renamed in place, shown
 * or hidden on the board, and dragged into order within its category by its
 * grip (rulebook § 3: the held row lifts, the rest slide apart; Move up and
 * Move down for a screen reader). A stage never leaves its category, because
 * automatic moves go by category, not by name.
 *
 * It saves on its own (rulebook § 9), through `useRushStageEditor`, which
 * web's editor shares: the whole list once the API's own check passes, one
 * save at a time; a change it refuses stays on screen with the reason under
 * the list, and a failed save says why there too. `rush:manage` edits;
 * anyone else who can open the pipeline reads.
 */
export function RushStagesPage({
  onDragging,
}: {
  /** A stage is held: the screen stops its own scroll so the drag isn't taken. */
  onDragging: (dragging: boolean) => void;
}) {
  const access = rushPipelineAccess(usePermissionList());
  const pipeline = useRushPipeline({ enabled: access.view });
  if (pipeline.isError && !pipeline.data) {
    return <InlineNote tone="warning">{COPY.loadFailed}</InlineNote>;
  }
  if (!pipeline.data) {
    return (
      <SkeletonRegion label="Loading the stages">
        <ListSection>
          {[0, 1, 2, 3].map((index) => (
            <ListRowSkeleton key={index} index={index} />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }
  return (
    <StageEditor
      stages={pipeline.data.stages}
      canEdit={access.manage}
      onDragging={onDragging}
    />
  );
}

function StageEditor({
  stages,
  canEdit,
  onDragging,
}: {
  stages: readonly RushStage[];
  canEdit: boolean;
  onDragging: (dragging: boolean) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const [failure, setFailure] = useState<string | null>(null);
  const save = useSaveRushStages();
  const editor = useRushStageEditor(stages, save, (error) =>
    setFailure(`${COPY.failed}. ${errorCopy(error, "Retry in a moment.")}`),
  );
  const { drafts, problem } = editor;
  function change(next: StageDraft[]) {
    setFailure(null);
    editor.change(next);
  }

  return (
    <>
      <FormHint>{canEdit ? COPY.editHint : COPY.hint}</FormHint>
      {RUSH_STAGE_CATEGORIES.map((category) => (
        <CategoryStages
          key={category}
          category={category}
          drafts={drafts}
          canEdit={canEdit}
          onDragging={onDragging}
          onChange={change}
        />
      ))}
      {problem || failure ? (
        <Text accessibilityLiveRegion="polite" style={styles.problem}>
          {problem ?? failure}
        </Text>
      ) : null}
    </>
  );
}

function CategoryStages({
  category,
  drafts,
  canEdit,
  onDragging,
  onChange,
}: {
  category: RushStageCategory;
  drafts: StageDraft[];
  canEdit: boolean;
  onDragging: (dragging: boolean) => void;
  onChange: (next: StageDraft[]) => void;
}) {
  const { tokens } = useFrappTheme();
  const surfaces = useRaisedSurfaces();
  const styles = createStyles(tokens);
  const [adding, setAdding] = useState(false);
  const own = useMemo(
    () => drafts.filter((draft) => draft.category === category),
    [drafts, category],
  );
  const label = RUSH_STAGE_CATEGORY_LABELS[category];
  const sortable = canEdit && own.length > 1;

  const boxes = useSharedValue<AgendaRowBox[]>([]);
  const heldIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  // The held row goes back to zero only once the list has redrawn in its new
  // order, so it doesn't flash at its old place first.
  const resetPending = useRef(false);
  useLayoutEffect(() => {
    if (!resetPending.current) return;
    resetPending.current = false;
    heldIndex.set(-1);
    dragY.set(0);
  }, [own, heldIndex, dragY]);

  const replace = (rowKey: string, patch: Partial<StageDraft>) =>
    onChange(
      drafts.map((draft) =>
        draft.rowKey === rowKey ? { ...draft, ...patch } : draft,
      ),
    );
  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || !own[from] || !own[to]) return false;
      const moved = [...own];
      const [row] = moved.splice(from, 1);
      if (!row) return false;
      moved.splice(to, 0, row);
      onChange([
        ...drafts.filter((draft) => draft.category !== category),
        ...moved,
      ]);
      return true;
    },
    [own, drafts, category, onChange],
  );
  const onDragStart = useCallback(() => {
    pressHaptic();
    onDragging(true);
  }, [onDragging]);
  const onDrop = useCallback(
    (from: number, to: number) => {
      onDragging(false);
      if (move(from, to)) {
        selectionHaptic();
        resetPending.current = true;
        return;
      }
      heldIndex.set(-1);
      dragY.set(0);
    },
    [move, onDragging, heldIndex, dragY],
  );
  const measure = useCallback(
    (index: number, box: AgendaRowBox) => {
      const next = boxes.get().slice(0, own.length);
      next[index] = box;
      boxes.set(next);
    },
    [boxes, own.length],
  );

  return (
    <>
      <SectionHeader>{label}</SectionHeader>
      {/* Its own panel rather than `ListSection`, whose wrappers would draw a
          held row under the rows after it: here every row is a sibling. */}
      <View style={[styles.panel, { backgroundColor: surfaces.card }]}>
        {own.map((draft, index) => (
          <StageRow
            key={draft.rowKey}
            draft={draft}
            index={index}
            count={own.length}
            canEdit={canEdit}
            sortable={sortable}
            boxes={boxes}
            heldIndex={heldIndex}
            dragY={dragY}
            onMeasure={measure}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onMove={(to) => move(index, to)}
            onRename={(next) => replace(draft.rowKey, { label: next })}
            onShow={(shown) => replace(draft.rowKey, { hidden: !shown })}
          />
        ))}
        {canEdit ? (
          adding ? (
            <View style={[styles.row, own.length > 0 ? styles.divided : null]}>
              <NameField
                label=""
                autoFocus
                placeholder={COPY.newStage(label)}
                onCommit={(next) => {
                  setAdding(false);
                  onChange([
                    ...drafts,
                    {
                      rowKey: `new-${(newRow += 1)}`,
                      label: next,
                      category,
                      hidden: false,
                    },
                  ]);
                }}
                onCancel={() => setAdding(false)}
              />
            </View>
          ) : (
            <View style={own.length > 0 ? styles.divided : null}>
              <ListRow
                label={COPY.add}
                leading={
                  <PlusGlyph color={tokens.color.text.mutedForeground} />
                }
                accessibilityHint={`Adds a ${label.toLowerCase()} stage.`}
                onPress={() => setAdding(true)}
              />
            </View>
          )
        ) : null}
      </View>
    </>
  );
}

/** One stage: its grip, its name, and whether the board shows it. */
function StageRow({
  draft,
  index,
  count,
  canEdit,
  sortable,
  boxes,
  heldIndex,
  dragY,
  onMeasure,
  onDragStart,
  onDrop,
  onMove,
  onRename,
  onShow,
}: {
  draft: StageDraft;
  index: number;
  count: number;
  canEdit: boolean;
  sortable: boolean;
  boxes: SharedValue<AgendaRowBox[]>;
  heldIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  onMeasure: (index: number, box: AgendaRowBox) => void;
  onDragStart: () => void;
  onDrop: (from: number, to: number) => void;
  onMove: (to: number) => void;
  onRename: (label: string) => void;
  onShow: (shown: boolean) => void;
}) {
  const { tokens } = useFrappTheme();
  const surfaces = useRaisedSurfaces();
  const styles = createStyles(tokens);
  const rowFill = surfaces.card;
  const liftedFill = tokens.color.surface.popover;

  const animated = useAnimatedStyle(() => {
    const held = heldIndex.get();
    if (held === index) {
      return {
        transform: [{ translateY: dragY.get() }, { scale: 1.02 }],
        zIndex: 10,
        backgroundColor: liftedFill,
      };
    }
    const shift =
      held >= 0
        ? agendaRowShift(
            boxes.get(),
            held,
            agendaDropIndex(boxes.get(), held, dragY.get()),
            index,
          )
        : 0;
    return {
      transform: [
        {
          translateY: held >= 0 ? withTiming(shift, { duration: SHIFT_MS }) : 0,
        },
        { scale: 1 },
      ],
      zIndex: 0,
      backgroundColor: rowFill,
    };
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          heldIndex.set(index);
          dragY.set(0);
          runOnJS(onDragStart)();
        })
        .onUpdate((event) => {
          dragY.set(event.translationY);
        })
        .onFinalize(() => {
          const to = agendaDropIndex(boxes.get(), index, dragY.get());
          runOnJS(onDrop)(index, to);
        }),
    [index, boxes, heldIndex, dragY, onDragStart, onDrop],
  );

  return (
    <Animated.View
      onLayout={(event) =>
        onMeasure(index, {
          y: event.nativeEvent.layout.y,
          h: event.nativeEvent.layout.height,
        })
      }
      style={[styles.row, index > 0 ? styles.divided : null, animated]}
      {...(sortable
        ? {
            accessibilityActions: [
              ...(index > 0 ? [{ name: "moveUp", label: "Move up" }] : []),
              ...(index < count - 1
                ? [{ name: "moveDown", label: "Move down" }]
                : []),
            ],
            onAccessibilityAction: (event: AccessibilityActionEvent) => {
              if (event.nativeEvent.actionName === "moveUp") onMove(index - 1);
              if (event.nativeEvent.actionName === "moveDown")
                onMove(index + 1);
            },
          }
        : {})}
    >
      {sortable ? (
        <GestureDetector gesture={pan}>
          <View
            style={styles.grip}
            hitSlop={8}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <DragHandleGlyph
              color={tokens.color.text.mutedForeground}
              size={18}
            />
          </View>
        </GestureDetector>
      ) : null}
      {canEdit ? (
        <NameField
          // A rename from elsewhere replaces what the field shows.
          key={`${draft.rowKey}:${draft.label}`}
          label={draft.label}
          onCommit={onRename}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={[styles.name, draft.hidden ? styles.nameHidden : null]}
        >
          {draft.label}
        </Text>
      )}
      {canEdit ? (
        <Toggle
          value={!draft.hidden}
          onValueChange={onShow}
          accessibilityLabel={COPY.show(draft.label)}
        />
      ) : draft.hidden ? (
        <Text style={styles.hidden}>{COPY.hidden}</Text>
      ) : null}
    </Animated.View>
  );
}

/**
 * A name typed in place, saved on Done or leaving the field; an empty or
 * unchanged one puts the old name back (web's `InlineNameField`). Done and
 * the blur that follows it send once; a save the server refused can be sent
 * again from the field, since the name it keeps is still the officer's edit.
 */
export function NameField({
  label,
  placeholder,
  autoFocus = false,
  maxLength = RUSH_STAGE_LABEL_MAX,
  onCommit,
  onCancel,
}: {
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  onCommit: (label: string) => void;
  onCancel?: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const [text, setText] = useState(label);
  // What this visit to the field already sent, so Done's blur doesn't send
  // it twice; a new visit (focus) or a new edit clears it.
  const sent = useRef<string | null>(null);
  function commit() {
    const next = text.trim();
    if (!next || next === label) {
      setText(label);
      onCancel?.();
      return;
    }
    if (sent.current === next) return;
    sent.current = next;
    onCommit(next);
  }
  return (
    <TextInput
      value={text}
      onChangeText={(next) => {
        sent.current = null;
        setText(next);
      }}
      onFocus={() => {
        sent.current = null;
      }}
      onBlur={commit}
      onSubmitEditing={commit}
      autoFocus={autoFocus}
      placeholder={placeholder}
      placeholderTextColor={tokens.color.text.muted}
      maxLength={maxLength}
      returnKeyType="done"
      accessibilityLabel={label ? `Name of ${label}` : placeholder}
      style={styles.field}
    />
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    panel: {
      borderRadius: tokens.radius.card,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.sm,
      minHeight: tokens.touch.minimum,
    },
    divided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.color.border.hairline,
    },
    grip: {
      width: tokens.spacing.xl,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
    },
    field: {
      ...fieldTypeRole(tokens.typography.role.label),
      flex: 1,
      color: tokens.color.text.foreground,
      paddingVertical: tokens.spacing.xs,
    },
    name: {
      ...typeRole(tokens.typography.role.label),
      flex: 1,
      color: tokens.color.text.foreground,
    },
    nameHidden: { color: tokens.color.text.mutedForeground },
    hidden: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    problem: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
