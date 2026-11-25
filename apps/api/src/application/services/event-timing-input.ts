import { BadRequestException } from '@nestjs/common';
import {
  addEventDays,
  eventDatesProblem,
  eventDayNumber,
  eventTiming,
  isEventTiming,
  type EventTiming,
} from '@repo/validation';
import type { Event } from '#domain/entities/event.entity';
import {
  localDateIn,
  validTimeZone,
  zonedTimeToUtc,
} from '#domain/utils/zoned-time';

/**
 * When an event happens, as a create or update sends it
 * (`spec/behavior/events.md` § Dates, tentative and on the calendar only,
 * #6098). The columns it resolves to are written together, so a row is
 * always one consistent shape (the table's `events_timing_dates` check
 * agrees).
 */
export interface EventTimingInput {
  timing?: EventTiming;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string;
  end_time?: string;
}

export interface EventTimingColumns {
  timing: EventTiming;
  start_date: string | null;
  end_date: string | null;
  start_time: string;
  end_time: string;
}

/**
 * A dated event's columns: its days, and as `start_time`/`end_time` the
 * local midnight that starts its first day and the one that ends its last,
 * in the saving request's zone. Those instants only keep range reads (lists,
 * windows, the feed) finding the event; every app shows the days.
 */
function datedColumns(
  timing: Exclude<EventTiming, 'timed'>,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  zone: string | null | undefined,
): EventTimingColumns {
  const problem = eventDatesProblem(timing, startDate, endDate);
  if (problem) throw new BadRequestException(problem);
  const start = startDate as string;
  const end = timing === 'time_tbd' ? start : (endDate ?? start);
  const tz = validTimeZone(zone);
  const dayAfter = addEventDays(end, 1) as string;
  const startAt = zonedTimeToUtc(start, '00:00', tz);
  const endAt = zonedTimeToUtc(dayAfter, '00:00', tz);
  if (!startAt || !endAt) {
    throw new BadRequestException('start_date must be a real date.');
  }
  return {
    timing,
    start_date: start,
    end_date: end,
    start_time: startAt.toISOString(),
    end_time: endAt.toISOString(),
  };
}

function timedColumns(
  startTime: string | undefined,
  endTime: string | undefined,
): EventTimingColumns {
  if (!startTime || !endTime) {
    throw new BadRequestException(
      'A timed event needs start_time and end_time.',
    );
  }
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException(
      'start_time and end_time must be valid ISO dates',
    );
  }
  if (end <= start) {
    throw new BadRequestException('end_time must be after start_time');
  }
  return {
    timing: 'timed',
    start_date: null,
    end_date: null,
    start_time: startTime,
    end_time: endTime,
  };
}

/** A create's timing columns. No `timing` is a timed event, as before. */
export function resolveCreateTiming(
  input: EventTimingInput,
  zone: string | null | undefined,
): EventTimingColumns {
  const timing = input.timing ?? 'timed';
  if (!isEventTiming(timing)) {
    throw new BadRequestException('timing must be timed, all_day or time_tbd');
  }
  if (timing === 'timed') {
    if (input.start_date || input.end_date) {
      throw new BadRequestException(
        eventDatesProblem('timed', input.start_date, input.end_date) ??
          'A timed event has no start_date or end_date.',
      );
    }
    return timedColumns(input.start_time, input.end_time);
  }
  return datedColumns(timing, input.start_date, input.end_date, zone);
}

/**
 * An update's timing columns, or null when it changes none of them.
 *
 * - `timing` sent: the event becomes that shape. Dated, its days default to
 *   the ones it has; timed, its times default to the ones it has only when
 *   it already was timed (a dated event's stored instants are midnight
 *   bounds, never a real time).
 * - No `timing`, but times sent: the event becomes timed. Only a build from
 *   before #6098 sends times to a dated event, and it showed that build a
 *   time, so the time it saved is what the member meant.
 * - No `timing`, but days sent: the event keeps its dated shape with the new
 *   days. A timed event refuses them.
 */
export function resolveUpdateTiming(
  input: EventTimingInput,
  existing: Pick<
    Event,
    'timing' | 'start_date' | 'end_date' | 'start_time' | 'end_time'
  >,
  zone: string | null | undefined,
): EventTimingColumns | null {
  const sentDays =
    input.start_date !== undefined || input.end_date !== undefined;
  const sentTimes =
    input.start_time !== undefined || input.end_time !== undefined;
  const current = eventTiming(existing);
  if (input.timing === undefined && !sentDays && !sentTimes) return null;

  const timing: EventTiming =
    input.timing ?? (sentTimes && !sentDays ? 'timed' : current);
  if (!isEventTiming(timing)) {
    throw new BadRequestException('timing must be timed, all_day or time_tbd');
  }
  if (timing === 'timed') {
    if (sentDays && (input.start_date || input.end_date)) {
      throw new BadRequestException(
        'A timed event has no start_date or end_date; send start_time and end_time.',
      );
    }
    if (current === 'timed') {
      return timedColumns(
        input.start_time ?? existing.start_time,
        input.end_time ?? existing.end_time,
      );
    }
    // A dated event's stored instants are midnight bounds, never a time, so
    // a bound the request leaves out is an hour from the one it sends (a
    // build from before #6098 sends only the bound it changed).
    const start =
      input.start_time ??
      (input.end_time ? shiftIso(input.end_time, -HOUR_MS) : undefined);
    const end =
      input.end_time ??
      (input.start_time ? shiftIso(input.start_time, HOUR_MS) : undefined);
    return timedColumns(start, end);
  }
  // A timed event made all-day or TBD keeps the day it was on.
  const startDate =
    input.start_date !== undefined
      ? input.start_date
      : (existing.start_date ??
        localDateIn(new Date(existing.start_time), validTimeZone(zone)));
  return datedColumns(
    timing,
    startDate,
    datedEndDate(timing, current, input, existing, startDate),
    zone,
  );
}

/**
 * The last day a dated update lands on when it doesn't send one: a TBD event
 * is one day; an all-day event that already ran several days keeps its
 * length from its (possibly new) first day; anything else is one day.
 */
function datedEndDate(
  timing: Exclude<EventTiming, 'timed'>,
  current: EventTiming,
  input: EventTimingInput,
  existing: Pick<Event, 'start_date' | 'end_date'>,
  startDate: string | null | undefined,
): string | null | undefined {
  if (input.end_date !== undefined) return input.end_date;
  if (timing === 'time_tbd' || !startDate) return startDate;
  if (current === 'all_day' && existing.start_date && existing.end_date) {
    const from = eventDayNumber(existing.start_date);
    const to = eventDayNumber(existing.end_date);
    if (from !== null && to !== null) return addEventDays(startDate, to - from);
  }
  return startDate;
}

const HOUR_MS = 60 * 60 * 1000;

/** `iso` moved by `ms`, or `iso` itself when it doesn't parse (refused later). */
function shiftIso(iso: string, ms: number): string {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? iso : new Date(at + ms).toISOString();
}
