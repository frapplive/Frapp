"use client";

import { useId, useState, type FormEvent } from "react";
import { GripVertical, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { randomClientId } from "@repo/api-sdk";
import {
  useAgendaSuggestionActions,
  useAgendaSuggestions,
  useEventListsEditor,
  type EventLists,
} from "@repo/hooks";
import {
  AGENDA_CHECK_OFF_LOCKED_COPY,
  AGENDA_SUGGESTION_COPY,
  agendaFromMinutesLabel,
  agendaTabledFromLabel,
  agendaProblem,
  EVENT_AGENDA_ITEM_MAX,
  EVENT_AGENDA_MAX,
  normalizeAgendaText,
  reorderEventEntry,
  toggleAgendaItem,
  type AgendaSuggestion,
  type EventAgendaItem,
  type EventAgendaTabledFrom,
  type EventAttachment,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { QUIET_LINK } from "@/components/ui/quiet-link";
import { FOCUS_RING, FOCUS_RING_OFFSET } from "@/components/ui/focus";
import { FrappLinksEditor } from "@/components/shared/frapp-links";
import { useSortableList } from "@/components/shared/use-sortable-list";
import {
  dashboardCheckboxHitAreaClassName,
  dashboardTableCheckboxClassName,
} from "@/components/shared/table-controls";
import { useSubscriptionGate } from "@/components/shared/subscription-gate";
import { toastFailure } from "@/lib/failure-toast";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * An event's agenda and attachments on its sheet (#4934,
 * `spec/behavior/events.md` § Agenda and attachments). Everyone who can see
 * the event reads them; an `events:update` holder edits them in place, the
 * way Notion's and Fellow's meeting agendas are a checklist on the meeting
 * itself rather than a field in a form. Both lists share one editor
 * (`useEventListsEditor`), so a run of quick changes goes out as one save
 * of this meeting's whole lists, never the series'.
 */

const SECTION = "grid gap-2";
const HEADING = "text-sm font-semibold text-foreground";
const LABEL = "text-caption text-muted-foreground";

/** Whether Chapter Files is on: `null` while the module read can't say. */
export type DocumentsModule = boolean | null;

export function EventMeetingLists({
  eventId,
  lists,
  canEdit,
  upcoming,
  checkOffOpen,
  documentsOn,
}: {
  eventId: string;
  lists: EventLists;
  /** Holds `events:update`, and the event is there to write to. */
  canEdit: boolean;
  /**
   * The meeting hasn't ended and the chapter has minutes on. Suggested
   * shows only while this holds and the meeting hasn't started either.
   */
  upcoming: boolean;
  /**
   * The meeting has started: its items can be checked off, and no longer
   * added, moved or removed.
   */
  checkOffOpen: boolean;
  documentsOn: DocumentsModule;
}) {
  // A paid write, like the sheet's Edit: a lapsed chapter or an offline
  // browser reads the lists but gets no controls that would only be refused.
  const gate = useSubscriptionGate();
  const editable = canEdit && gate.allowed;
  const editor = useEventListsEditor(eventId, lists, {
    onFailed: (error) =>
      toastFailure({
        title: "Couldn't save the agenda or attachments",
        error,
        fallback: "Your last change was undone. Try it again in a moment.",
      }),
  });
  // While an Add is out the agenda's controls wait: the server is writing
  // the list, and an edit now would send the copy without the new item.
  const [adding, setAdding] = useState(false);
  // Suggestions add items, so they go once the agenda is locked.
  const showSuggestions = editable && upcoming && !checkOffOpen;
  return (
    <>
      {/* A started meeting's empty agenda can't be started any more, so
          an editor gets no empty section for it. */}
      {editor.agenda.length > 0 || (editable && !checkOffOpen) ? (
        // The agenda and what's suggested for it read as one section.
        <div className="grid gap-3">
          <EventAgendaSection
            agenda={editor.agenda}
            canEdit={editable}
            checkOffOpen={checkOffOpen}
            itemsLocked={checkOffOpen}
            locked={adding}
            onChange={(update) => editor.change("agenda", update)}
          />
          {showSuggestions ? (
            <AgendaSuggestions
              eventId={eventId}
              full={editor.agenda.length >= EVENT_AGENDA_MAX}
              settleAgenda={editor.settle}
              onAdding={setAdding}
            />
          ) : null}
        </div>
      ) : null}
      <EventAttachmentsSection
        attachments={editor.attachments}
        canEdit={editable}
        documentsOn={documentsOn}
        onChange={(update) => editor.change("attachments", update)}
      />
    </>
  );
}

/**
 * The agenda: a checklist for whoever can edit the event, numbered for
 * everyone else. An editor drags a row by its grip to move it (the grip's
 * arrow keys do the same), and removes it from the row's end; the checkboxes
 * wait for the meeting to start (`agendaCheckOffOpen`). `checkable={false}`
 * is the event form's list (`AgendaDraftList`): a new event has nothing to
 * check off yet.
 */
export function EventAgendaSection({
  agenda,
  canEdit,
  checkOffOpen = true,
  checkable = true,
  itemsLocked = false,
  locked = false,
  bare = false,
  draft: heldDraft,
  onDraftChange,
  onChange,
}: {
  agenda: EventAgendaItem[];
  canEdit: boolean;
  /**
   * The add field's text, when the caller holds it: a form sends a line
   * typed but never entered (`agendaWithPending`).
   */
  draft?: string;
  onDraftChange?: (draft: string) => void;
  /** The meeting has started; before then the checkboxes wait. */
  checkOffOpen?: boolean;
  /** Draw checkboxes at all (not on the form's list). */
  checkable?: boolean;
  /**
   * The meeting has started: items are checked off but no longer added,
   * moved or removed (Paul 2026-11-20, "lock agenda edits once the meeting
   * has started"). The API refuses such a change too.
   */
  itemsLocked?: boolean;
  /** The controls show but wait (a suggestion is being added). */
  locked?: boolean;
  /** No heading: the form's row names the list. */
  bare?: boolean;
  onChange: (update: (current: EventAgendaItem[]) => EventAgendaItem[]) => void;
}) {
  const { toast } = useToast();
  const [ownDraft, setOwnDraft] = useState("");
  const draft = heldDraft ?? ownDraft;
  const setDraft = onDraftChange ?? setOwnDraft;
  const inputId = useId();
  const lockNoteId = useId();
  // Who may add, move and remove items: an editor, until the meeting starts.
  const reshape = canEdit && !itemsLocked;
  const sortable = useSortableList({
    count: agenda.length,
    disabled: locked || !reshape,
    // By id, against the list as it stands when the update runs: a save
    // or a suggestion may have landed since this one was drawn.
    onMove: (from, to) => {
      const moved = agenda[from]?.id;
      const onto = agenda[to]?.id;
      onChange((current) =>
        reorderEventEntry(
          current,
          current.findIndex((entry) => entry.id === moved),
          current.findIndex((entry) => entry.id === onto),
        ),
      );
    },
  });
  if (agenda.length === 0 && !reshape) return null;

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = normalizeAgendaText(draft);
    if (!text) return;
    const problem = agendaProblem([...agenda, { text }]);
    if (problem) {
      toast({ title: "Couldn't add that item", description: problem });
      return;
    }
    setDraft("");
    onChange((current) => [
      ...current,
      { id: randomClientId(), text, done: false },
    ]);
  }

  const full = agenda.length >= EVENT_AGENDA_MAX;
  const done = agenda.filter((item) => item.done).length;
  const showChecks = canEdit && checkable;
  // Said once, not on every box: nothing to check off before the start.
  const waiting = showChecks && !checkOffOpen && agenda.length > 0;

  return (
    <section aria-label="Agenda" className={SECTION}>
      {bare ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={HEADING}>Agenda</h3>
          {agenda.length > 0 && checkOffOpen && checkable ? (
            <span className={LABEL}>
              {done} of {agenda.length} done
            </span>
          ) : null}
        </div>
      )}
      {waiting ? (
        <p id={lockNoteId} className={LABEL}>
          {AGENDA_CHECK_OFF_LOCKED_COPY}
        </p>
      ) : null}
      {agenda.length > 0 ? (
        <ol className="grid">
          {agenda.map((item, index) => (
            <li
              key={item.id}
              ref={sortable.rowRef(index)}
              style={sortable.rowStyle(index)}
              className={cn(
                "group flex min-h-control-list-row items-center gap-1.5 rounded-md bg-background pointer-coarse:min-h-11",
                sortable.dragging === index &&
                  "bg-surface-1 shadow-lg ring-1 ring-border",
              )}
            >
              {reshape ? (
                <button
                  type="button"
                  {...sortable.handleProps(index, item.text)}
                  className={cn(
                    "-ml-1 flex h-control-row w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-default pointer-coarse:h-11 pointer-coarse:opacity-100",
                    sortable.dragging === index && "opacity-100",
                    FOCUS_RING_OFFSET,
                  )}
                >
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
              {showChecks ? (
                <label className={dashboardCheckboxHitAreaClassName}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={locked || !checkOffOpen}
                    aria-label={item.text}
                    aria-describedby={waiting ? lockNoteId : undefined}
                    onChange={() =>
                      onChange((current) => toggleAgendaItem(current, item.id))
                    }
                    className={cn(
                      dashboardTableCheckboxClassName,
                      !checkOffOpen && "cursor-not-allowed opacity-50",
                    )}
                  />
                </label>
              ) : (
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 text-center text-sm tabular-nums text-muted-foreground"
                >
                  {index + 1}.
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 break-words py-1.5 text-sm",
                  item.done && "text-muted-foreground line-through",
                )}
              >
                {!showChecks && item.done ? (
                  <span className="sr-only">Done: </span>
                ) : null}
                {item.text}
                {item.tabled_from ? (
                  <TabledFromLink from={item.tabled_from} />
                ) : null}
              </span>
              {reshape ? (
                <IconButton
                  label={`Remove "${item.text}"`}
                  disabled={locked}
                  className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                  onClick={() =>
                    onChange((current) =>
                      current.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {reshape ? (
        <p aria-live="polite" className="sr-only">
          {sortable.announcement}
        </p>
      ) : null}
      {reshape && !full ? (
        <form onSubmit={add} className="flex items-center gap-1.5">
          <label htmlFor={inputId} className="sr-only">
            Add an agenda item
          </label>
          <Plus
            className="ml-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {/* Enter adds and keeps the caret here for the next one, as a
              checklist in Notion or Reminders does: no Add button to aim
              for between items. */}
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={locked}
            placeholder={
              agenda.length === 0 ? "Add the first item" : "Add an item"
            }
            maxLength={EVENT_AGENDA_ITEM_MAX}
            enterKeyHint="done"
            className={cn(
              "flex min-h-control-list-row w-full min-w-0 rounded-md bg-transparent px-2 text-sm caret-primary placeholder:text-muted hover:bg-card-hover focus:bg-surface-1 pointer-coarse:min-h-11",
              FOCUS_RING,
            )}
          />
        </form>
      ) : null}
      {reshape && full ? (
        <p className={LABEL}>An agenda holds {EVENT_AGENDA_MAX} items.</p>
      ) : null}
    </section>
  );
}

/**
 * The event form's Agenda row (Paul 2026-11-19, "where is the ability to add
 * agenda items"): the same list the event's page draws, typed before the
 * event exists, sent with the create. Nothing to check off yet.
 */
export function AgendaDraftList({
  agenda,
  onChange,
  draft,
  onDraftChange,
  disabled = false,
}: {
  agenda: EventAgendaItem[];
  onChange: (next: EventAgendaItem[]) => void;
  /** The add field's text: Create sends it even if Enter wasn't pressed. */
  draft: string;
  onDraftChange: (draft: string) => void;
  disabled?: boolean;
}) {
  return (
    <EventAgendaSection
      agenda={agenda}
      canEdit
      checkable={false}
      locked={disabled}
      bare
      draft={draft}
      onDraftChange={onDraftChange}
      onChange={(update) => onChange(update(agenda))}
    />
  );
}

/**
 * "Tabled from Tuesday, November 11 · 2nd time" under an agenda item or a
 * suggestion (#5534), linking to the minutes of that day. Everyone who sees
 * the agenda sees it; the minutes themselves open only for their audience.
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
  return (
    <Link
      href={`/meetings/${meetingId}`}
      className={cn(
        "block w-fit rounded-sm text-caption text-muted-foreground no-underline hover:underline",
        FOCUS_RING_OFFSET,
      )}
    >
      {label}
    </Link>
  );
}

/**
 * Suggested agenda items (#5534, `spec/behavior/events.md` § Suggested
 * agenda items) under the agenda, for whoever can edit it: what earlier
 * meetings with the same people tabled, first, then what the model
 * suggests. Each row has Add and Dismiss, the way Fellow suggests talking
 * points under a meeting's agenda and Linear offers suggested labels: one
 * tap takes it, one tap waves it off. Nothing shows when there's nothing
 * to suggest.
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
  const list = useAgendaSuggestions(eventId);
  const actions = useAgendaSuggestionActions(eventId, {
    flushAgenda: settleAgenda,
  });
  const [busy, setBusy] = useState<string | null>(null);

  if (list.suggestions.length === 0 && !list.writing && !list.refreshFailed) {
    return null;
  }

  async function act(row: AgendaSuggestion, action: "add" | "dismiss") {
    setBusy(row.id);
    if (action === "add") onAdding(true);
    try {
      await actions[action](row.id);
    } catch (error) {
      toastFailure({
        title:
          action === "add"
            ? AGENDA_SUGGESTION_COPY.addFailed
            : AGENDA_SUGGESTION_COPY.dismissFailed,
        error,
        fallback: "Try again in a moment.",
      });
    } finally {
      setBusy(null);
      if (action === "add") onAdding(false);
    }
  }

  return (
    <section aria-label={AGENDA_SUGGESTION_COPY.heading} className={SECTION}>
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>{AGENDA_SUGGESTION_COPY.heading}</p>
        {list.aiAvailable && !list.writing ? (
          <button type="button" className={QUIET_LINK} onClick={list.refresh}>
            {AGENDA_SUGGESTION_COPY.refresh}
          </button>
        ) : null}
      </div>
      {list.suggestions.length > 0 ? (
        <ul className="grid gap-1">
          {list.suggestions.map((row) => (
            <li
              key={row.id}
              className="flex min-h-control-list-row items-center gap-2 pointer-coarse:min-h-11"
            >
              <span className="min-w-0 flex-1 break-words text-sm">
                {row.text}
                {row.tabled_from ? (
                  <TabledFromLink from={row.tabled_from} />
                ) : row.from_minutes ? (
                  <MinutesLink
                    meetingId={row.from_minutes.meeting_id}
                    label={agendaFromMinutesLabel(row.from_minutes)}
                  />
                ) : row.reason ? (
                  <span className="block text-caption text-muted-foreground">
                    {row.reason}
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={full || busy !== null}
                aria-label={AGENDA_SUGGESTION_COPY.addLabel(row.text)}
                onClick={() => void act(row, "add")}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {AGENDA_SUGGESTION_COPY.add}
              </Button>
              <IconButton
                label={AGENDA_SUGGESTION_COPY.dismissLabel(row.text)}
                disabled={busy !== null}
                onClick={() => void act(row, "dismiss")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      {list.writing ? (
        <p className="flex items-center gap-2 text-caption text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {AGENDA_SUGGESTION_COPY.writing}
        </p>
      ) : null}
      {full && list.suggestions.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          {AGENDA_SUGGESTION_COPY.full(EVENT_AGENDA_MAX)}
        </p>
      ) : null}
      {list.refreshFailed && !list.writing ? (
        <p role="status" className="text-caption text-muted-foreground">
          {AGENDA_SUGGESTION_COPY.refreshFailed}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The event's attachments: the shared Frapp link list
 * (`spec/behavior/frapp-links.md`), the same rows and picker as a task's
 * Attached row. A document keeps its name, as every event entry carries a
 * title for phone builds from before Frapp links.
 */
export function EventAttachmentsSection({
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
  if (attachments.length === 0 && !canEdit) return null;
  return (
    <section aria-label="Attachments" className={SECTION}>
      <h3 className={HEADING}>Attachments</h3>
      <FrappLinksEditor
        links={attachments}
        canEdit={canEdit}
        documentsOn={documentsOn}
        onChange={onChange}
      />
    </section>
  );
}
