import { googleEventId, toGoogleEvent } from './google-calendar-events';
import type { IcsItem } from '../calendar-feed/ics';

function item(overrides: Partial<IcsItem> = {}): IcsItem {
  return {
    uid: 'event-1f6c2f43-0000-4000-8000-000000000001@frapp.live',
    when: {
      kind: 'instant',
      start: '2026-11-14T00:00:00.000Z',
      end: '2026-11-14T01:00:00.000Z',
    },
    summary: 'Chapter meeting',
    description: 'Open in Frapp: https://app.frapp.live/events?event=1',
    location: 'House',
    url: 'https://app.frapp.live/events?event=1',
    ...overrides,
  };
}

describe('googleEventId', () => {
  it('is stable, and within Google’s id alphabet (a to v, digits) and length', () => {
    const id = googleEventId(item().uid);

    expect(id).toBe(googleEventId(item().uid));
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(googleEventId('task-x@frapp.live')).not.toBe(id);
  });
});

describe('toGoogleEvent', () => {
  it('writes an event at its times, opaque, with its page as the source', () => {
    const event = toGoogleEvent(item());

    expect(event).toMatchObject({
      summary: 'Chapter meeting',
      location: 'House',
      start: { dateTime: '2026-11-14T00:00:00.000Z' },
      end: { dateTime: '2026-11-14T01:00:00.000Z' },
      sourceUrl: 'https://app.frapp.live/events?event=1',
      transparent: false,
    });
  });

  it('gives an item with no length half an hour, since Google refuses an empty range', () => {
    const event = toGoogleEvent(
      item({
        uid: 'task-1@frapp.live',
        when: {
          kind: 'instant',
          start: '2026-11-20T17:00:00.000Z',
          end: '2026-11-20T17:00:00.000Z',
        },
      }),
    );

    expect(event.end).toEqual({ dateTime: '2026-11-20T17:30:00.000Z' });
    // A due time does not make the member busy.
    expect(event.transparent).toBe(true);
  });

  it('ends an all-day item on the next day, as Google’s end date is exclusive', () => {
    const event = toGoogleEvent(
      item({ when: { kind: 'day', date: '2026-12-31' } }),
    );

    expect(event.start).toEqual({ date: '2026-12-31' });
    expect(event.end).toEqual({ date: '2027-01-01' });
  });

  it('hashes what it writes: the same item the same, any change different', () => {
    const hash = toGoogleEvent(item()).hash;

    expect(toGoogleEvent(item()).hash).toBe(hash);
    expect(toGoogleEvent(item({ summary: 'Moved meeting' })).hash).not.toBe(
      hash,
    );
    expect(toGoogleEvent(item({ location: null })).hash).not.toBe(hash);
  });
});

describe('toGoogleEvent, dated events (#6098)', () => {
  it('marks a tentative event tentative, and leaves every other event as it was', () => {
    const plain = toGoogleEvent(item());
    const maybe = toGoogleEvent(item({ tentative: true }));

    expect(plain).not.toHaveProperty('tentative');
    expect(maybe.tentative).toBe(true);
    expect(maybe.hash).not.toBe(plain.hash);
  });

  it('writes a one-day all-day event on its date, ending the next day', () => {
    const event = toGoogleEvent(
      item({ when: { kind: 'day', date: '2027-01-11' } }),
    );

    expect(event.start).toEqual({ date: '2027-01-11' });
    expect(event.end).toEqual({ date: '2027-01-12' });
  });

  it('writes a multi-day all-day event ending the day after its last day', () => {
    const event = toGoogleEvent(
      item({
        when: { kind: 'day', date: '2027-01-22', endDate: '2027-02-12' },
      }),
    );

    expect(event.start).toEqual({ date: '2027-01-22' });
    expect(event.end).toEqual({ date: '2027-02-13' });
  });

  it('re-syncs when the timing, the days or the Required line change', () => {
    const timed = toGoogleEvent(item()).hash;
    const oneDay = toGoogleEvent(
      item({ when: { kind: 'day', date: '2027-01-11' } }),
    ).hash;
    const twoDays = toGoogleEvent(
      item({
        when: { kind: 'day', date: '2027-01-11', endDate: '2027-01-12' },
      }),
    ).hash;
    const tbd = toGoogleEvent(
      item({
        when: { kind: 'day', date: '2027-01-11' },
        description: `Time TBD\n\n${item().description}`,
      }),
    ).hash;
    // A calendar-only event drops "Required" from the description.
    const required = toGoogleEvent(
      item({ description: `${item().description}\n\nRequired` }),
    ).hash;

    expect(new Set([timed, oneDay, twoDays, tbd, required]).size).toBe(5);
  });
});
