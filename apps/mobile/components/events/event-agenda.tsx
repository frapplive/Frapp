import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
  type TextInputProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { codeOf, randomClientId } from "@repo/api-sdk";
import {
  useAgendaSuggestionActions,
  useAgendaSuggestions,
  useCurrentChapter,
  useEventListsEditor,
  type EventLists,
} from "@repo/hooks";
import {
  AGENDA_CHECK_OFF_LOCKED_COPY,
  AGENDA_LOCKED_COPY,
  AGENDA_SUGGESTION_COPY,
  agendaFromMinutesLabel,
  agendaTabledFromLabel,
  agendaProblem,
  EVENT_AGENDA_ITEM_MAX,
  EVENT_AGENDA_MAX,
  isModuleEnabled,
  normalizeAgendaText,
  reorderEventEntry,
  toggleAgendaItem,
  type AgendaSuggestion,
  type EventAgendaItem,
  type EventAgendaTabledFrom,
  type EventAttachment,
} from "@repo/validation";
import type { SignetTokens } from "@repo/theme/signet";
import { IconButton } from "@/components/icon-button";
import { ListPanel } from "@/components/list-section";
import {
  CheckGlyph,
  CloseGlyph,
  DragHandleGlyph,
  PlusGlyph,
} from "@/components/control-glyphs";
import { TextAction } from "@/components/events/event-excuses";
import { FrappLinksEditor } from "@/components/frapp-links";
import { sheetFieldStyles } from "@/components/sheet-scaffold";
import { eyebrowStyle } from "@/components/eyebrow";
import { useChapterBranding } from "@/lib/chapter-branding";
import {
  agendaDropIndex,
  agendaRowShift,
  type AgendaRowBox,
} from "@/lib/events/agenda-drag";
import { pressHaptic, selectionHaptic } from "@/lib/haptics";
import { useConnection } from "@/lib/connection/use-connection";
import { useKeepAboveKeyboard } from "@/lib/keep-above-keyboard";
import { tint, typeRole, useFrappTheme } from "@/lib/theme";

/**
 * An event's agenda and attachments on Event details (#4934,
 * `spec/behavior/events.md` § Agenda and attachments), web's
 * `event-agenda.tsx` on the phone. Everyone who can see the event reads
 * them, and a section with nothing in it is left out for a member. An
 * `events:update` holder edits them in place on the screen, the way Notion's
 * and Fellow's meeting agendas are a checklist on the meeting rather than a
 * field in a form: a check-off during the meeting is one tap. Both lists
 * share one editor (`useEventListsEditor`), so a run of quick changes goes
 * out as one save of this meeting's whole lists, never the series'.
 */

/** How fast the rows a held item passes slide out of its way. */
const SHIFT_MS = 150;

/** Whether Chapter Files is on: `null` while the chapter read can't say. */
type DocumentsModule = boolean | null;

/** Chapter Files on, off, or not known yet (the chapter still loading). */
function useDocumentsModule(): DocumentsModule {
  const chapter = useCurrentChapter().data;
  return chapter ? isModuleEnabled(chapter.enabled_modules, "documents") : null;
}

export function EventMeetingLists({
  eventId,
  lists,
  canEdit,
  checkOffOpen,
  upcoming,
  onDragging,
}: {
  eventId: string;
  lists: EventLists;
  /** Holds `events:update` (a real answer), and the event is there. */
  canEdit: boolean;
  /**
   * The meeting has started (`agendaCheckOffOpen`): items can be ticked, and
   * no longer added, moved or removed.
   */
  checkOffOpen: boolean;
  /** An agenda row is held: the screen stops scrolling under it. */
  onDragging?: (dragging: boolean) => void;
  /**
   * The meeting hasn't ended and the chapter has minutes on. Suggested
   * shows only while this holds and the meeting hasn't started either.
   */
  upcoming: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  // A write that would be lost (offline, a lapsed chapter): the lists still
  // read, but no control is offered that would only be refused.
  const { writeBlockedReason } = useConnection();
  const editable = canEdit && writeBlockedReason === null;
  const documentsOn = useDocumentsModule();
  // A refusal says what happened: a meeting that started meanwhile has
  // locked its agenda, which no retry gets past.
  const [failed, setFailed] = useState<"locked" | "other" | null>(null);
  const editor = useEventListsEditor(eventId, lists, {
    onFailed: (error) =>
      setFailed(codeOf(error) === "event.agenda_locked" ? "locked" : "other"),
  });
  const change: typeof editor.change = (field, update) => {
    setFailed(null);
    editor.change(field, update);
  };
  // While an Add is out the agenda's controls wait: the server is writing
  // the list, and an edit now would send the copy without the new item.
  const [adding, setAdding] = useState(false);
  return (
    <>
      <EventAgendaSection
        agenda={editor.agenda}
        canEdit={editable}
        checkOffOpen={checkOffOpen}
        itemsLocked={checkOffOpen}
        locked={adding}
        onDragging={onDragging}
        onChange={(update) => change("agenda", update)}
      />
      {/* Suggestions add items, so they go once the agenda is locked. */}
      {editable && upcoming && !checkOffOpen ? (
        <AgendaSuggestions
          eventId={eventId}
          full={editor.agenda.length >= EVENT_AGENDA_MAX}
          settleAgenda={editor.settle}
          onAdding={setAdding}
        />
      ) : null}
      <EventAttachmentsSection
        attachments={editor.attachments}
        canEdit={editable}
        documentsOn={documentsOn}
        onChange={(update) => change("attachments", update)}
      />
      {failed ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {failed === "locked"
            ? AGENDA_LOCKED_COPY
            : "Couldn't save the agenda or attachments. Your last change was undone, so try it again in a moment."}
        </Text>
      ) : null}
    </>
  );
}

function EventAgendaSection({
  agenda,
  canEdit,
  checkOffOpen = true,
  checkable = true,
  itemsLocked = false,
  locked = false,
  bare = false,
  input: Input = TextInput,
  draft: heldDraft,
  onDraftChange,
  onDragging,
  onChange,
}: {
  agenda: EventAgendaItem[];
  canEdit: boolean;
  /** The meeting has started; before then the checkboxes wait. */
  checkOffOpen?: boolean;
  /** Draw checkboxes at all (not on the New event sheet's list). */
  checkable?: boolean;
  /**
   * The meeting has started: items are checked off but no longer added,
   * moved or removed (Paul 2026-11-20, "lock agenda edits once the meeting
   * has started"). The API refuses such a change too. Web's twin is the same.
   */
  itemsLocked?: boolean;
  /** The controls show but wait (a suggestion is being added). */
  locked?: boolean;
  /** No eyebrow: the form's row names the list. */
  bare?: boolean;
  /** A sheet passes `BottomSheetTextInput`, which its keyboard handling needs. */
  input?: ComponentType<TextInputProps>;
  /**
   * The add field's text, when the caller holds it: a form sends a line
   * typed but never entered (`agendaWithPending`).
   */
  draft?: string;
  onDraftChange?: (draft: string) => void;
  /** A row is held: a screen stops its own scroll so the drag isn't taken. */
  onDragging?: (dragging: boolean) => void;
  onChange: (update: (current: EventAgendaItem[]) => EventAgendaItem[]) => void;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  // Who may add, move and remove items: an editor, until the meeting starts.
  const reshape = canEdit && !itemsLocked;
  const [ownDraft, setOwnDraft] = useState("");
  const draft = heldDraft ?? ownDraft;
  const setDraft = onDraftChange ?? setOwnDraft;
  const [problem, setProblem] = useState<string | null>(null);
  // The field and its error line stay above the keyboard while it is up,
  // and each item added pushes the field down a row, so it scrolls with
  // them and the item just added shows above it (#5463).
  const { hold, ...keep } = useKeepAboveKeyboard();
  // Each row's measured place (rows wrap, so they differ in height), the row
  // held, and how far it has been dragged: read on the UI thread.
  const boxes = useSharedValue<AgendaRowBox[]>([]);
  const heldIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  // The held row's offset goes back to zero only once the list has redrawn
  // in its new order, so the row doesn't flash at its old place first.
  const resetPending = useRef(false);
  useLayoutEffect(() => {
    if (!resetPending.current) return;
    resetPending.current = false;
    heldIndex.set(-1);
    dragY.set(0);
  }, [agenda, heldIndex, dragY]);

  const move = useCallback(
    (from: number, to: number) => {
      // By id, against the list as it stands when the update runs: a save
      // or a suggestion may have landed since this one was drawn.
      const moved = agenda[from]?.id;
      const onto = agenda[to]?.id;
      if (!moved || !onto || moved === onto) return false;
      onChange((current) =>
        reorderEventEntry(
          current,
          current.findIndex((entry) => entry.id === moved),
          current.findIndex((entry) => entry.id === onto),
        ),
      );
      return true;
    },
    [agenda, onChange],
  );
  // Whether a row is held, so a screen whose scroll the drag turned off gets
  // it back if the list goes (offline, the event deleted) mid-drag.
  const held = useRef(false);
  useEffect(
    () => () => {
      if (held.current) onDragging?.(false);
    },
    [onDragging],
  );
  useEffect(() => {
    // The grips went (offline, a lapsed chapter) under a held row.
    if (reshape || !held.current) return;
    held.current = false;
    heldIndex.set(-1);
    dragY.set(0);
    onDragging?.(false);
  }, [reshape, onDragging, heldIndex, dragY]);
  const onDragStart = useCallback(() => {
    pressHaptic();
    held.current = true;
    onDragging?.(true);
  }, [onDragging]);
  const onDrop = useCallback(
    (from: number, to: number) => {
      held.current = false;
      onDragging?.(false);
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
      const next = boxes.get().slice(0, agenda.length);
      next[index] = box;
      boxes.set(next);
    },
    [boxes, agenda.length],
  );

  if (agenda.length === 0 && !reshape) return null;

  const full = agenda.length >= EVENT_AGENDA_MAX;
  const done = agenda.filter((item) => item.done).length;
  const showChecks = canEdit && checkable;
  // Said once, not on every box: nothing to check off before the start.
  const waiting = showChecks && !checkOffOpen && agenda.length > 0;

  function add() {
    const text = normalizeAgendaText(draft);
    if (!text) return;
    const refused = agendaProblem([...agenda, { text }]);
    if (refused) {
      setProblem(refused);
      return;
    }
    setProblem(null);
    setDraft("");
    onChange((current) => [
      ...current,
      { id: randomClientId(), text, done: false },
    ]);
  }

  return (
    <View style={styles.section} accessibilityLabel="Agenda">
      {bare ? null : (
        <View style={styles.headerRow}>
          <Text style={styles.sectionLabel}>AGENDA</Text>
          {agenda.length > 0 && checkOffOpen && checkable ? (
            <Text style={styles.caption}>
              {done} of {agenda.length} done
            </Text>
          ) : null}
        </View>
      )}
      <SectionBody bare={bare}>
        {waiting ? (
          <Text style={styles.caption}>{AGENDA_CHECK_OFF_LOCKED_COPY}</Text>
        ) : null}
        {agenda.length > 0 ? (
          <View style={styles.list}>
            {agenda.map((item, index) => (
              <AgendaRow
                key={item.id}
                item={item}
                index={index}
                count={agenda.length}
                canEdit={reshape}
                showCheck={showChecks}
                checkOffOpen={checkOffOpen}
                locked={locked}
                boxes={boxes}
                heldIndex={heldIndex}
                dragY={dragY}
                onMeasure={measure}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onMove={(to) => move(index, to)}
                onToggle={() =>
                  onChange((current) => toggleAgendaItem(current, item.id))
                }
                onRemove={() =>
                  onChange((current) =>
                    current.filter((entry) => entry.id !== item.id),
                  )
                }
              />
            ))}
          </View>
        ) : null}
        {reshape && !full ? (
          <View ref={hold} onLayout={keep.onLayout} style={styles.section}>
            <View style={styles.addLine}>
              <PlusGlyph color={tokens.color.text.mutedForeground} size={16} />
              {/* Return adds the item and keeps the keyboard up for the next,
                as a checklist in Reminders or Notion does: no Add button to
                aim for between items. */}
              <Input
                value={draft}
                onChangeText={(text) => {
                  setDraft(text);
                  setProblem(null);
                  keep.onType();
                }}
                onFocus={keep.onFocus}
                onBlur={keep.onBlur}
                placeholder={
                  agenda.length === 0 ? "Add the first item" : "Add an item"
                }
                placeholderTextColor={tokens.color.text.muted}
                accessibilityLabel="Add an agenda item"
                editable={!locked}
                maxLength={EVENT_AGENDA_ITEM_MAX}
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={add}
                style={styles.addField}
              />
            </View>
            {problem ? <Text style={styles.error}>{problem}</Text> : null}
          </View>
        ) : problem ? (
          <Text style={styles.error}>{problem}</Text>
        ) : null}
        {reshape && full ? (
          <Text style={styles.caption}>
            An agenda holds {EVENT_AGENDA_MAX} items.
          </Text>
        ) : null}
      </SectionBody>
    </View>
  );
}

/**
 * An agenda's items on the raised surface on Event details, and bare in the
 * New event sheet, whose framed row already holds them.
 */
function SectionBody({
  bare,
  children,
}: {
  bare: boolean;
  children: ReactNode;
}) {
  return bare ? <>{children}</> : <ListPanel>{children}</ListPanel>;
}

/**
 * One agenda item: a grip to drag it by (an editor's), its checkbox (or its
 * number), its text, and a remove X. VoiceOver and TalkBack move it with
 * the row's Move up and Move down actions, as Arrange channels' rows do.
 */
function AgendaRow({
  item,
  index,
  count,
  canEdit,
  showCheck,
  checkOffOpen,
  locked,
  boxes,
  heldIndex,
  dragY,
  onMeasure,
  onDragStart,
  onDrop,
  onMove,
  onToggle,
  onRemove,
}: {
  item: EventAgendaItem;
  index: number;
  count: number;
  canEdit: boolean;
  showCheck: boolean;
  checkOffOpen: boolean;
  locked: boolean;
  boxes: SharedValue<AgendaRowBox[]>;
  heldIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  onMeasure: (index: number, box: AgendaRowBox) => void;
  onDragStart: () => void;
  onDrop: (from: number, to: number) => void;
  onMove: (to: number) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const muted = tokens.color.text.mutedForeground;
  // A plain string for the worklet, not the whole token tree.
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
      backgroundColor: "transparent",
    };
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .enabled(!locked)
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
    [index, locked, boxes, heldIndex, dragY, onDragStart, onDrop],
  );

  const text = (
    <View style={styles.textColumn}>
      <Text style={[styles.text, item.done ? styles.textDone : null]}>
        {item.text}
      </Text>
      {item.tabled_from ? <TabledFromLink from={item.tabled_from} /> : null}
    </View>
  );

  return (
    <Animated.View
      onLayout={(event) =>
        onMeasure(index, {
          y: event.nativeEvent.layout.y,
          h: event.nativeEvent.layout.height,
        })
      }
      style={[styles.line, styles.agendaLine, animated]}
      {...(canEdit
        ? {
            accessibilityActions: [
              ...(index > 0 ? [{ name: "moveUp", label: "Move up" }] : []),
              ...(index < count - 1
                ? [{ name: "moveDown", label: "Move down" }]
                : []),
            ],
            onAccessibilityAction: (event: AccessibilityActionEvent) => {
              if (locked) return;
              if (event.nativeEvent.actionName === "moveUp") onMove(index - 1);
              if (event.nativeEvent.actionName === "moveDown")
                onMove(index + 1);
            },
          }
        : {})}
    >
      {canEdit ? (
        <GestureDetector gesture={pan}>
          <View
            style={styles.grip}
            hitSlop={8}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <DragHandleGlyph color={muted} size={18} />
          </View>
        </GestureDetector>
      ) : null}
      {showCheck ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: item.done,
            disabled: locked || !checkOffOpen,
          }}
          accessibilityHint={
            checkOffOpen ? undefined : AGENDA_CHECK_OFF_LOCKED_COPY
          }
          disabled={locked || !checkOffOpen}
          accessibilityLabel={item.text}
          onPress={onToggle}
          style={styles.row}
        >
          <View
            style={[
              styles.box,
              item.done ? styles.boxDone : null,
              checkOffOpen ? null : styles.boxWaiting,
            ]}
          >
            {item.done ? <CheckGlyph color={muted} size={12} /> : null}
          </View>
          {text}
        </Pressable>
      ) : (
        <View
          style={styles.row}
          accessible
          accessibilityLabel={
            item.done ? `Done: ${item.text}` : `${index + 1}. ${item.text}`
          }
        >
          <Text style={styles.number}>{index + 1}.</Text>
          {text}
        </View>
      )}
      {canEdit ? (
        <IconButton
          label={`Remove "${item.text}"`}
          disabled={locked}
          onPress={onRemove}
        >
          <CloseGlyph color={muted} />
        </IconButton>
      ) : null}
    </Animated.View>
  );
}

/**
 * The New event sheet's Agenda row (Paul 2026-11-19, "where is the ability
 * to add agenda items"): the same list Event details draws, typed before the
 * event exists and sent with Create. Nothing to check off yet. Web's
 * `AgendaDraftList`.
 */
export function AgendaDraftList({
  agenda,
  onChange,
  draft,
  onDraftChange,
  disabled = false,
  input,
  onDragging,
}: {
  agenda: EventAgendaItem[];
  onChange: (next: EventAgendaItem[]) => void;
  /** The add field's text: Create sends it even if Return wasn't pressed. */
  draft: string;
  onDraftChange: (draft: string) => void;
  disabled?: boolean;
  input?: ComponentType<TextInputProps>;
  /** A row is held: the sheet stops its own pan and scroll. */
  onDragging?: (dragging: boolean) => void;
}) {
  return (
    <EventAgendaSection
      agenda={agenda}
      canEdit
      checkable={false}
      locked={disabled}
      bare
      input={input}
      draft={draft}
      onDraftChange={onDraftChange}
      onDragging={onDragging}
      onChange={(update) => onChange(update(agenda))}
    />
  );
}

/**
 * "Tabled from Tuesday, November 11 · 2nd time" under an agenda item or a
 * suggestion (#5534), opening the minutes of that day. Web's
 * `TabledFromLink`; the minutes open only for their audience.
 */
function TabledFromLink({ from }: { from: EventAgendaTabledFrom }) {
  const label = agendaTabledFromLabel(from);
  if (!label) return null;
  return <MinutesLink meetingId={from.meeting_id} label={label} />;
}

/**
 * A line under an item that opens the minutes it came from: "Tabled from
 * {day}", or "From the minutes of {day}" for an action item sent on (#5790).
 */
function MinutesLink({
  meetingId,
  label,
}: {
  meetingId: string;
  label: string;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() =>
        router.push({
          pathname: "/minutes-details",
          params: { id: meetingId },
        })
      }
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Text style={styles.caption}>{label}</Text>
    </Pressable>
  );
}

/**
 * Suggested agenda items (#5534) under the agenda, for whoever can edit it:
 * web's `AgendaSuggestions`. Tabled matters from earlier meetings with the
 * same people first, then the model's; each row has Add and Dismiss, the way
 * Fellow suggests talking points under a meeting's agenda. Nothing shows
 * when there's nothing to suggest.
 */
function AgendaSuggestions({
  eventId,
  full,
  settleAgenda,
  onAdding,
}: {
  eventId: string;
  full: boolean;
  /** Wait for the agenda's own saves to land (the editor's `settle`). */
  settleAgenda: () => Promise<void>;
  onAdding: (adding: boolean) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const muted = tokens.color.text.mutedForeground;
  const list = useAgendaSuggestions(eventId);
  const actions = useAgendaSuggestionActions(eventId, {
    flushAgenda: settleAgenda,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (list.suggestions.length === 0 && !list.writing && !list.refreshFailed) {
    return null;
  }

  async function act(row: AgendaSuggestion, action: "add" | "dismiss") {
    setBusy(row.id);
    setFailed(null);
    if (action === "add") onAdding(true);
    try {
      await actions[action](row.id);
    } catch {
      setFailed(
        action === "add"
          ? AGENDA_SUGGESTION_COPY.addFailed
          : AGENDA_SUGGESTION_COPY.dismissFailed,
      );
    } finally {
      setBusy(null);
      if (action === "add") onAdding(false);
    }
  }

  return (
    <View style={styles.section} accessibilityLabel="Suggested">
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>
          {AGENDA_SUGGESTION_COPY.heading.toUpperCase()}
        </Text>
        {list.aiAvailable && !list.writing ? (
          <TextAction
            compact
            label={AGENDA_SUGGESTION_COPY.refresh}
            onPress={list.refresh}
          />
        ) : null}
      </View>
      {list.suggestions.map((row) => (
        <View key={row.id} style={styles.line}>
          <View style={[styles.row, styles.textColumn]}>
            <Text style={styles.text}>{row.text}</Text>
            {row.tabled_from ? (
              <TabledFromLink from={row.tabled_from} />
            ) : row.from_minutes ? (
              <MinutesLink
                meetingId={row.from_minutes.meeting_id}
                label={agendaFromMinutesLabel(row.from_minutes)}
              />
            ) : row.reason ? (
              <Text style={styles.caption}>{row.reason}</Text>
            ) : null}
          </View>
          <View style={styles.controls}>
            <TextAction
              compact
              label={AGENDA_SUGGESTION_COPY.add}
              hint={AGENDA_SUGGESTION_COPY.addLabel(row.text)}
              disabled={full || busy !== null}
              onPress={() => void act(row, "add")}
            />
            <IconButton
              label={AGENDA_SUGGESTION_COPY.dismissLabel(row.text)}
              disabled={busy !== null}
              onPress={() => void act(row, "dismiss")}
            >
              <CloseGlyph color={muted} />
            </IconButton>
          </View>
        </View>
      ))}
      {list.writing ? (
        <View style={styles.headerRow}>
          <ActivityIndicator size="small" color={muted} />
          <Text style={styles.caption}>{AGENDA_SUGGESTION_COPY.writing}</Text>
        </View>
      ) : null}
      {full && list.suggestions.length > 0 ? (
        <Text style={styles.caption}>
          {AGENDA_SUGGESTION_COPY.full(EVENT_AGENDA_MAX)}
        </Text>
      ) : null}
      {list.refreshFailed && !list.writing ? (
        <Text style={styles.caption}>
          {AGENDA_SUGGESTION_COPY.refreshFailed}
        </Text>
      ) : null}
      {failed ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {failed}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The event's attachments: the shared Frapp link list
 * (`spec/behavior/frapp-links.md`), the same rows and picker as a task's
 * Attached row. A document keeps its name, as every event entry carries a
 * title for builds from before Frapp links.
 */
function EventAttachmentsSection({
  attachments,
  canEdit,
  documentsOn,
  onChange,
}: {
  attachments: EventAttachment[];
  canEdit: boolean;
  documentsOn: DocumentsModule;
  onChange: (update: (current: EventAttachment[]) => EventAttachment[]) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  if (attachments.length === 0 && !canEdit) return null;
  return (
    <View style={styles.section} accessibilityLabel="Attachments">
      <Text style={styles.sectionLabel}>ATTACHMENTS</Text>
      <ListPanel>
        <FrappLinksEditor
          links={attachments}
          canEdit={canEdit}
          documentsOn={documentsOn}
          onChange={onChange}
        />
      </ListPanel>
    </View>
  );
}

function createStyles(tokens: SignetTokens, accent?: string) {
  const fieldStyles = sheetFieldStyles(
    tokens,
    accent ?? tokens.color.text.foreground,
  );
  return StyleSheet.create({
    // Event details' DETAILS and NOTES sections: an eyebrow over the body.
    section: {
      gap: tokens.spacing.xs,
    },
    sectionLabel: {
      ...eyebrowStyle(tokens),
      color: tokens.color.text.muted,
    },
    line: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    list: {
      gap: 2,
    },
    agendaLine: {
      gap: tokens.spacing.xs,
      borderRadius: tokens.radius.control,
    },
    // The grip's column: narrow to look at, 44 points to hold with slop.
    grip: {
      width: 24,
      minHeight: tokens.touch.minimum,
      alignItems: "center",
      justifyContent: "center",
    },
    addLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      paddingLeft: 4,
    },
    // Borderless, as the next line of the list: web's add field.
    addField: {
      flex: 1,
      minHeight: tokens.touch.minimum,
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
      paddingVertical: 0,
    },
    row: {
      flex: 1,
      minHeight: tokens.touch.minimum,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    controls: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    box: {
      width: 18,
      height: 18,
      borderRadius: tokens.radius.chip,
      borderWidth: 1.5,
      borderColor: tint(tokens.color.text.foreground, 0.25),
      alignItems: "center",
      justifyContent: "center",
    },
    boxDone: {
      borderColor: tokens.color.border.input,
      backgroundColor: tokens.color.surface.popover,
    },
    // Before the start: the box reads as not yet, not as broken.
    boxWaiting: {
      opacity: 0.4,
    },
    number: {
      minWidth: 18,
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
      fontVariant: ["tabular-nums"],
    },
    textColumn: {
      flex: 1,
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: 2,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    text: {
      flex: 1,
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    textDone: {
      color: tokens.color.text.mutedForeground,
      textDecorationLine: "line-through",
    },
    caption: {
      flexShrink: 1,
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    form: {
      gap: tokens.spacing.sm,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: tokens.spacing.lg,
    },
    pressed: {
      opacity: 0.7,
    },
    ring: fieldStyles.ring,
    ringActive: fieldStyles.ringActive,
    field: fieldStyles.field,
    fieldFocused: fieldStyles.fieldFocused,
    fieldError: {
      borderColor: tokens.color.semantic.destructive,
    },
  });
}
