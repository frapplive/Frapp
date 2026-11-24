import { FrappLinkService } from './frapp-link.service';
import { keepUnseenLinks, normalizeFrappLinks } from './frapp-link-input';

const CH = 'ch-1';
const ME = 'user-1';

function service(options: {
  docs?: { id: string; title: string }[];
  visibleDocs?: string[];
  meetings?: { id: string; event_name: string; event_start_time: string }[];
  readableMeetings?: string[];
  events?: { id: string; name: string; start_time: string }[];
  visibleEvents?: string[];
  messages?: {
    id: string;
    channel_id: string;
    sender_id: string | null;
    created_at: string;
    is_deleted?: boolean;
  }[];
  channels?: { id: string; name: string; chapter_id?: string }[];
  readableChannels?: string[];
}) {
  const docs = options.docs ?? [];
  const documents = {
    visibleTo: jest.fn(async (_c: string, _u: string, rows: { id: string }[]) =>
      rows.filter((row) => (options.visibleDocs ?? []).includes(row.id)),
    ),
  };
  const meetings = {
    readableAmong: jest.fn(async () => new Set(options.readableMeetings ?? [])),
  };
  const events = {
    findVisibleByIds: jest.fn(async (ids: string[]) =>
      (options.events ?? []).filter(
        (row) =>
          ids.includes(row.id) &&
          (options.visibleEvents ?? []).includes(row.id),
      ),
    ),
  };
  const channelAccess = {
    filterAccessibleChannelIds: jest.fn(
      async () => new Set(options.readableChannels ?? []),
    ),
  };
  const documentRepo = {
    findByIds: jest.fn(async (ids: string[]) =>
      docs.filter((doc) => ids.includes(doc.id)),
    ),
  };
  const meetingRepo = {
    findByIds: jest.fn(async (_c: string, ids: string[]) =>
      (options.meetings ?? []).filter((row) => ids.includes(row.id)),
    ),
  };
  const eventRepo = {
    findByIds: jest.fn(async (ids: string[]) =>
      (options.events ?? []).filter((row) => ids.includes(row.id)),
    ),
  };
  const messageRepo = {
    findById: jest.fn(async (id: string) => {
      const found = (options.messages ?? []).find((m) => m.id === id);
      return found ? { is_deleted: false, author_name: null, ...found } : null;
    }),
  };
  const channelRepo = {
    findByIds: jest.fn(async (_c: string, ids: string[]) =>
      (options.channels ?? [])
        .filter((row) => ids.includes(row.id))
        .map((row) => ({ chapter_id: CH, ...row })),
    ),
  };
  const userRepo = {
    findByIds: jest.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, display_name: `Name of ${id}` })),
    ),
  };
  return new FrappLinkService(
    documents as never,
    meetings as never,
    events as never,
    channelAccess as never,
    documentRepo as never,
    meetingRepo as never,
    eventRepo as never,
    messageRepo as never,
    channelRepo as never,
    userRepo as never,
  );
}

describe('FrappLinkService.resolve', () => {
  it('names what the member may open, hides the rest, and says what is gone', async () => {
    const links = service({
      docs: [
        { id: 'd-open', title: 'Bylaws' },
        { id: 'd-hidden', title: 'Rush budget' },
      ],
      visibleDocs: ['d-open'],
      meetings: [
        {
          id: 'm1',
          event_name: 'Chapter',
          event_start_time: '2026-11-16T23:00:00Z',
        },
      ],
      readableMeetings: ['m1'],
      events: [
        { id: 'e1', name: 'Formal', start_time: '2026-12-05T01:00:00Z' },
      ],
      visibleEvents: [],
    });
    const answers = await links.resolve(CH, ME, [
      { kind: 'document', document_id: 'd-open' },
      { kind: 'document', document_id: 'd-hidden' },
      { kind: 'document', document_id: 'd-gone' },
      { kind: 'minutes', meeting_id: 'm1' },
      { kind: 'event', event_id: 'e1' },
      { kind: 'document', document_id: 'd-open' },
    ]);
    expect(answers).toEqual([
      {
        key: 'document:d-open',
        state: 'ok',
        title: 'Bylaws',
        date: null,
        author: null,
      },
      {
        key: 'document:d-hidden',
        state: 'hidden',
        title: null,
        date: null,
        author: null,
      },
      {
        key: 'document:d-gone',
        state: 'removed',
        title: null,
        date: null,
        author: null,
      },
      {
        key: 'minutes:m1',
        state: 'ok',
        title: 'Chapter',
        date: '2026-11-16T23:00:00Z',
        author: null,
      },
      {
        key: 'event:e1',
        state: 'hidden',
        title: null,
        date: null,
        author: null,
      },
    ]);
    expect(JSON.stringify(answers)).not.toContain('Rush budget');
  });

  it('names a message by its channel and sender, and hides one in a channel the member cannot read', async () => {
    const links = service({
      messages: [
        {
          id: 'x1',
          channel_id: 'c-open',
          sender_id: 'u-9',
          created_at: '2026-11-16T18:00:00Z',
        },
        {
          id: 'x2',
          channel_id: 'c-private',
          sender_id: 'u-8',
          created_at: '2026-11-16T18:00:00Z',
        },
        {
          id: 'x3',
          channel_id: 'c-open',
          sender_id: null,
          created_at: 'x',
          is_deleted: true,
        },
      ],
      channels: [
        { id: 'c-open', name: 'general' },
        { id: 'c-private', name: 'exec' },
      ],
      readableChannels: ['c-open'],
    });
    const answers = await links.resolve(CH, ME, [
      { kind: 'message', channel_id: 'c-open', message_id: 'x1' },
      { kind: 'message', channel_id: 'c-private', message_id: 'x2' },
      { kind: 'message', channel_id: 'c-open', message_id: 'x3' },
    ]);
    expect(answers).toEqual([
      {
        key: 'message:x1',
        state: 'ok',
        title: 'general',
        date: '2026-11-16T18:00:00Z',
        author: 'Name of u-9',
      },
      {
        key: 'message:x2',
        state: 'hidden',
        title: null,
        date: null,
        author: null,
      },
      {
        key: 'message:x3',
        state: 'removed',
        title: null,
        date: null,
        author: null,
      },
    ]);
  });
});

describe('FrappLinkService.resolve with a module off', () => {
  it('hides records from a module the chapter turned off, unread', async () => {
    const links = service({
      docs: [{ id: 'd-open', title: 'Bylaws' }],
      visibleDocs: ['d-open'],
      meetings: [
        {
          id: 'm1',
          event_name: 'Chapter',
          event_start_time: '2026-11-16T23:00:00Z',
        },
      ],
      readableMeetings: ['m1'],
      events: [],
      visibleEvents: [],
    });
    const answers = await links.resolve(
      CH,
      ME,
      [
        { kind: 'document', document_id: 'd-open' },
        { kind: 'minutes', meeting_id: 'm1' },
      ],
      { documents: false },
    );
    expect(answers.map((answer) => [answer.key, answer.state])).toEqual([
      ['document:d-open', 'hidden'],
      ['minutes:m1', 'ok'],
    ]);
    expect(answers[0].title).toBeNull();
  });
});

describe('keepUnseenLinks', () => {
  it('puts back the kinds an older phone build could not read, after what it sent', () => {
    const stored = [
      {
        id: 'a',
        kind: 'document' as const,
        document_id: 'd1',
        title: 'Document',
      },
      { id: 'b', kind: 'minutes' as const, meeting_id: 'm1', title: 'Minutes' },
      { id: 'c', kind: 'link' as const, url: 'https://a.example', title: 'A' },
      {
        id: 'd',
        kind: 'message' as const,
        channel_id: 'c1',
        message_id: 'x1',
        title: 'Message',
      },
    ];
    // The old build removed the web link and kept the document.
    expect(keepUnseenLinks([stored[0]], stored).map((link) => link.id)).toEqual(
      ['a', 'b', 'd'],
    );
  });
});

describe('normalizeFrappLinks', () => {
  it("gives an event's record links the kind's word, never a name, and a task's none", () => {
    const sent = [
      { id: 'a', kind: 'minutes' as const, meeting_id: 'm1', title: 'Secret' },
      {
        id: 'b',
        kind: 'document' as const,
        document_id: 'd1',
        title: 'Bylaws',
      },
    ];
    expect(normalizeFrappLinks(sent, 'event')).toEqual([
      { id: 'a', kind: 'minutes', meeting_id: 'm1', title: 'Minutes' },
      { id: 'b', kind: 'document', document_id: 'd1', title: 'Document' },
    ]);
    expect(normalizeFrappLinks(sent, 'task')).toEqual([
      { id: 'a', kind: 'minutes', meeting_id: 'm1' },
      { id: 'b', kind: 'document', document_id: 'd1' },
    ]);
  });

  it('refuses more than the cap, and a list with one id twice', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      id: String(i),
      kind: 'link' as const,
      url: `https://a.example/${i}`,
    }));
    expect(() => normalizeFrappLinks(many, 'task')).toThrow(/at most 10/);
    expect(() =>
      normalizeFrappLinks(
        [
          { id: 'a', kind: 'link', url: 'https://a.example/1' },
          { id: 'a', kind: 'link', url: 'https://a.example/2' },
        ],
        'task',
      ),
    ).toThrow(/two entries/);
  });
});
