import { POINTS_ADJUSTMENT_MAX } from "./field-limits";
import {
  EVENT_ALL_DAY_LABEL,
  EVENT_TENTATIVE_LABEL,
  EVENT_TIME_TBD_LABEL,
  eventTakesAttendance,
  type EventTiming,
} from "./event-timing";

/**
 * The words of the event form's rows (#5561), one copy for web's
 * `EventEditorDialog` and the phone's `NewEventSheet`, so the two read as
 * one form. The rows' marks are `@repo/theme/event-form-glyphs`; the order
 * is {@link EVENT_FORM_ROWS}. `spec/ui/design-system/components.md`
 * § Property rows owns the pattern.
 */

/** Every row the form can show, top to bottom, on both apps. */
export const EVENT_FORM_ROWS = [
  "type",
  "when",
  "repeat",
  "location",
  "attendance",
  "points",
  "agenda",
  "description",
  "notes",
  "checkIn",
] as const;

export type EventFormRow = (typeof EVENT_FORM_ROWS)[number];

/** Each row's label. Notes takes the Meetings module's own word instead. */
export const EVENT_FORM_ROW_LABELS: Record<
  Exclude<EventFormRow, "notes">,
  string
> = {
  type: "Type",
  when: "When",
  repeat: "Repeat",
  location: "Location",
  attendance: "Who's coming",
  points: "Points",
  agenda: "Agenda",
  description: "Description",
  checkIn: "Check-in",
};

/** What an empty row says, in the muted tone. */
export const EVENT_FORM_PLACEHOLDERS = {
  name: "Event name",
  type: "None",
  location: "Add a place",
  description: "Add details",
  notes: "Add notes",
  agenda: "Add an item",
} as const;

/**
 * Under the form's Agenda row while the event repeats (Paul 2026-11-19, "where
 * is the ability to add agenda items"): an agenda belongs to one meeting
 * (`spec/behavior/events.md` § Agenda and attachments), so what is typed here
 * goes on the first one, and each later meeting gets its own on its page.
 */
export const EVENT_FORM_AGENDA_REPEAT_NOTE =
  "For the first meeting. Each meeting keeps its own agenda.";

/**
 * The line under a member's rows: their event carries no points and requires
 * nobody, whatever its type says (#3709), so a type's "10 points" doesn't
 * read as a promise.
 */
export const EVENT_FORM_MEMBER_NOTE =
  "Events you make carry no points and require nobody.";

/** What a new event type is made of: the body of `POST /v1/event-types`. */
export type EventTypeDraft = {
  name: string;
  point_value: number;
  is_mandatory: boolean;
};

/**
 * The type made in place from the form it was made on: it carries the
 * event's points and whether everyone must come, so the next event of that
 * kind starts the same. The form keeps what it holds; only the type is held
 * (and its name fills a blank name). Points are read from the field's text
 * the same way on both apps: a whole number is kept, capped at
 * {@link POINTS_ADJUSTMENT_MAX}; anything else, a blank field, or a
 * member's form, which sets none (`null`), makes 0.
 */
export function eventTypeFromForm(
  name: string,
  pointsText: string | null,
  everyoneRequired: boolean,
): EventTypeDraft {
  const trimmed = pointsText?.trim() ?? "";
  const point_value = /^\d+$/.test(trimmed)
    ? Math.min(Number(trimmed), POINTS_ADJUSTMENT_MAX)
    : 0;
  return { name, point_value, is_mandatory: everyoneRequired };
}

/** `"10 points · Required"`: what picking a type sets, in its menu row. */
export function describeEventTypeSets(type: {
  point_value: number;
  is_mandatory: boolean;
}): string {
  const points =
    type.point_value === 0
      ? "No points"
      : `${type.point_value} ${type.point_value === 1 ? "point" : "points"}`;
  return type.is_mandatory ? `${points} · Required` : points;
}

/**
 * The Check-in row's value: when check-in opens, from the parsed field
 * (`null` when the field holds something it refuses), and whether a zone is
 * drawn. `"Opens 10 minutes early"`, `"Opens at the start · In a zone"`.
 */
export function describeCheckIn(
  opensMinutes: number | null,
  zoneDrawn = false,
): string {
  const opens =
    opensMinutes === null
      ? "Opening time needs a fix"
      : opensMinutes === 0
        ? "Opens at the start"
        : `Opens ${opensMinutes} ${opensMinutes === 1 ? "minute" : "minutes"} early`;
  return zoneDrawn ? `${opens} · In a zone` : opens;
}

/**
 * How long an event runs, one tap each under the When row on both apps
 * (Paul 2026-11-19: "just adding an hour is really tedious"), in minutes.
 * Picking one moves the end and keeps the start.
 */
export const EVENT_LENGTH_CHOICES = [30, 60, 90, 120, 180] as const;

/**
 * `"30 min"`, `"1 hr"`, `"1.5 hrs"`: an event's length. The length chips on
 * both apps and web's end-time list (`durationLabel` in `time-field.tsx`)
 * all say it this way.
 */
export function eventLengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  const shown = Number.isInteger(hours)
    ? `${hours}`
    : hours.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  return `${shown} ${hours === 1 ? "hr" : "hrs"}`;
}

/**
 * The When row's three shapes (#6098), one short pick on both apps: a time,
 * the whole day (or days), or a day whose time isn't set. Google Calendar and
 * Apple Calendar put All day beside the times; a time TBD is Eventbrite's
 * "time TBA". One three-way pick rather than a switch plus a second control,
 * because the three are one exclusive choice (HIG: a segmented control for a
 * few closely related choices).
 */
export const EVENT_TIMING_CHOICES = [
  "timed",
  "all_day",
  "time_tbd",
] as const satisfies readonly EventTiming[];

export const EVENT_TIMING_CHOICE_LABELS: Record<EventTiming, string> = {
  timed: "Set time",
  all_day: EVENT_ALL_DAY_LABEL,
  time_tbd: EVENT_TIME_TBD_LABEL,
};

/** The other words the When row says, the same on both apps. */
export const EVENT_WHEN_COPY = {
  /** Beside the switch under the When row. */
  tentative: EVENT_TENTATIVE_LABEL,
  /** The optional last day of an all-day event, while empty. */
  lastDay: "Last day",
  /** Opens the last day on an all-day event that is one day so far. */
  endsAnotherDay: "Ends another day",
  /** The tentative switch's accessible description. */
  tentativeHint: "It might not happen",
} as const;

/**
 * Which rows the form shows for the shape it holds (#6098), on both apps:
 * Points and Check-in only where the event takes attendance
 * (`eventTakesAttendance`), and Repeat only on a timed event, because a
 * repeating event stays timed for now.
 */
export function eventFormShowsRow(
  row: EventFormRow,
  shape: { timing: EventTiming; calendarOnly: boolean },
): boolean {
  const takes = eventTakesAttendance({
    timing: shape.timing,
    calendar_only: shape.calendarOnly,
  });
  if (row === "points" || row === "checkIn") return takes;
  if (row === "repeat") return shape.timing === "timed";
  return true;
}
