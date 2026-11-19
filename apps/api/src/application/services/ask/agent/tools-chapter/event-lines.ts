import { NotFoundException } from '@nestjs/common';
import type { Event } from '#domain/entities/event.entity';
import type { EventAttendanceStatus } from '#domain/entities/event-attendance.entity';
import { localDateIn } from '#domain/utils/zoned-time';
import type { EventService } from '../../../event.service';
import type { AgentToolContext } from '../agent-tool';
import {
  DAY_MS,
  longDay,
  longRange,
  matchByName,
  plainName,
  quoted,
  readWindow,
} from './chapter-tool-kit';

/** How the event tools find one event and write it (#4901). */

/** How far either side of now an event is looked for by name. */
const FIND_DAYS = 200;

/** How many of the other events that fit a note names. */
const NAMED_CANDIDATES = 6;

const EVENT_ID =
  /^(?:event:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export interface FoundEvent {
  /**
   * The event, or null when none fits, or when several differently named
   * events fit and the model must choose (see `others`).
   */
  event: Event | null;
  /** How many events fit what was asked; more than one means it was ambiguous. */
  candidates: number;
  /**
   * The events that fit besides `event`, nearest first: the ones the model
   * may have meant instead. Every one is from the asker's own calendar.
   */
  others: Event[];
}

/**
 * The one event the model meant by a name, a day, or both.
 *
 * Every candidate comes from the asker's own calendar (`GET /v1/events`, or
 * `GET /v1/events/:id` for an id), so an event of another chapter, or one
 * whose roles leave the asker out, is simply not found.
 *
 * When several fit and they are one event repeating (the same name, other
 * days), the nearest to now is taken (`prefer` says on which side), and the
 * note names the others. When they have different names ("formal" fits
 * "Spring formal" and "Formal dinner"), none is taken: nearness is no
 * reason to think the member meant one over another, so the model is shown
 * the candidates and chooses, or asks (#5180).
 */
export async function findEvent(
  events: Pick<EventService, 'findByChapter' | 'findById'>,
  args: { event: string; on: string },
  context: AgentToolContext,
  prefer: 'upcoming' | 'past',
): Promise<FoundEvent> {
  const byId = EVENT_ID.exec(args.event);
  if (byId) {
    try {
      const event = await events.findById(
        byId[1],
        context.chapterId,
        context.userId,
      );
      return { event, candidates: 1, others: [] };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { event: null, candidates: 0, others: [] };
      }
      throw error;
    }
  }
  if (!args.event && !args.on) {
    return { event: null, candidates: 0, others: [] };
  }

  const window = args.on
    ? readWindow({ from: args.on, to: args.on }, context, {
        backDays: 0,
        aheadDays: 0,
        maxDays: 1,
      })
    : {
        start: new Date(context.now.getTime() - FIND_DAYS * DAY_MS),
        end: new Date(context.now.getTime() + FIND_DAYS * DAY_MS),
      };
  const calendar = await events.findByChapter(
    context.chapterId,
    context.userId,
    {
      endsAfter: window.start.toISOString(),
      startsBefore: window.end.toISOString(),
    },
  );
  let fits = args.event
    ? matchByName(calendar, (event) => event.name, args.event)
    : calendar;
  if (args.on) {
    // The window catches an event that only runs into the day (it started
    // the night before); one that starts on the day is the better reading.
    const starting = fits.filter(
      (event) =>
        localDateIn(new Date(event.start_time), context.timeZone) === args.on,
    );
    if (starting.length > 0) fits = starting;
  }
  if (fits.length === 0) return { event: null, candidates: 0, others: [] };

  const now = context.now.getTime();
  const start = (event: Event) => Date.parse(event.start_time);
  const ahead = fits
    .filter((event) => Date.parse(event.end_time) >= now)
    .sort((a, b) => start(a) - start(b));
  const behind = fits
    .filter((event) => Date.parse(event.end_time) < now)
    .sort((a, b) => start(b) - start(a));
  const [first, second] =
    prefer === 'upcoming' ? [ahead, behind] : [behind, ahead];
  const nearestFirst = [...first, ...second];
  const oneName =
    new Set(fits.map((event) => plainName(event.name))).size === 1;
  return oneName
    ? {
        event: nearestFirst[0],
        candidates: fits.length,
        others: nearestFirst.slice(1),
      }
    : { event: null, candidates: fits.length, others: nearestFirst };
}

/** `"Formal dinner" on Friday, November 20, 2026 (event:<id>)`. */
function candidateLine(event: Event, timeZone: string): string {
  return `${quoted(event.name)} on ${longDay(event.start_time, timeZone)} (event:${event.id})`;
}

/** The candidates a note names, and how many more it leaves out. */
function candidateList(events: readonly Event[], timeZone: string): string {
  const named = events
    .slice(0, NAMED_CANDIDATES)
    .map((event) => candidateLine(event, timeZone));
  const more = events.length - named.length;
  return `${named.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
}

/**
 * The note for a result that took one of several events: which others fit,
 * so the model can read the one the member meant, or ask them.
 */
export function ambiguityNote(
  found: FoundEvent,
  timeZone: string,
): string | null {
  if (!found.event || found.others.length === 0) return null;
  return `${found.candidates} events fit that. This is the nearest one. The others: ${candidateList(found.others, timeZone)}. If the member meant another, read again with its id or day; if it is not clear which they meant, ask them.`;
}

/**
 * The note for a name several different events fit, when none was taken:
 * the candidates, for the model to choose from or to ask about. Null when
 * nothing fits at all.
 */
export function choiceNote(found: FoundEvent, timeZone: string): string | null {
  if (found.event || found.others.length === 0) return null;
  return `${found.candidates} different events fit that: ${candidateList(found.others, timeZone)}. Read again with the id of the one the member meant; if it is not clear which, ask them.`;
}

/**
 * `"Chapter meeting" (already happened): Sunday, November 15, 2026 at 7:00
 * PM to 8:00 PM, at "the chapter room"`. The place is as an officer typed
 * it. The check-in zone and its coordinates are never read: no location
 * reaches a model.
 */
export function eventHeadline(event: Event, context: AgentToolContext): string {
  const over = Date.parse(event.end_time) < context.now.getTime();
  return `${quoted(event.name)}${over ? ' (already happened)' : ''}: ${longRange(event.start_time, event.end_time, context.timeZone)}${event.location ? `, at ${quoted(event.location)}` : ''}`;
}

export const ATTENDANCE_WORDS: Record<EventAttendanceStatus, string> = {
  PRESENT: 'present',
  LATE: 'late',
  ABSENT: 'absent',
  EXCUSED: 'excused',
};
