import { eventTakesAttendance, type EventTimingFields } from "@repo/validation";

/**
 * What Event details draws for an event's shape (#6098, `spec/behavior/
 * events.md` § Dates, tentative and on the calendar only).
 *
 * - **On the calendar only:** it's there for information, so nothing about
 *   attending: no check-in, no points, no roster to mark and no excuses.
 *   Who's coming reads "On the calendar only for everyone".
 * - **Time TBD:** the same until its time is set: no check-in, points,
 *   roster or excuses (the API refuses each with a 409).
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
  // One rule for all four: an event that takes no attendance (on the
  // calendar only, or time TBD) has nothing to check in to, earn, mark or
  // be excused from; the API answers 409 to each.
  const takes = eventTakesAttendance(event);
  return {
    checkIn: takes,
    points: takes,
    roster: takes,
    excuses: takes,
    tentative: event.is_tentative === true,
  };
}
