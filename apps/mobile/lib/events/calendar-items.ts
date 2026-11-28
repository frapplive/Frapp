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
 * key hides (`useHiddenCalendarKinds`; Tasks until the member turns them on,
 * #5948). The month and the Day screen read one set. The chips that switched
 * kinds off went in #5310 (Paul: no switchers); the key is a colour legend,
 * as web's.
 *
 * `anchor` is any day in what is on screen; birthdays are read for its year
 * and the next (`useCalendarBirthdays`).
 */
export function useCalendarItemsByDay(
  anchor: Date,
  hidden: ReadonlySet<CalendarKind>,
): Map<string, CalendarItem[]> {
  const calendarTasks = useCalendarTasks();
  const birthdays = useCalendarBirthdays(anchor);
  return useMemo(
    () =>
      calendarTasksByDay(
        [...calendarTasks.items, ...birthdays].filter(
          (item) => !hidden.has(calendarKindOf(item)),
        ),
        ALL_CALENDAR_LAYERS,
      ),
    [calendarTasks.items, birthdays, hidden],
  );
}
