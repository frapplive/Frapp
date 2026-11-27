import { addEventDays } from '@repo/validation';
import { createHash } from 'node:crypto';
import type { GoogleCalendarEventInput } from '#domain/adapters/google-calendar.interface';
import type { IcsItem } from '../calendar-feed/ics';

/**
 * Frapp's calendar items as Google Calendar events (#3322, step 2). Pure, so
 * the shapes Google holds Frapp to are pinned by unit tests.
 *
 * The items are the ones the subscription link serves
 * (`CalendarFeedService.memberItems`), so the two never disagree about what a
 * member's calendar holds.
 */

const MINUTE_MS = 60 * 1000;
/** How long an item with no length (a task's due time) is shown for. */
const POINT_LENGTH_MS = 30 * MINUTE_MS;

/**
 * The event's id in Google: stable for the item, so every sync writes the
 * same event rather than a new one. Google allows the letters a to v and the
 * digits (base32hex), 5 to 1024 of them; a hex digest is within that.
 */
export function googleEventId(uid: string): string {
  return `f${createHash('sha256').update(uid).digest('hex').slice(0, 40)}`;
}

export function toGoogleEvent(item: IcsItem): GoogleCalendarEventInput {
  const isTask = item.uid.startsWith('task-');
  const { start, end } = googleTimes(item);
  const body = {
    id: googleEventId(item.uid),
    summary: item.summary,
    description: item.description ?? '',
    location: item.location,
    start,
    end,
    sourceUrl: item.url,
    // A due time marks a moment; it should not show the member as busy.
    transparent: isTask,
    // Spread in only when set, so an event that never was tentative keeps
    // the hash it had and isn't rewritten (#6098).
    ...(item.tentative ? { tentative: true } : {}),
  };
  return { ...body, hash: hashOf(body) };
}

function googleTimes(item: IcsItem): {
  start: GoogleCalendarEventInput['start'];
  end: GoogleCalendarEventInput['end'];
} {
  if (item.when.kind === 'day') {
    // Google's all-day end date is exclusive: the day after the last day.
    return {
      start: { date: item.when.date },
      end: { date: nextDay(item.when.endDate ?? item.when.date) },
    };
  }
  const startMs = Date.parse(item.when.start);
  const endMs = Date.parse(item.when.end);
  // Google refuses an event that ends when it starts ("time range is empty"),
  // so an item with no length gets a short one.
  const end = endMs > startMs ? endMs : startMs + POINT_LENGTH_MS;
  return {
    start: { dateTime: new Date(startMs).toISOString() },
    end: { dateTime: new Date(end).toISOString() },
  };
}

function nextDay(date: string): string {
  return addEventDays(date, 1) ?? date;
}

/**
 * What a write carries, short. Kept on the event in Google, so a sync rewrites
 * only the events whose content changed. It covers an event's timing and days
 * (`start`/`end` as dates or date-times, "Time TBD" leading the description)
 * and whether it's on the calendar only (no "Required" in the description),
 * so a change to any of them re-syncs (#6098).
 */
function hashOf(body: Omit<GoogleCalendarEventInput, 'hash'>): string {
  return createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex')
    .slice(0, 16);
}
