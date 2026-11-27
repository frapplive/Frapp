/**
 * What Edit details on a meeting's minutes sends to its event
 * (`components/minutes/minutes-details-sheet.tsx`, #5562): only what changed.
 *
 * Times sent without `timing` make an event timed (`spec/behavior/events.md`
 * § Dates, tentative and on the calendar only, #6098), so a rename of an
 * all-day or time-TBD meeting sends its name alone, and the sheet draws no
 * time fields for one: its days are changed in the event's own editor.
 * `MeetingDto` carries no timing fields, so `dated` comes from the event's
 * own read.
 */
export function minutesEventPatch(
  values: { name: string; start: Date; end: Date | null },
  stored: { name: string; start: Date; end: Date | null },
  dated: boolean,
): { name?: string; start_time?: string; end_time?: string } {
  const patch: { name?: string; start_time?: string; end_time?: string } = {};
  const name = values.name.trim();
  if (name !== stored.name) patch.name = name;
  if (dated) return patch;
  if (values.start.getTime() !== stored.start.getTime()) {
    patch.start_time = values.start.toISOString();
  }
  if (values.end && values.end.getTime() !== stored.end?.getTime()) {
    patch.end_time = values.end.toISOString();
  }
  return patch;
}
