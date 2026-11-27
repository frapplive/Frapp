import {
  formatDueDate,
  formatEventDays,
  formatEventWhen,
  joinFacts,
  taskSubmittedCopy,
  taskExtensionAskedCopy,
  taskExtensionDecidedCopy,
} from './push-copy';

const NOW = new Date('2026-11-06T12:00:00Z');
const NY = { timeZone: 'America/New_York', now: NOW };

describe('formatEventWhen', () => {
  it('writes a same-day event the way a calendar does', () => {
    expect(
      formatEventWhen('2026-11-10T01:00:00Z', '2026-11-10T02:00:00Z', NY),
    ).toBe('Mon, Nov 9, 8–9 PM');
  });

  it('keeps minutes only when there are some', () => {
    expect(
      formatEventWhen('2026-11-10T01:30:00Z', '2026-11-10T02:45:00Z', NY),
    ).toBe('Mon, Nov 9, 8:30–9:45 PM');
  });

  it('names both halves of the day when the span crosses noon', () => {
    expect(
      formatEventWhen('2026-11-09T16:00:00Z', '2026-11-09T18:00:00Z', NY),
    ).toBe('Mon, Nov 9, 11 AM–1 PM');
  });

  it("renders in the reader's zone, so the day can change", () => {
    // 04:30Z is Monday night in Los Angeles and Tuesday morning in London.
    const start = '2026-11-10T04:30:00Z';
    const end = '2026-11-10T05:30:00Z';
    expect(
      formatEventWhen(start, end, {
        timeZone: 'America/Los_Angeles',
        now: NOW,
      }),
    ).toBe('Mon, Nov 9, 8:30–9:30 PM');
    expect(
      formatEventWhen(start, end, { timeZone: 'Europe/London', now: NOW }),
    ).toBe('Tue, Nov 10, 4:30–5:30 AM');
  });

  it('writes both ends of an event that spans days', () => {
    expect(
      formatEventWhen('2026-11-07T23:00:00Z', '2026-11-09T17:00:00Z', NY),
    ).toBe('Sat, Nov 7, 6 PM – Mon, Nov 9, 12 PM');
  });

  it('adds the year only when it is not this year', () => {
    expect(
      formatEventWhen('2027-01-15T23:00:00Z', '2027-01-16T00:00:00Z', NY),
    ).toBe('Fri, Jan 15, 2027, 6–7 PM');
  });

  it('labels the zone when it is a guess', () => {
    expect(
      formatEventWhen('2026-11-10T01:00:00Z', '2026-11-10T02:00:00Z', {
        ...NY,
        labelZone: true,
      }),
    ).toBe('Mon, Nov 9, 8–9 PM EST');
  });

  it('writes a series as its pattern', () => {
    const start = '2026-11-10T01:00:00Z';
    const end = '2026-11-10T02:00:00Z';
    expect(formatEventWhen(start, end, { ...NY, recurrence: 'WEEKLY' })).toBe(
      'Every Mon, 8–9 PM, from Nov 9',
    );
    expect(formatEventWhen(start, end, { ...NY, recurrence: 'BIWEEKLY' })).toBe(
      'Every other Mon, 8–9 PM, from Nov 9',
    );
    expect(formatEventWhen(start, end, { ...NY, recurrence: 'MONTHLY' })).toBe(
      'Monthly on the 9th, 8–9 PM, from Nov 9',
    );
  });

  it('writes a structured repeat rule as its pattern (#4488)', () => {
    const start = '2026-11-10T01:00:00Z';
    const end = '2026-11-10T02:00:00Z';
    expect(
      formatEventWhen(start, end, {
        ...NY,
        recurrence:
          'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH;COUNT=10;TZID=America/New_York',
      }),
    ).toBe('Every Mon and Thu, 8–9 PM, from Nov 9');
    expect(
      formatEventWhen(start, end, {
        ...NY,
        recurrence:
          'FREQ=MONTHLY;INTERVAL=1;BYDAY=2MO;COUNT=4;TZID=America/New_York',
      }),
    ).toBe('Every month on the second Monday, 8–9 PM, from Nov 9');
  });

  it("names a structured rule's days as the recipient's calendar has them", () => {
    // Mon 10 PM in Los Angeles is Tue 1 AM in New York.
    expect(
      formatEventWhen('2026-11-10T06:00:00Z', '2026-11-10T07:00:00Z', {
        ...NY,
        recurrence:
          'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH;COUNT=10;TZID=America/Los_Angeles',
      }),
    ).toBe('Every Tue and Fri, 1–2 AM, from Nov 10');
  });

  it('keeps the pattern for a weekly event that runs past midnight', () => {
    expect(
      formatEventWhen('2026-11-14T03:00:00Z', '2026-11-14T07:00:00Z', {
        ...NY,
        recurrence: 'WEEKLY',
      }),
    ).toBe('Every Fri, 10 PM–2 AM, from Nov 13');
  });

  it('writes a start alone when the end is missing or not after it', () => {
    expect(formatEventWhen('2026-11-10T01:00:00Z', null, NY)).toBe(
      'Mon, Nov 9, 8 PM',
    );
    expect(
      formatEventWhen('2026-11-10T01:00:00Z', '2026-11-10T01:00:00Z', NY),
    ).toBe('Mon, Nov 9, 8 PM');
  });

  it('writes midnight and noon as a clock does', () => {
    expect(
      formatEventWhen('2026-11-10T05:00:00Z', '2026-11-10T17:00:00Z', NY),
    ).toBe('Tue, Nov 10, 12 AM–12 PM');
  });
});

describe('formatDueDate', () => {
  it('writes a calendar date as written, in no zone', () => {
    expect(formatDueDate('2026-11-14', NOW)).toBe('Sat, Nov 14');
    expect(formatDueDate('2027-03-01', NOW)).toBe('Mon, Mar 1, 2027');
  });

  it('passes an unreadable value through', () => {
    expect(formatDueDate('soon', NOW)).toBe('soon');
  });
});

describe('joinFacts', () => {
  it('drops empty facts', () => {
    expect(joinFacts('Required', null, '', undefined, false, 'The Lodge')).toBe(
      'Required · The Lodge',
    );
  });
});

describe('taskSubmittedCopy (a task marked done, to its officer)', () => {
  const task = {
    title: 'Clean his room',
    point_reward: 10,
    proof_kind: 'photo',
    proof_link: null,
    completion_note: null,
  };

  it('leads with who and the action, then what came with it, and asks nothing (#5732)', () => {
    expect(
      taskSubmittedCopy('Shawn Klein', task, {
        photoCount: 1,
        resubmitted: false,
      }),
    ).toEqual({
      title: 'Shawn Klein submitted: Clean his room',
      body: '1 photo · 10 points',
    });
  });

  it('quotes the reply on a resubmission, the thing that changed', () => {
    expect(
      taskSubmittedCopy(
        'Shawn Klein',
        { ...task, completion_note: 'Did the closet too' },
        { photoCount: 2, resubmitted: true },
      ),
    ).toEqual({
      title: 'Shawn Klein resubmitted: Clean his room',
      body: 'Replied "Did the closet too" · 2 photos · 10 points',
    });
  });

  it('names a link, and nothing more when there are no points', () => {
    expect(
      taskSubmittedCopy(
        'Marcus Hill',
        {
          ...task,
          title: 'Submit the IFC form',
          point_reward: null,
          proof_kind: 'link',
          proof_link: 'https://forms.example/ifc',
        },
        { photoCount: 0, resubmitted: false },
      ).body,
    ).toBe('Link attached');
  });

  it('says finished, and Done, for a task that needed no sign-off', () => {
    expect(
      taskSubmittedCopy(
        'Sam Ortiz',
        { ...task, point_reward: 0, proof_kind: 'none' },
        { photoCount: 0, resubmitted: false },
      ),
    ).toEqual({
      title: 'Sam Ortiz finished: Clean his room',
      body: 'Done',
    });
  });

  it('cuts a long note', () => {
    const { body } = taskSubmittedCopy(
      'Shawn Klein',
      { ...task, completion_note: 'x'.repeat(200) },
      { photoCount: 0, resubmitted: false },
    );
    expect(body.startsWith(`"${'x'.repeat(59)}…"`)).toBe(true);
  });

  it('never splits an emoji at the cut', () => {
    const { body } = taskSubmittedCopy(
      'Shawn Klein',
      { ...task, completion_note: `${'x'.repeat(58)}👍 thanks for the help` },
      { photoCount: 0, resubmitted: false },
    );
    expect(body.startsWith(`"${'x'.repeat(58)}👍…"`)).toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(body)).toBe(false);
  });
});

describe('formatEventWhen, dated events (#6098)', () => {
  const NEW_YEAR = new Date('2027-01-01T12:00:00Z');
  // A New York request's midnight bounds: never read as clock times.
  const start = '2027-01-11T05:00:00Z';
  const end = '2027-01-12T05:00:00Z';

  it('writes a one-day all-day event as its day, in any zone', () => {
    const dates = {
      timing: 'all_day',
      start_date: '2027-01-11',
      end_date: '2027-01-11',
    };
    for (const timeZone of ['America/Los_Angeles', 'Asia/Tokyo']) {
      expect(
        formatEventWhen(start, end, {
          timeZone,
          labelZone: true,
          now: NEW_YEAR,
          dates,
        }),
      ).toBe('Mon, Jan 11 · All day');
    }
  });

  it('writes a multi-day all-day event as its first and last days', () => {
    expect(
      formatEventDays(
        { timing: 'all_day', start_date: '2027-01-22', end_date: '2027-02-12' },
        NEW_YEAR,
      ),
    ).toBe('Jan 22 – Feb 12 · All day');
    expect(
      formatEventDays(
        { timing: 'all_day', start_date: '2026-12-28', end_date: '2027-01-03' },
        NEW_YEAR,
      ),
    ).toBe('Dec 28, 2026 – Jan 3, 2027 · All day');
  });

  it('writes a time-TBD event as its day and Time TBD', () => {
    expect(
      formatEventWhen(start, end, {
        timeZone: 'America/New_York',
        now: NEW_YEAR,
        dates: {
          timing: 'time_tbd',
          start_date: '2027-01-14',
          end_date: '2027-01-14',
        },
      }),
    ).toBe('Thu, Jan 14 · Time TBD');
  });

  it('leaves a timed event to its clock times', () => {
    expect(formatEventDays({ timing: 'timed' })).toBeNull();
    expect(
      formatEventWhen('2026-11-10T01:00:00Z', '2026-11-10T02:00:00Z', {
        ...NY,
        dates: { timing: 'timed', start_date: null, end_date: null },
      }),
    ).toBe('Mon, Nov 9, 8–9 PM');
  });
});

describe('task extension pushes (#6096)', () => {
  it('names who asks, the task, the due asked for and the reason', () => {
    expect(
      taskExtensionAskedCopy(
        'Sam Lee',
        { title: 'Sweep the porch' },
        { reason: 'Shift ran late' },
        'Sat, Nov 28',
      ),
    ).toEqual({
      title: 'Sam Lee asks for more time: Sweep the porch',
      body: 'To Sat, Nov 28 · "Shift ran late"',
    });
  });

  it('cuts a long reason by character', () => {
    const { body } = taskExtensionAskedCopy(
      'Sam',
      { title: 'Sweep' },
      { reason: `${'a'.repeat(70)} 🎉` },
      'Sat, Nov 28',
    );
    expect(body).toBe(`To Sat, Nov 28 · "${'a'.repeat(59)}…"`);
  });

  it('tells the member the answer', () => {
    expect(
      taskExtensionDecidedCopy(
        { title: 'Sweep the porch' },
        { approved: true, due: 'Sat, Nov 28' },
      ),
    ).toEqual({
      title: 'Sweep the porch',
      body: 'More time granted · now due Sat, Nov 28',
    });
    expect(
      taskExtensionDecidedCopy(
        { title: 'Sweep the porch' },
        { approved: false, reason: 'The event is Friday' },
      ).body,
    ).toBe('Not extended · "The event is Friday"');
  });
});
