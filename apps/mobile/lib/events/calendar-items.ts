import { useMemo } from "react";
import { useCalendarBirthdays, useCalendarTasks } from "@repo/hooks";
import {
  ALL_CALENDAR_LAYERS,
  calendarKindOf,
  calendarTasksByDay,
  type CalendarItem,
  type CalendarKind,
} from "@repo/hooks/calendar-tasks";

/**
 * Everything on the phone's Calendar that isn't an event, by local day: the
 * member's own tasks on their due day and the ones they assigned (#4144), and
 * members' shared birthdays all day (#4959), less the kinds the Calendar's
 * key has switched off (`hidden`, #5948: tasks start off, since the Calendar
 * is the chapter's and Activity is where a member's tasks live). The month
 * and the Day screen read one set.
 *
 * `anchor` is any day in what is on screen; birthdays are read for its year
 * and the next (`useCalendarBirthdays`).
 */
export function useCalendarItemsByDay(
  anchor: Date,
  hidden: ReadonlySet<CalendarKind>,
): Map<string, CalendarItem[]> {
  const all = useAllCalendarItems(anchor);
  return useMemo(() => shownCalendarItemsByDay(all, hidden), [all, hidden]);
}

/**
 * `items` less the kinds `hidden` holds, by day: for a screen that already
 * read every item for the key's counts, so it doesn't read them twice.
 */
export function shownCalendarItemsByDay(
  items: readonly CalendarItem[],
  hidden: ReadonlySet<CalendarKind>,
): Map<string, CalendarItem[]> {
  return calendarTasksByDay(
    items.filter((item) => !hidden.has(calendarKindOf(item))),
    ALL_CALENDAR_LAYERS,
  );
}

/**
 * Every task and birthday, before the key: what the key counts, so a kind
 * switched off still says how many it holds back, as web's key does.
 */
export function useAllCalendarItems(anchor: Date): CalendarItem[] {
  const calendarTasks = useCalendarTasks();
  const birthdays = useCalendarBirthdays(anchor);
  return useMemo(
    () => [...calendarTasks.items, ...birthdays],
    [calendarTasks.items, birthdays],
  );
}
