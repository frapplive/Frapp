import { localIsoDate, parseInstant } from "@repo/formatting";
import {
  eventDatedDays,
  eventIsDated,
  type EventTimingFields,
} from "@repo/validation";

/**
 * Which calendar days an event sits on, for the Calendar's month and its Day
 * screen (#6098, `spec/behavior/events.md` § Dates, tentative and on the
 * calendar only).
 *
 * A timed event sits on the viewer's local day of its start. An all-day or
 * time-TBD event sits on each of its own days, read from its zone-free
 * `start_date` to its last day (`eventCoversDay`'s rule), never from its
 * stored instants, which are the saver's midnights and would land a member
 * in another zone a day early. Google Calendar and Apple Calendar draw a
 * multi-day event on every day it spans the same way.
 */

/** The `YYYY-MM-DD` days `event` sits on; none for a row that doesn't read. */
export function eventDayKeys(
  event: EventTimingFields & { start_time?: unknown },
): string[] {
  if (eventIsDated(event)) return eventDatedDays(event);
  const start = parseInstant(event.start_time);
  return start ? [localIsoDate(start)] : [];
}

/**
 * Events filed by day. Within a day the dated ones lead, as Google Calendar
 * lists the day's all-day events above its timed ones; each part keeps the
 * order `events` came in (start order, from `selectAllEventRows`).
 */
export function eventsByDay<
  E extends EventTimingFields & { start_time?: unknown },
>(events: readonly E[]): Map<string, E[]> {
  const map = new Map<string, E[]>();
  const file = (event: E) => {
    for (const key of eventDayKeys(event)) {
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
  };
  for (const event of events) if (eventIsDated(event)) file(event);
  for (const event of events) if (!eventIsDated(event)) file(event);
  return map;
}

/**
 * What the Calendar's key counts for the month on screen (#5948): its events
 * (each once, however many of its days fall in the month), and its task and
 * birthday items, each once. Counted before the key hides anything, so a
 * kind switched off still says how many it holds back.
 */
export function monthKindCounts(
  month: Date,
  events: readonly (EventTimingFields & { id: string; start_time?: unknown })[],
  items: readonly { kind: string; day: string }[],
): { events: number; tasks: number; birthdays: number } {
  const prefix = localIsoDate(month).slice(0, 7);
  const inMonth = (day: string) => day.startsWith(prefix);
  let eventCount = 0;
  for (const event of events) {
    if (eventDayKeys(event).some(inMonth)) eventCount += 1;
  }
  let tasks = 0;
  let birthdays = 0;
  for (const item of items) {
    if (!inMonth(item.day)) continue;
    if (item.kind === "birthdays") birthdays += 1;
    else tasks += 1;
  }
  return { events: eventCount, tasks, birthdays };
}
