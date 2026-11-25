/**
 * What a person changed when they decided on an AI suggestion (Paul,
 * 2026-11-22; `spec/behavior/ai.md` § Stored AI text): field by field,
 * whether what was saved kept, changed, added or removed what was proposed.
 *
 * Pure and storage-free. The result has two halves:
 *
 * - `fields`, codes, ids and numbers only, which the database holds to the
 *   same shape (`ai_suggestion_change_fields_ok`). A text field says only
 *   its verdict here.
 * - `words`, the text fields as proposed and as saved, which the caller
 *   keeps only sealed, and only when the decider said yes to Frapp Intelligence.
 */

export type ChangeFieldType =
  /** Free text (a title, a description): its verdict, and the words apart. */
  | 'text'
  /** One record by id (an owner, an event type). */
  | 'id'
  /** A set of records by id (invited roles, members given points). */
  | 'ids'
  /** A moment: both as epoch seconds, and the shift in minutes. */
  | 'instant'
  /** A day, `YYYY-MM-DD`: the shift in minutes (whole days). */
  | 'date'
  | 'number'
  | 'boolean';

export type ChangeFieldSpec = Readonly<Record<string, ChangeFieldType>>;

export type ChangeVerdict = 'kept' | 'changed' | 'added' | 'removed';

type ChangeValue = number | boolean | null | string | (string | number)[];

export interface FieldChange {
  verdict: ChangeVerdict;
  proposed?: ChangeValue;
  saved?: ChangeValue;
  delta_minutes?: number;
}

export interface SuggestionChanges {
  fields: Record<string, FieldChange>;
  /** Names of the fields whose verdict is not `kept`, for analytics. */
  changed: string[];
  /** The text fields as proposed and saved. Never stored unsealed. */
  words: {
    proposed: Record<string, string | null>;
    saved: Record<string, string | null>;
  };
}

/** A comparable view of a proposal or of what was saved, field by field. */
export type ChangeView = Readonly<Record<string, unknown>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_NAME = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_IDS = 200;
const MAX_FIELDS = 40;

function textOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function idOf(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value)
    ? value.toLowerCase()
    : null;
}

function idsOf(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  const list = Array.isArray(value) ? value : [value];
  const ids = [
    ...new Set(list.map(idOf).filter((id): id is string => id !== null)),
  ].sort();
  return ids.length > 0 ? ids.slice(0, MAX_IDS) : null;
}

function secondsOf(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.round(at / 1000);
}

function dayOf(value: unknown): number | null {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(at) ? null : Math.round(at / 1000);
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanOf(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function verdictOf(
  proposed: unknown,
  saved: unknown,
  same: boolean,
): ChangeVerdict | null {
  const hadProposed = proposed !== null;
  const hasSaved = saved !== null;
  if (!hadProposed && !hasSaved) return null;
  if (!hadProposed) return 'added';
  if (!hasSaved) return 'removed';
  return same ? 'kept' : 'changed';
}

function compareOne(
  type: ChangeFieldType,
  rawProposed: unknown,
  rawSaved: unknown,
): FieldChange | null {
  switch (type) {
    case 'text': {
      const p = textOf(rawProposed);
      const s = textOf(rawSaved);
      const verdict = verdictOf(p, s, p === s);
      return verdict ? { verdict } : null;
    }
    case 'id': {
      const p = idOf(rawProposed);
      const s = idOf(rawSaved);
      const verdict = verdictOf(p, s, p === s);
      return verdict ? { verdict, proposed: p, saved: s } : null;
    }
    case 'ids': {
      const p = idsOf(rawProposed);
      const s = idsOf(rawSaved);
      const verdict = verdictOf(p, s, JSON.stringify(p) === JSON.stringify(s));
      return verdict
        ? { verdict, proposed: p ?? null, saved: s ?? null }
        : null;
    }
    case 'instant':
    case 'date': {
      const read = type === 'instant' ? secondsOf : dayOf;
      const p = read(rawProposed);
      const s = read(rawSaved);
      const verdict = verdictOf(p, s, p === s);
      if (!verdict) return null;
      return {
        verdict,
        proposed: p,
        saved: s,
        ...(p !== null && s !== null
          ? { delta_minutes: Math.round((s - p) / 60) }
          : {}),
      };
    }
    case 'number': {
      const p = numberOf(rawProposed);
      const s = numberOf(rawSaved);
      const verdict = verdictOf(p, s, p === s);
      return verdict ? { verdict, proposed: p, saved: s } : null;
    }
    case 'boolean': {
      // False and unset read the same: a box nobody ticked.
      const p = booleanOf(rawProposed) ?? false;
      const s = booleanOf(rawSaved) ?? false;
      return { verdict: p === s ? 'kept' : 'changed', proposed: p, saved: s };
    }
  }
}

/**
 * Compares what was proposed with what was saved, over the fields `spec`
 * names. A field empty on both sides is left out, and so is one `saved`
 * has no key for (it couldn't be read back). `saved` null means
 * nothing was saved (dismissed, expired): only the proposal's words are
 * kept and no field is compared.
 */
export function compareSuggestion(
  spec: ChangeFieldSpec,
  proposed: ChangeView,
  saved: ChangeView | null,
): SuggestionChanges {
  const fields: Record<string, FieldChange> = {};
  const changed: string[] = [];
  const words: SuggestionChanges['words'] = { proposed: {}, saved: {} };
  for (const [name, type] of Object.entries(spec).slice(0, MAX_FIELDS)) {
    if (!FIELD_NAME.test(name)) continue;
    if (type === 'text') {
      words.proposed[name] = textOf(proposed[name]);
      if (saved && name in saved) words.saved[name] = textOf(saved[name]);
    }
    // Nothing was saved, or what was read back doesn't say (a task made in
    // its form names one copy's owner, not the group it went to).
    if (!saved || !(name in saved)) continue;
    const change = compareOne(type, proposed[name], saved[name]);
    if (!change) continue;
    fields[name] = change;
    if (change.verdict !== 'kept') changed.push(name);
  }
  return { fields, changed, words };
}

/**
 * Whether a `fields` object is the shape the database accepts, checked in
 * the API too so a bug is caught where it is made.
 */
export function changeFieldsAreCodes(fields: unknown): boolean {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return false;
  }
  const entries = Object.entries(fields as Record<string, unknown>);
  if (entries.length > MAX_FIELDS) return false;
  const valueOk = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      return (
        value.length <= MAX_IDS &&
        value.every(
          (item) =>
            (typeof item === 'number' && Number.isFinite(item)) ||
            (typeof item === 'string' && UUID.test(item)),
        )
      );
    }
    return (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && UUID.test(value))
    );
  };
  return entries.every(([name, change]) => {
    if (!FIELD_NAME.test(name)) return false;
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      return false;
    }
    const record = change as Record<string, unknown>;
    if (
      !['kept', 'changed', 'added', 'removed'].includes(
        record.verdict as string,
      )
    ) {
      return false;
    }
    return Object.entries(record).every(
      ([key, value]) =>
        key === 'verdict' ||
        (['proposed', 'saved', 'delta_minutes'].includes(key) &&
          valueOk(value)),
    );
  });
}
