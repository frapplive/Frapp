import {
  changeFieldsAreCodes,
  compareSuggestion,
} from '#domain/utils/ai-suggestion-changes';
import {
  NewEventSuggestionKind,
  newEventChangeView,
  savedEventChangeView,
} from './ai-suggestion-new-event-kind';
import type { AiSuggestion } from '#domain/entities/ai-suggestion.entity';
import type { Event } from '#domain/entities/event.entity';
import { parseAiTextKeyRing } from '#domain/utils/ai-text-cipher';
import { AiSuggestionChangeLogService } from './ai-suggestion-change-log.service';

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
      // Only those two roles: nobody else is invited.
      others_invited: false,
    } as unknown as Event);
    const { fields, changed } = compareSuggestion(
      {
        name: 'text',
        start_time: 'instant',
        length_minutes: 'number',
        point_value: 'number',
        optional_role_ids: 'ids',
        others_invited: 'boolean',
      },
      proposed,
      saved,
    );
    expect(fields.optional_role_ids).toEqual({
      verdict: 'added',
      proposed: null,
      saved: [EXEC, CHAIRS].sort(),
    });
    // Ask's card invited the whole chapter; the saved event only the roles.
    expect(fields.others_invited).toEqual({
      verdict: 'changed',
      proposed: true,
      saved: false,
    });
    expect(fields.length_minutes.verdict).toBe('kept');
    expect(changed).toEqual([
      'start_time',
      'optional_role_ids',
      'others_invited',
    ]);
  });
});

describe('AiSuggestionChangeLogService with an event card made in its form', () => {
  const CHAPTER = '11111111-1111-4111-8111-111111111111';
  const OFFICER = '22222222-2222-4222-8222-222222222222';
  const EVENT = '33333333-3333-4333-8333-333333333333';
  const RING = parseAiTextKeyRing(
    `test:${Buffer.alloc(32, 9).toString('base64')}`,
  );
  const proposal = {
    name: 'FSL Leaders Reception',
    start_time: '2026-12-02T00:00:00.000Z',
    end_time: '2026-12-02T01:00:00.000Z',
    point_value: 5,
    is_mandatory: false,
  };
  const savedEvent = {
    id: EVENT,
    chapter_id: CHAPTER,
    created_by: OFFICER,
    name: 'FSL Leaders Reception',
    description: 'Formal dress',
    location: null,
    start_time: '2026-12-02T00:00:00.000Z',
    end_time: '2026-12-02T01:00:00.000Z',
    point_value: 5,
    is_mandatory: false,
    recurrence_rule: null,
    event_type_id: null,
    required_role_ids: null,
    optional_role_ids: [EXEC, CHAIRS],
    excluded_role_ids: null,
    others_invited: false,
  } as unknown as Event;

  function build(row: Partial<AiSuggestion> = {}) {
    const events = { findById: jest.fn(async () => savedEvent) };
    const handler = new NewEventSuggestionKind(events as never, {} as never);
    const recordChanges = jest.fn(async () => undefined);
    const log = new AiSuggestionChangeLogService(
      { recordChanges } as never,
      {
        findByUserAndChapter: jest.fn(async () => ({ id: 'member-1' })),
      } as never,
      { getConsentState: jest.fn(async () => ({ answer: 'yes' })) } as never,
    );
    log.keyRing = () => RING;
    const decided = {
      row: {
        id: '44444444-4444-4444-8444-444444444444',
        chapter_id: CHAPTER,
        batch_id: '55555555-5555-4555-8555-555555555555',
        kind: 'new_event',
        source_type: 'request',
        requested_for: OFFICER,
        ask_id: null,
        request_sealed: null,
        drew_on_chat: false,
        payload: proposal,
        ...row,
      } as unknown as AiSuggestion,
      decision: 'accepted' as const,
      userId: OFFICER,
      handler,
      accepted: { ...proposal, event_id: EVENT },
      resultId: EVENT,
    };
    return { log, events, recordChanges, decided };
  }

  it('reads the event back as saved and logs it as made in the form', async () => {
    const { log, events, recordChanges, decided } = build();
    const changes = await log.compare(decided);
    expect(events.findById).toHaveBeenCalledWith(EVENT, CHAPTER);
    expect(changes?.changed).toEqual([
      'description',
      'optional_role_ids',
      'others_invited',
    ]);
    await log.recordDecision(
      decided,
      changes,
      new Date('2026-11-22T12:00:00Z'),
    );
    const [[rows]] = recordChanges.mock.calls as unknown as [
      [Array<Record<string, unknown>>],
    ];
    expect(rows[0]).toMatchObject({
      via: 'form',
      decided_at: '2026-11-22T12:00:00.000Z',
      expires_at: '2027-02-20T12:00:00.000Z',
    });
    expect(rows[0].words_sealed).toEqual(expect.any(String));
  });

  it('keeps the changes but no words for a card drawn from chat', async () => {
    const { log, recordChanges, decided } = build({ drew_on_chat: true });
    await log.recordDecision(decided, await log.compare(decided), new Date());
    const [[rows]] = recordChanges.mock.calls as unknown as [
      [Array<Record<string, unknown>>],
    ];
    expect(rows[0].words_sealed).toBeNull();
    expect(rows[0].fields).toHaveProperty('others_invited');
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
