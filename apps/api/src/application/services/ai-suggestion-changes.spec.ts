import {
  changeFieldsAreCodes,
  compareSuggestion,
} from '#domain/utils/ai-suggestion-changes';
import {
  newEventChangeView,
  savedEventChangeView,
} from './ai-suggestion-new-event-kind';
import type { Event } from '#domain/entities/event.entity';

const EXEC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAIRS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('compareSuggestion (Paul, 2026-11-22)', () => {
  it('reads kept, changed, added and removed, and leaves out fields empty on both sides', () => {
    const { fields, changed, words } = compareSuggestion(
      {
        title: 'text',
        note: 'text',
        location: 'text',
        owner: 'id',
        points: 'number',
        empty: 'text',
      },
      { title: 'Formal', note: 'Bring a date', owner: null, points: 5 },
      {
        title: 'Spring formal',
        note: null,
        location: 'The hall',
        owner: EXEC,
        points: 5,
        empty: null,
      },
    );
    expect(fields).toEqual({
      title: { verdict: 'changed' },
      note: { verdict: 'removed' },
      location: { verdict: 'added' },
      owner: { verdict: 'added', proposed: null, saved: EXEC },
      points: { verdict: 'kept', proposed: 5, saved: 5 },
    });
    expect(changed).toEqual(['title', 'note', 'location', 'owner']);
    expect(words.proposed).toEqual({
      title: 'Formal',
      note: 'Bring a date',
      location: null,
      empty: null,
    });
    expect(words.saved.title).toBe('Spring formal');
    expect(changeFieldsAreCodes(fields)).toBe(true);
  });

  it('compares sets of ids in any order, and moments as a shift in minutes', () => {
    const { fields } = compareSuggestion(
      { roles: 'ids', start: 'instant', due: 'date' },
      {
        roles: [CHAIRS, EXEC],
        start: '2026-12-05T00:00:00.000Z',
        due: '2026-12-01',
      },
      {
        roles: [EXEC, CHAIRS],
        start: '2026-12-05T00:30:00.000Z',
        due: '2026-12-03',
      },
    );
    expect(fields.roles.verdict).toBe('kept');
    expect(fields.start).toMatchObject({
      verdict: 'changed',
      delta_minutes: 30,
    });
    expect(fields.due).toMatchObject({
      verdict: 'changed',
      delta_minutes: 2880,
    });
  });

  it('compares nothing when nothing was saved, and skips what could not be read back', () => {
    expect(compareSuggestion({ a: 'text' }, { a: 'x' }, null).fields).toEqual(
      {},
    );
    expect(
      compareSuggestion({ a: 'text', b: 'id' }, { a: 'x', b: EXEC }, { a: 'x' })
        .fields,
    ).toEqual({ a: { verdict: 'kept' } });
  });

  it('logs the FSL case: an event Ask opened to everyone, saved for two roles in the form', () => {
    const proposed = newEventChangeView({
      name: 'FSL Leaders Reception',
      description: null,
      location: null,
      start_time: '2026-12-02T00:00:00.000Z',
      end_time: '2026-12-02T01:00:00.000Z',
      point_value: 5,
      is_mandatory: false,
    });
    const saved = savedEventChangeView({
      name: 'FSL Leaders Reception',
      description: null,
      location: null,
      start_time: '2026-12-02T00:30:00.000Z',
      end_time: '2026-12-02T01:30:00.000Z',
      point_value: 5,
      is_mandatory: false,
      recurrence_rule: null,
      event_type_id: null,
      required_role_ids: null,
      optional_role_ids: [EXEC, CHAIRS],
      excluded_role_ids: null,
    } as unknown as Event);
    const { fields, changed } = compareSuggestion(
      {
        name: 'text',
        start_time: 'instant',
        length_minutes: 'number',
        point_value: 'number',
        optional_role_ids: 'ids',
      },
      proposed,
      saved,
    );
    expect(fields.optional_role_ids).toEqual({
      verdict: 'added',
      proposed: null,
      saved: [EXEC, CHAIRS].sort(),
    });
    expect(fields.length_minutes.verdict).toBe('kept');
    expect(changed).toEqual(['start_time', 'optional_role_ids']);
  });
});

describe('changeFieldsAreCodes', () => {
  it('refuses a sentence anywhere', () => {
    expect(
      changeFieldsAreCodes({
        title: { verdict: 'changed', saved: 'a phrase' },
      }),
    ).toBe(false);
    expect(changeFieldsAreCodes({ title: { verdict: 'rewritten' } })).toBe(
      false,
    );
    expect(changeFieldsAreCodes({ 'Bad Name': { verdict: 'kept' } })).toBe(
      false,
    );
    expect(changeFieldsAreCodes({ title: { verdict: 'kept', note: 1 } })).toBe(
      false,
    );
  });
});
