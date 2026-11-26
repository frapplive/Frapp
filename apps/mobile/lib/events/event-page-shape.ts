import { eventTakesAttendance, type EventTimingFields } from "@repo/validation";

/**
 * What Event details draws for an event's shape (#6098, `spec/behavior/
 * events.md` § Dates, tentative and on the calendar only).
 *
 * - **On the calendar only:** it's there for information, so nothing about
 *   attending: no check-in, no points, no roster to mark and no excuses.
 *   Who's coming reads "On the calendar only for everyone".
 * - **Time TBD:** no check-in until its time is set (the API refuses one).
 * - **Tentative:** a neutral chip beside the name.
 */
export interface EventPageShows {
  checkIn: boolean;
  points: boolean;
  roster: boolean;
  excuses: boolean;
  tentative: boolean;
}

export function eventPageShows(event: EventTimingFields): EventPageShows {
  const calendarOnly = event.calendar_only === true;
  return {
    checkIn: eventTakesAttendance(event),
    points: !calendarOnly,
    roster: !calendarOnly,
    excuses: !calendarOnly,
    tentative: event.is_tentative === true,
  };
}
