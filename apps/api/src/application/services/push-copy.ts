import { formatPoints } from '@repo/formatting';
import {
  EVENT_ALL_DAY_LABEL,
  EVENT_TIME_TBD_LABEL,
  describeRepeatPattern,
  eventDayNumber,
  eventTiming,
  ordinal,
  taskNeedsSignOff,
  type EventTimingFields,
} from '@repo/validation';

/**
 * How a push names a time: what a member glancing at a lock screen needs, in
 * the shape iOS Calendar and Google Calendar use ("Mon, Nov 9, 8–9 PM").
 * `spec/behavior/notifications.md` § What a push says owns the rules.
 *
 * Rendered on the server, before the push reaches a phone, so every function
 * here takes the zone to render in. The caller resolves it per recipient
 * (`recipientTimeZone`); a recipient with no known zone gets a fallback zone
 * and a zone label, so a guessed time is never presented as theirs.
 */

/** The zone used when neither the recipient nor anyone else reported one. */
export const DEFAULT_PUSH_TIME_ZONE = 'America/New_York';

/** Separates the facts in a push body: "Required · Mon, Nov 9, 8–9 PM". */
const PUSH_SEPARATOR = ' · ';

interface ZonedParts {
  weekday: string;
  month: string;
  day: number;
  year: number;
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(at: Date, timeZone: string): ZonedParts {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    partsFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) parts[part.type] = part.value;
  return {
    weekday: parts.weekday,
    month: parts.month,
    day: Number(parts.day),
    year: Number(parts.year),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    period: parts.dayPeriod?.toUpperCase() === 'AM' ? 'AM' : 'PM',
  };
}

/** "8", "8:30": the minutes only when there are some, as a calendar writes it. */
function clock(parts: ZonedParts): string {
  return parts.minute === 0
    ? `${parts.hour}`
    : `${parts.hour}:${String(parts.minute).padStart(2, '0')}`;
}

function sameDay(a: ZonedParts, b: ZonedParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** "Mon, Nov 9", with the year only when it is not this year. */
function dayLabel(parts: ZonedParts, now: ZonedParts): string {
  const base = `${parts.weekday}, ${parts.month} ${parts.day}`;
  return parts.year === now.year ? base : `${base}, ${parts.year}`;
}

/** "8–9 PM", "11 AM–1 PM", "8 PM": a span on one day. */
function timeSpan(start: ZonedParts, end: ZonedParts | null): string {
  if (!end) return `${clock(start)} ${start.period}`;
  if (start.period === end.period) {
    return `${clock(start)}–${clock(end)} ${end.period}`;
  }
  return `${clock(start)} ${start.period}–${clock(end)} ${end.period}`;
}

/** "EST": the short name of `timeZone` at `at`. */
function zoneLabel(at: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

export interface EventWhenOptions {
  /** The zone to render in: the recipient's, or a fallback. */
  timeZone: string;
  /**
   * Append the zone's short name ("8–9 PM EST"). Set when `timeZone` is a
   * fallback rather than the recipient's own, so a guess is never silent.
   */
  labelZone?: boolean;
  /**
   * A series renders as its pattern ("Every Mon, 8–9 PM, from Nov 9"): a
   * legacy token or a structured rule (`packages/validation/src/recurrence.ts`).
   */
  recurrence?: string | null;
  /** Injected for tests; decides only whether the year is shown. */
  now?: Date;
  /**
   * The event's timing and days (#6098). A dated event (all day, or time TBD)
   * reads as its days, never as a clock time: its `start_time`/`end_time`
   * are only the saving request's midnights.
   */
  dates?: EventTimingFields | null;
}

/** "Jan 22", "Jan 22, 2027": the year only when it is not this year. */
function monthDay(parts: ZonedParts, withYear: boolean): string {
  const base = `${parts.month} ${parts.day}`;
  return withYear ? `${base}, ${parts.year}` : base;
}

/** A zone-free `YYYY-MM-DD` as parts, read at noon UTC so the day never shifts. */
function calendarDayParts(date: string): ZonedParts | null {
  const n = eventDayNumber(date);
  if (n === null) return null;
  return zonedParts(new Date(n * 86_400_000 + 12 * 3_600_000), 'UTC');
}

/**
 * A dated event's days as a member reads them, or null for a timed event (or
 * a dated row whose days don't read): "Mon, Jan 11 · All day",
 * "Jan 22 – Feb 12 · All day", "Thu, Jan 14 · Time TBD". Zone-free, so the
 * same days for every recipient, with no zone label.
 */
export function formatEventDays(
  dates: EventTimingFields,
  now: Date = new Date(),
): string | null {
  const timing = eventTiming(dates);
  if (timing === 'timed' || !dates.start_date) return null;
  const start = calendarDayParts(dates.start_date);
  if (!start) return null;
  const end =
    timing === 'all_day' && dates.end_date
      ? calendarDayParts(dates.end_date)
      : null;
  const today = zonedParts(now, 'UTC');
  const label =
    timing === 'time_tbd' ? EVENT_TIME_TBD_LABEL : EVENT_ALL_DAY_LABEL;
  if (!end || sameDay(start, end)) {
    return joinFacts(dayLabel(start, today), label);
  }
  const span =
    `${monthDay(start, start.year !== end.year)} – ` +
    monthDay(end, end.year !== today.year || start.year !== end.year);
  return joinFacts(span, label);
}

/**
 * When an event happens, as a member reads it: "Mon, Nov 9, 8–9 PM",
 * "Sat, Nov 7, 6 PM – Mon, Nov 9, 12 PM" for one that spans days,
 * "Every Mon, 8–9 PM, from Nov 9" for a series, and a dated event's days
 * ({@link formatEventDays}) when `options.dates` names one.
 */
export function formatEventWhen(
  startIso: string,
  endIso: string | null | undefined,
  options: EventWhenOptions,
): string {
  const days = options.dates
    ? formatEventDays(options.dates, options.now)
    : null;
  if (days) return days;
  const { timeZone } = options;
  const startAt = new Date(startIso);
  const endAt = endIso ? new Date(endIso) : null;
  const start = zonedParts(startAt, timeZone);
  const end =
    endAt && endAt.getTime() > startAt.getTime()
      ? zonedParts(endAt, timeZone)
      : null;
  const now = zonedParts(options.now ?? new Date(), timeZone);
  const zone = options.labelZone ? ` ${zoneLabel(startAt, timeZone)}` : '';

  const oneDay = !end || sameDay(start, end);
  const span = oneDay ? timeSpan(start, end) : null;

  if (options.recurrence) {
    // A weekly overnight event ("Fri, 10 PM–2 AM") is still a pattern.
    const hours = timeSpan(start, end);
    const from = `${start.month} ${start.day}`;
    switch (options.recurrence) {
      case 'WEEKLY':
        return `Every ${start.weekday}, ${hours}${zone}, from ${from}`;
      case 'BIWEEKLY':
        return `Every other ${start.weekday}, ${hours}${zone}, from ${from}`;
      case 'MONTHLY':
        return `Monthly on the ${ordinal(start.day)}, ${hours}${zone}, from ${from}`;
      default: {
        // Said in the recipient's zone like the rest of the line, so a
        // Monday 11 PM series in New York reads as Tuesday in Berlin.
        const pattern = describeRepeatPattern(options.recurrence, startAt, {
          timeZone,
        });
        if (pattern) return `${pattern}, ${hours}${zone}, from ${from}`;
      }
    }
  }

  if (span) return `${dayLabel(start, now)}, ${span}${zone}`;

  // Spans days: both ends in full. `end` is non-null here.
  return (
    `${dayLabel(start, now)}, ${clock(start)} ${start.period} – ` +
    `${dayLabel(end!, now)}, ${clock(end!)} ${end!.period}${zone}`
  );
}

/**
 * A due date as a member reads it: "Fri, Nov 14". `tasks.due_date` is a
 * calendar `date` with no zone, so it is rendered as written, never shifted.
 */
export function formatDueDate(date: string, now: Date = new Date()): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return date;
  // Noon UTC keeps the calendar day whatever zone formats it.
  const at = new Date(Date.UTC(year, month - 1, day, 12));
  return dayLabel(zonedParts(at, 'UTC'), zonedParts(now, 'UTC'));
}

/**
 * A task's due as a member reads it: "Fri, Nov 14" for a task due on a day,
 * "Fri, Nov 14, 5 PM" for one due at a time (#4003), with the zone's short
 * name when the zone is a fallback rather than the reader's own. Without a
 * zone at all the time is left off, so a guessed clock is never shown.
 */
export function formatTaskDue(
  dueDate: string,
  dueAt: string | null | undefined,
  options: { timeZone: string | null; labelZone?: boolean; now?: Date },
): string {
  const at = dueAt ? new Date(dueAt) : null;
  if (!at || Number.isNaN(at.getTime()) || !options.timeZone) {
    return formatDueDate(dueDate, options.now);
  }
  const parts = zonedParts(at, options.timeZone);
  const now = zonedParts(options.now ?? new Date(), options.timeZone);
  const zone = options.labelZone ? ` ${zoneLabel(at, options.timeZone)}` : '';
  return `${dayLabel(parts, now)}, ${clock(parts)} ${parts.period}${zone}`;
}

/** Joins the non-empty facts of a push body with {@link PUSH_SEPARATOR}. */
export function joinFacts(
  ...facts: (string | null | undefined | false)[]
): string {
  return facts.filter((fact): fact is string => !!fact).join(PUSH_SEPARATOR);
}

/**
 * The iOS stack every "submitted a task" push joins (`aps.thread-id`), so a
 * night of submissions is one pile on the officer's lock screen.
 */
export const TASK_REVIEW_PUSH_THREAD = 'tasks:review';

/** The longest reply a submitted push quotes before it is cut. */
const SUBMITTED_REPLY_MAX = 60;

/**
 * A task a member's group follows was marked done (#5473): what they hear
 * when they can't confirm it. It tells them, and asks nothing: "Sam
 * finished: Book the venue" / "From Exec board · Waiting on an officer".
 */
export function taskFollowedFinishedCopy(
  name: string,
  task: {
    title: string;
    point_reward?: number | null;
    proof_kind?: string | null;
  },
  followerName: string | null,
): { title: string; body: string } {
  return {
    title: `${name} finished: ${task.title}`,
    body: joinFacts(
      followerName && `From ${followerName}`,
      taskNeedsSignOff(task) ? 'Waiting on an officer' : 'Done',
    ),
  };
}

/**
 * What the officer who assigned a task reads when it is marked done (#4635
 * proof): the person and the action lead, because their action is the news,
 * then what came with it. "Shawn Klein submitted: Clean his room" / "1 photo ·
 * 10 points".
 *
 * Facts only, never an instruction (Paul, 2026-11-20, #5732: "Please stop
 * narrating like directions"): the verb already says whether it waits on
 * them, "submitted" for one that does and "finished" for one that was Done
 * as marked, so the body names no next step. A send-back's second try
 * "resubmitted" and quotes the reply, the thing that changed. A finished one
 * ends in "Done", its state, so the body is never blank (#3846).
 */
export function taskSubmittedCopy(
  name: string,
  task: {
    title: string;
    point_reward?: number | null;
    proof_kind?: string | null;
    proof_link?: string | null;
    completion_note?: string | null;
  },
  submitted: { photoCount: number; resubmitted: boolean },
): { title: string; body: string } {
  const needsSignOff = taskNeedsSignOff(task);
  const verb = !needsSignOff
    ? 'finished'
    : submitted.resubmitted
      ? 'resubmitted'
      : 'submitted';
  const note = task.completion_note?.trim() || null;
  // Cut by character, not UTF-16 unit, so the cut never splits an emoji
  // (as `chat-push-preview.ts` cuts).
  const chars = note ? Array.from(note) : [];
  const quoted = note
    ? `"${
        chars.length > SUBMITTED_REPLY_MAX
          ? `${chars
              .slice(0, SUBMITTED_REPLY_MAX - 1)
              .join('')
              .trimEnd()}…`
          : note
      }"`
    : null;
  const points = task.point_reward ?? 0;
  return {
    title: `${name} ${verb}: ${task.title}`,
    body: joinFacts(
      quoted && (submitted.resubmitted ? `Replied ${quoted}` : quoted),
      submitted.photoCount > 0 &&
        `${submitted.photoCount} ${submitted.photoCount === 1 ? 'photo' : 'photos'}`,
      task.proof_link && 'Link attached',
      points > 0 && formatPoints(points),
      // A completion with nothing else to say still says its state: the
      // push never goes out blank (#3846).
      !needsSignOff && 'Done',
    ),
  };
}

/** The iOS stack every "asks for more time" push joins (#6096). */
export const TASK_EXTENSION_PUSH_THREAD = 'tasks:extension';

/** The longest reason an "asks for more time" push quotes before it is cut. */
const EXTENSION_REASON_MAX = 60;

/** Quotes a member's words for a push, cut by character, never mid-emoji. */
function quotedLine(text: string, max: number): string {
  const chars = Array.from(text.trim());
  return `"${
    chars.length > max
      ? `${chars
          .slice(0, max - 1)
          .join('')
          .trimEnd()}…`
      : chars.join('')
  }"`;
}

/**
 * A member asks for more time on a task an officer can decide (#6096):
 * "Sam asks for more time: Sweep the porch" / "To Sat, Nov 28 · "Shift ran
 * late"". `due` is the asked-for due, already formatted for the reader.
 */
export function taskExtensionAskedCopy(
  name: string,
  task: { title: string },
  request: { reason: string },
  due: string,
): { title: string; body: string } {
  return {
    title: `${name} asks for more time: ${task.title}`,
    body: joinFacts(`To ${due}`, quotedLine(request.reason, EXTENSION_REASON_MAX)),
  };
}

/**
 * An officer answered a member's request (#6096): "Sweep the porch" / "More
 * time granted · now due Sat, Nov 28", or "Not extended · "The event is
 * Friday"".
 */
export function taskExtensionDecidedCopy(
  task: { title: string },
  decision:
    | { approved: true; due: string }
    | { approved: false; reason: string },
): { title: string; body: string } {
  return {
    title: task.title,
    body: decision.approved
      ? joinFacts('More time granted', `now due ${decision.due}`)
      : joinFacts(
          'Not extended',
          quotedLine(decision.reason, EXTENSION_REASON_MAX),
        ),
  };
}
