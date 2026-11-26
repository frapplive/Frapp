import { formatEventRelativeWhen } from "@repo/formatting";
import { eventIsDated, eventTimingFieldsOf } from "@repo/validation";

/**
 * An event's when on a surface that words a timed event its own way (a
 * meeting picker's "Fri 7:00 PM", the welcome card's day): an all-day or
 * time-TBD event reads by its days instead, "Friday · All day", never the
 * midnight it is stored at (#6098). `dated` overrides the words for one.
 */
export function eventWhenOr(
  event: Record<string, unknown>,
  timed: (start: string) => string | null,
  dated: (event: Record<string, unknown>) => string | null = (record) =>
    formatEventRelativeWhen(record),
): string {
  if (eventIsDated(eventTimingFieldsOf(event))) return dated(event) ?? "";
  return typeof event.start_time === "string"
    ? (timed(event.start_time) ?? "")
    : "";
}
