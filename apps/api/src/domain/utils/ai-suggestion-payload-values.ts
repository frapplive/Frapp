/**
 * Reading a stored suggestion payload's values back: a payload is JSON a
 * model or an earlier release wrote, so each value is checked, and one that
 * doesn't hold is read as absent rather than trusted.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Longer than any ISO 8601 instant, so a model's essay is not one. */
const INSTANT_MAX_LENGTH = 40;

/** A real calendar day as `YYYY-MM-DD` (no zone), else null. */
export function dateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

/** A parseable instant, as written, else null. */
export function instantOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > INSTANT_MAX_LENGTH) {
    return null;
  }
  return Number.isNaN(Date.parse(value)) ? null : value;
}
