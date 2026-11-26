import { BadRequestException } from '@nestjs/common';
import { resolveCreateTiming, resolveUpdateTiming } from './event-timing-input';

const NY = 'America/New_York';

describe('resolveCreateTiming', () => {
  it('keeps a timed create as it was', () => {
    expect(
      resolveCreateTiming(
        {
          start_time: '2027-01-14T02:00:00.000Z',
          end_time: '2027-01-14T03:00:00.000Z',
        },
        NY,
      ),
    ).toEqual({
      timing: 'timed',
      start_date: null,
      end_date: null,
      start_time: '2027-01-14T02:00:00.000Z',
      end_time: '2027-01-14T03:00:00.000Z',
    });
  });

  it('refuses a timed create with no times or an end before its start', () => {
    expect(() => resolveCreateTiming({}, NY)).toThrow(BadRequestException);
    expect(() =>
      resolveCreateTiming(
        {
          start_time: '2027-01-14T03:00:00.000Z',
          end_time: '2027-01-14T02:00:00.000Z',
        },
        NY,
      ),
    ).toThrow('end_time must be after start_time');
  });

  it("writes an all-day event's bounds as the zone's midnights", () => {
    expect(
      resolveCreateTiming(
        { timing: 'all_day', start_date: '2027-01-11', start_time: 'ignored' },
        NY,
      ),
    ).toEqual({
      timing: 'all_day',
      start_date: '2027-01-11',
      end_date: '2027-01-11',
      start_time: '2027-01-11T05:00:00.000Z',
      end_time: '2027-01-12T05:00:00.000Z',
    });
  });

  it('spans several days, through the last one', () => {
    const when = resolveCreateTiming(
      { timing: 'all_day', start_date: '2027-01-22', end_date: '2027-02-12' },
      NY,
    );
    expect(when.end_date).toBe('2027-02-12');
    expect(when.end_time).toBe('2027-02-13T05:00:00.000Z');
  });

  it('makes a TBD event one day, and refuses a span', () => {
    expect(
      resolveCreateTiming({ timing: 'time_tbd', start_date: '2027-01-14' }, NY),
    ).toMatchObject({ start_date: '2027-01-14', end_date: '2027-01-14' });
    expect(() =>
      resolveCreateTiming(
        {
          timing: 'time_tbd',
          start_date: '2027-01-14',
          end_date: '2027-01-15',
        },
        NY,
      ),
    ).toThrow(BadRequestException);
  });

  it('falls back to UTC for a missing or unknown zone', () => {
    expect(
      resolveCreateTiming(
        { timing: 'all_day', start_date: '2027-01-11' },
        'Not/AZone',
      ).start_time,
    ).toBe('2027-01-11T00:00:00.000Z');
    expect(
      resolveCreateTiming({ timing: 'all_day', start_date: '2027-01-11' }, null)
        .start_time,
    ).toBe('2027-01-11T00:00:00.000Z');
  });

  it('refuses days on a timed create', () => {
    expect(() =>
      resolveCreateTiming(
        {
          start_date: '2027-01-11',
          start_time: '2027-01-14T02:00:00.000Z',
          end_time: '2027-01-14T03:00:00.000Z',
        },
        NY,
      ),
    ).toThrow(BadRequestException);
  });
});

describe('resolveUpdateTiming', () => {
  const timed = {
    timing: 'timed' as const,
    start_date: null,
    end_date: null,
    start_time: '2027-01-15T02:00:00.000Z',
    end_time: '2027-01-15T03:00:00.000Z',
  };
  const allDay = {
    timing: 'all_day' as const,
    start_date: '2027-01-22',
    end_date: '2027-02-12',
    start_time: '2027-01-22T05:00:00.000Z',
    end_time: '2027-02-13T05:00:00.000Z',
  };

  it('changes nothing when nothing about when is sent', () => {
    expect(resolveUpdateTiming({}, timed, NY)).toBeNull();
  });

  it('keeps the local day when a timed event becomes all-day', () => {
    // 9 PM on January 14 in New York is 02:00Z on the 15th.
    expect(resolveUpdateTiming({ timing: 'all_day' }, timed, NY)).toMatchObject(
      { start_date: '2027-01-14', end_date: '2027-01-14' },
    );
  });

  it('makes a dated event timed when an older build sends only times', () => {
    expect(
      resolveUpdateTiming(
        {
          start_time: '2027-01-23T00:00:00.000Z',
          end_time: '2027-01-23T01:00:00.000Z',
        },
        allDay,
        NY,
      ),
    ).toMatchObject({ timing: 'timed', start_date: null, end_date: null });
  });

  it('needs times to make a dated event timed, rather than using its bounds', () => {
    expect(() => resolveUpdateTiming({ timing: 'timed' }, allDay, NY)).toThrow(
      BadRequestException,
    );
  });

  it('keeps the length when only the first day moves', () => {
    expect(
      resolveUpdateTiming({ start_date: '2027-01-29' }, allDay, NY),
    ).toMatchObject({ start_date: '2027-01-29', end_date: '2027-02-19' });
  });

  it('refuses days on a timed event', () => {
    expect(() =>
      resolveUpdateTiming({ start_date: '2027-01-11' }, timed, NY),
    ).toThrow(BadRequestException);
  });

  it('fills the other time from a timed event', () => {
    expect(
      resolveUpdateTiming({ end_time: '2027-01-15T04:00:00.000Z' }, timed, NY),
    ).toMatchObject({
      timing: 'timed',
      start_time: timed.start_time,
      end_time: '2027-01-15T04:00:00.000Z',
    });
  });
  it("moves a TBD event's day without its end being sent", () => {
    const tbd = {
      timing: 'time_tbd' as const,
      start_date: '2027-01-14',
      end_date: '2027-01-14',
      start_time: '2027-01-14T05:00:00.000Z',
      end_time: '2027-01-15T05:00:00.000Z',
    };
    expect(
      resolveUpdateTiming({ start_date: '2027-01-20' }, tbd, NY),
    ).toMatchObject({ start_date: '2027-01-20', end_date: '2027-01-20' });
    expect(
      resolveUpdateTiming(
        { timing: 'all_day', start_date: '2027-01-20' },
        tbd,
        NY,
      ),
    ).toMatchObject({ start_date: '2027-01-20', end_date: '2027-01-20' });
  });

  it('makes a multi-day event TBD on its first day', () => {
    expect(
      resolveUpdateTiming({ timing: 'time_tbd' }, allDay, NY),
    ).toMatchObject({ start_date: '2027-01-22', end_date: '2027-01-22' });
  });

  it('gives a dated event made timed by one bound an hour', () => {
    expect(
      resolveUpdateTiming(
        { start_time: '2027-01-23T00:00:00.000Z' },
        allDay,
        NY,
      ),
    ).toMatchObject({
      timing: 'timed',
      start_time: '2027-01-23T00:00:00.000Z',
      end_time: '2027-01-23T01:00:00.000Z',
    });
  });
});
