import type { IMemberRepository } from '#domain/repositories/member.repository.interface';
import type { CorpusCandidate } from '#domain/entities/corpus.entity';
import type { ICorpusRepository } from '#domain/repositories/corpus.repository.interface';
import type { AiGatewayService } from '../ai/ai-gateway.service';
import { CorpusRetrievalService } from './corpus-retrieval.service';
import type { CorpusSourceAdapter } from './corpus-source';
import { LanguageModelError } from '#domain/adapters/language-model.interface';
import * as caughtFailure from '../../../infrastructure/observability/report-caught-failure';

const CHAPTER = '11111111-1111-4111-8111-111111111111';
const ASKER = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-12T10:00:00.000Z');
const VECTOR = [0.1, 0.2];

const candidate = (overrides: Partial<CorpusCandidate>): CorpusCandidate => ({
  chunk_id: 'chunk',
  corpus_source_id: 'row',
  source_type: 'chapter_document',
  source_id: 'doc-1',
  title: 'Bylaws',
  heading: 'Article IV',
  content: 'Dues are $225.',
  page_start: 4,
  page_end: 4,
  source_at: '2026-01-01T00:00:00.000Z',
  decays: false,
  dense_rank: null,
  sparse_rank: null,
  distance: null,
  author_ids: null,
  anchor_id: null,
  anchor_at: null,
  message_count: null,
  left_out_count: 0,
  channel_id: null,
  ...overrides,
});

function setup(candidates: CorpusCandidate[] = []) {
  const corpus = {
    match: jest.fn().mockResolvedValue(candidates),
  } as unknown as jest.Mocked<ICorpusRepository>;
  const documents: jest.Mocked<CorpusSourceAdapter> = {
    type: 'chapter_document',
    read: jest.fn(),
    readableBy: jest.fn((_c: string, _u: string, ids: readonly string[]) =>
      Promise.resolve(new Set(ids)),
    ),
  };
  const minutes: jest.Mocked<CorpusSourceAdapter> = {
    type: 'meeting_minutes',
    read: jest.fn(),
    readableBy: jest.fn().mockResolvedValue(new Set<string>()),
  };
  const embed = jest.fn().mockResolvedValue({
    status: 'ok',
    vectors: [VECTOR],
    model: 'gemini-embedding-001',
    dimensions: 1536,
  });
  const members = {
    findChapterMemberIdentities: jest.fn(async () => [
      { user_id: 'uploader', display_name: 'Dana Reyes', role_ids: [] },
    ]),
  } as unknown as jest.Mocked<IMemberRepository>;
  const service = new CorpusRetrievalService(
    corpus,
    [documents, minutes],
    { embed } as unknown as AiGatewayService,
    members,
  );
  const retrieve = (query = 'What are dues?', limit?: number) =>
    service.retrieve(
      { chapterId: CHAPTER, actingUserId: ASKER, query, limit },
      NOW,
    );
  return { service, corpus, documents, minutes, embed, retrieve, members };
}

const ids = (
  result: Awaited<ReturnType<CorpusRetrievalService['retrieve']>>,
) =>
  result.status === 'ok' ? result.passages.map((passage) => passage.id) : [];

describe('CorpusRetrievalService', () => {
  it('embeds the question as the asker’s own, and reads one chapter as that member', async () => {
    const { retrieve, embed, corpus } = setup();
    await retrieve('  What are dues?  ');
    expect(embed).toHaveBeenCalledWith(
      'ask.embed-query',
      expect.objectContaining({
        texts: ['What are dues?'],
        promptVersion: 'corpus.query@v1',
        purpose: 'query',
      }),
      { chapterId: CHAPTER, actingUserId: ASKER },
    );
    expect(corpus.match).toHaveBeenCalledWith({
      chapterId: CHAPTER,
      userId: ASKER,
      query: 'What are dues?',
      embedding: { vector: VECTOR, model: 'gemini-embedding-001' },
      limit: 40,
    });
  });

  describe('when the embedding provider fails', () => {
    it('searches by words alone instead of failing the question', async () => {
      const reported = jest
        .spyOn(caughtFailure, 'reportCaughtFailure')
        .mockImplementation(() => undefined);
      const { retrieve, embed, corpus } = setup();
      embed.mockRejectedValue(
        new LanguageModelError('invalid_request', 'google', { status: 400 }),
      );
      const result = await retrieve();
      expect(result.status).toBe('ok');
      expect(corpus.match).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'What are dues?', embedding: null }),
      );
      expect(result).toMatchObject({ wordsOnly: true });
      // A read that degrades still reports: nothing else would reach Sentry.
      expect(reported).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          level: 'warning',
          site: 'corpus-retrieval-embed-query',
        }),
      );
      reported.mockRestore();
    });

    it('does not go on when the member cancelled', async () => {
      const { retrieve, embed, corpus } = setup();
      embed.mockRejectedValue(new LanguageModelError('aborted', 'google'));
      await expect(retrieve()).rejects.toBeInstanceOf(LanguageModelError);
      expect(corpus.match).not.toHaveBeenCalled();
    });

    it('lets any other failure through', async () => {
      const { retrieve, embed, corpus } = setup();
      embed.mockRejectedValue(new Error('database is down'));
      await expect(retrieve()).rejects.toThrow('database is down');
      expect(corpus.match).not.toHaveBeenCalled();
    });
  });

  it.each([
    { reason: 'disabled' },
    { reason: 'consent', detail: 'member_declined' },
    { reason: 'spend_cap', detail: 'member_cap' },
  ] as const)(
    'reads nothing and hands back the refusal when the gateway says %p',
    async (refusal) => {
      const { retrieve, embed, corpus } = setup();
      embed.mockResolvedValue({ status: 'unavailable', ...refusal });
      await expect(retrieve()).resolves.toEqual({
        status: 'unavailable',
        ...refusal,
      });
      expect(corpus.match).not.toHaveBeenCalled();
    },
  );

  it('asks nothing of anyone for an empty question', async () => {
    const { retrieve, embed } = setup();
    await expect(retrieve('   ')).resolves.toEqual({
      status: 'ok',
      passages: [],
      leftOutMessages: 0,
      wordsOnly: false,
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it('drops every passage whose source the member could not open, by the source’s own rule', async () => {
    const { retrieve, minutes, documents } = setup([
      candidate({ chunk_id: 'doc', dense_rank: 3 }),
      candidate({
        chunk_id: 'exec-1',
        source_type: 'meeting_minutes',
        source_id: 'exec',
        dense_rank: 1,
        sparse_rank: 1,
      }),
      candidate({
        chunk_id: 'exec-2',
        source_type: 'meeting_minutes',
        source_id: 'exec',
        dense_rank: 2,
      }),
      candidate({
        chunk_id: 'chapter-1',
        source_type: 'meeting_minutes',
        source_id: 'chapter',
        sparse_rank: 2,
      }),
    ]);
    minutes.readableBy.mockResolvedValue(new Set(['chapter']));
    const result = await retrieve();
    // The Exec minutes ranked first in both halves and are still not there.
    expect(ids(result).sort()).toEqual(['chapter-1', 'doc']);
    expect(minutes.readableBy).toHaveBeenCalledWith(CHAPTER, ASKER, [
      'exec',
      'chapter',
    ]);
    expect(documents.readableBy).toHaveBeenCalledWith(CHAPTER, ASKER, [
      'doc-1',
    ]);
  });

  it('drops a source type this build has no adapter for', async () => {
    const { retrieve } = setup([
      candidate({
        chunk_id: 'chat',
        source_type: 'chat_message',
        dense_rank: 1,
      }),
      candidate({ chunk_id: 'doc', dense_rank: 2 }),
    ]);
    expect(ids(await retrieve())).toEqual(['doc']);
  });

  it('ranks by reciprocal rank fusion: found by both halves beats first in one', async () => {
    const { retrieve } = setup([
      candidate({ chunk_id: 'dense-first', dense_rank: 1 }),
      candidate({ chunk_id: 'both', dense_rank: 2, sparse_rank: 2 }),
      candidate({ chunk_id: 'words-first', sparse_rank: 1 }),
      candidate({ chunk_id: 'dense-third', dense_rank: 3 }),
    ]);
    const result = await retrieve();
    expect(ids(result)).toEqual([
      'both',
      'dense-first',
      'words-first',
      'dense-third',
    ]);
    if (result.status !== 'ok') throw new Error('expected passages');
    expect(result.passages[0]).toEqual({
      id: 'both',
      sourceType: 'chapter_document',
      sourceId: 'doc-1',
      title: 'Bylaws',
      heading: 'Article IV',
      text: 'Dues are $225.',
      pageStart: 4,
      pageEnd: 4,
      sourceAt: '2026-01-01T00:00:00.000Z',
      score: 2 / 62,
      matchedBy: ['semantic', 'words'],
      channelId: null,
      messageId: null,
      authorIds: [],
      messageCount: null,
      facts: null,
    });
    expect(result.passages[2].matchedBy).toEqual(['words']);
  });

  it('says what each kept source is, read only for sources the asker may open, naming people once (#5180)', async () => {
    const { retrieve, documents, minutes, members } = setup([
      candidate({ chunk_id: 'doc', source_id: 'doc-1', dense_rank: 1 }),
      candidate({ chunk_id: 'doc-b', source_id: 'doc-2', dense_rank: 3 }),
      candidate({
        chunk_id: 'exec-1',
        source_type: 'meeting_minutes',
        source_id: 'exec',
        dense_rank: 2,
      }),
    ]);
    documents.describe = jest.fn(
      async () =>
        new Map([
          [
            'doc-1',
            {
              type: 'Policy',
              folder: null,
              by: { verb: 'uploaded' as const, userId: 'uploader' },
              fromDrive: false,
            },
          ],
          [
            'doc-2',
            {
              type: null,
              folder: 'Old',
              // No longer a member: not named.
              by: { verb: 'uploaded' as const, userId: 'gone' },
              fromDrive: false,
            },
          ],
        ]),
    );
    minutes.describe = jest.fn(async () => new Map());
    const result = await retrieve();
    if (result.status !== 'ok') throw new Error('expected passages');
    expect(result.passages.map((passage) => passage.facts)).toEqual([
      {
        type: 'Policy',
        folder: null,
        by: { verb: 'uploaded', name: 'Dana Reyes' },
        fromDrive: false,
      },
      { type: null, folder: 'Old', by: null, fromDrive: false },
    ]);
    expect(documents.describe).toHaveBeenCalledWith(CHAPTER, [
      'doc-1',
      'doc-2',
    ]);
    expect(members.findChapterMemberIdentities).toHaveBeenCalledTimes(1);
    // The Exec minutes the asker cannot open are never described.
    expect(minutes.describe).not.toHaveBeenCalled();
  });

  it('keeps the passages when a source cannot be described', async () => {
    const { retrieve, documents } = setup([
      candidate({ chunk_id: 'doc', source_id: 'doc-1', dense_rank: 1 }),
    ]);
    documents.describe = jest.fn(async () => {
      throw new Error('database down');
    });
    const result = await retrieve();
    if (result.status !== 'ok') throw new Error('expected passages');
    expect(
      result.passages.map((passage) => [passage.id, passage.facts]),
    ).toEqual([['doc', null]]);
  });

  it('puts newer minutes above older ones at the same rank, and never ages a standing document', async () => {
    const { retrieve, minutes } = setup([
      candidate({
        chunk_id: 'old-minutes',
        source_type: 'meeting_minutes',
        source_id: 'old',
        decays: true,
        source_at: '2025-11-12T10:00:00.000Z',
        dense_rank: 1,
      }),
      candidate({
        chunk_id: 'new-minutes',
        source_type: 'meeting_minutes',
        source_id: 'new',
        decays: true,
        source_at: '2026-11-10T10:00:00.000Z',
        dense_rank: 2,
      }),
      candidate({
        chunk_id: 'old-bylaws',
        source_at: '2019-01-01T00:00:00.000Z',
        sparse_rank: 1,
      }),
    ]);
    minutes.readableBy.mockResolvedValue(new Set(['old', 'new']));
    expect(ids(await retrieve())).toEqual([
      'old-bylaws',
      'new-minutes',
      'old-minutes',
    ]);
  });

  it('returns at most the passages asked for, never more than twenty', async () => {
    const many = Array.from({ length: 30 }, (_, n) =>
      candidate({
        chunk_id: `c${String(n).padStart(2, '0')}`,
        dense_rank: n + 1,
      }),
    );
    const { retrieve } = setup(many);
    expect(ids(await retrieve('dues'))).toHaveLength(8);
    expect(ids(await retrieve('dues', 3))).toEqual(['c00', 'c01', 'c02']);
    expect(ids(await retrieve('dues', 500))).toHaveLength(20);
  });
});

describe('CorpusRetrievalService — chat (#4314)', () => {
  const chat = (overrides: Partial<CorpusCandidate>): CorpusCandidate =>
    candidate({
      source_type: 'chat_message',
      source_id: 'window-1',
      title: '#general',
      heading: 'November 9, 2026',
      content: 'Sam: who has the van keys?\nLee: I do.',
      page_start: null,
      page_end: null,
      source_at: '2026-11-09T22:00:00.000Z',
      decays: true,
      author_ids: ['sam', 'lee'],
      anchor_id: 'msg-1',
      anchor_at: '2026-11-09T22:00:00.000Z',
      message_count: 2,
      left_out_count: 0,
      channel_id: 'channel-general',
      ...overrides,
    });

  function chatSetup(
    candidates: CorpusCandidate[],
    admission: (list: readonly CorpusCandidate[]) => {
      admitted: Set<string>;
      withheldBySource: Map<string, number>;
    } = (list) => ({
      admitted: new Set(list.map((c) => c.chunk_id)),
      withheldBySource: new Map(),
    }),
    readable: (ids: readonly string[]) => Set<string> = (ids) => new Set(ids),
  ) {
    const base = setup(candidates);
    const chatAdapter: jest.Mocked<CorpusSourceAdapter> = {
      type: 'chat_message',
      read: jest.fn(),
      readableBy: jest.fn((_c: string, _u: string, ids: readonly string[]) =>
        Promise.resolve(readable(ids)),
      ),
      admit: jest.fn(
        (_c: string, _u: string, list: readonly CorpusCandidate[]) =>
          Promise.resolve(admission(list)),
      ),
    };
    const service = new CorpusRetrievalService(
      base.corpus,
      [base.documents, base.minutes, chatAdapter],
      { embed: base.embed } as unknown as AiGatewayService,
      base.members,
    );
    const retrieve = () =>
      service.retrieve(
        { chapterId: CHAPTER, actingUserId: ASKER, query: 'van keys' },
        NOW,
      );
    return { retrieve, chatAdapter };
  }

  it('hands back a chat passage with its channel, first message and authors, ranked by how well it matched (#5179)', async () => {
    const { retrieve } = chatSetup([
      chat({ chunk_id: 'chat', dense_rank: 1, sparse_rank: 1 }),
      candidate({ chunk_id: 'doc', dense_rank: 2, sparse_rank: 2 }),
    ]);
    const result = await retrieve();
    if (result.status !== 'ok') throw new Error('expected passages');
    // The chat passage matched better, so it comes first: chat is no longer
    // held behind the record (Paul, 2026-11-16).
    expect(result.passages.map((p) => p.id)).toEqual(['chat', 'doc']);
    expect(result.passages[0]).toMatchObject({
      sourceType: 'chat_message',
      sourceId: 'window-1',
      title: '#general',
      channelId: 'channel-general',
      messageId: 'msg-1',
      authorIds: ['sam', 'lee'],
      messageCount: 2,
      sourceAt: '2026-11-09T22:00:00.000Z',
    });
    expect(result.passages[0].score).toBeGreaterThan(result.passages[1].score);
  });

  it('scores chat and a document that matched as well alike, with no weight for being chat (#5179)', async () => {
    const { retrieve } = chatSetup([
      chat({ chunk_id: 'chat', dense_rank: 1, source_at: NOW.toISOString() }),
      candidate({ chunk_id: 'doc', dense_rank: 1 }),
    ]);
    const result = await retrieve();
    if (result.status !== 'ok') throw new Error('expected passages');
    const score = (id: string) =>
      result.passages.find((p) => p.id === id)?.score;
    expect(score('chat')).toBe(score('doc'));
  });

  it('drops a passage the source refuses to admit, and counts the withheld messages with what indexing left out of that window', async () => {
    const { retrieve, chatAdapter } = chatSetup(
      [
        chat({ chunk_id: 'kept', dense_rank: 1, left_out_count: 3 }),
        chat({ chunk_id: 'withheld', dense_rank: 2, left_out_count: 3 }),
        chat({
          chunk_id: 'other-window',
          source_id: 'window-2',
          dense_rank: 3,
          left_out_count: 5,
        }),
      ],
      () => ({
        admitted: new Set(['kept', 'other-window']),
        withheldBySource: new Map([['window-1', 2]]),
      }),
    );
    const result = await retrieve();
    if (result.status !== 'ok') throw new Error('expected passages');
    expect(result.passages.map((p) => p.id)).toEqual(['kept', 'other-window']);
    // window-1: 3 left out at indexing + 2 withheld now; window-2: 5.
    expect(result.leftOutMessages).toBe(10);
    expect(chatAdapter.admit).toHaveBeenCalledWith(
      CHAPTER,
      ASKER,
      expect.arrayContaining([expect.objectContaining({ chunk_id: 'kept' })]),
    );
  });

  it('counts nothing from a channel the asker cannot open, and admits nothing from it', async () => {
    const { retrieve, chatAdapter } = chatSetup(
      [
        chat({
          chunk_id: 'exec',
          source_id: 'window-exec',
          dense_rank: 1,
          left_out_count: 4,
        }),
      ],
      undefined,
      () => new Set(),
    );
    const result = await retrieve();
    expect(result).toEqual({
      status: 'ok',
      passages: [],
      leftOutMessages: 0,
      wordsOnly: false,
    });
    expect(chatAdapter.admit).not.toHaveBeenCalled();
  });

  it('reports no left-out messages when no chat passage is returned', async () => {
    const { retrieve } = chatSetup([
      candidate({ chunk_id: 'doc', dense_rank: 1 }),
    ]);
    const result = await retrieve();
    if (result.status !== 'ok') throw new Error('expected passages');
    expect(result.leftOutMessages).toBe(0);
  });

  // Ask's agent tools narrow a search and read one source in order (#4900).
  describe('a narrowed search', () => {
    it('hands the narrowing to the database, and still checks every source', async () => {
      const { service, corpus, documents } = setup([
        candidate({ chunk_id: 'a', dense_rank: 1 }),
      ]);
      const filter = {
        sourceTypes: ['chapter_document'],
        since: '2026-09-01T04:00:00.000Z',
      };
      const result = await service.retrieve(
        { chapterId: CHAPTER, actingUserId: ASKER, query: 'dues', filter },
        NOW,
      );
      expect(corpus.match).toHaveBeenCalledWith(
        expect.objectContaining({ chapterId: CHAPTER, userId: ASKER, filter }),
      );
      expect(documents.readableBy).toHaveBeenCalledWith(CHAPTER, ASKER, [
        'doc-1',
      ]);
      expect(ids(result)).toEqual(['a']);
    });

    it('still drops a source the member cannot open, whatever was asked for', async () => {
      const { service } = setup([
        candidate({
          chunk_id: 'exec',
          source_type: 'meeting_minutes',
          source_id: 'meeting-exec',
          dense_rank: 1,
        }),
      ]);
      const result = await service.retrieve(
        {
          chapterId: CHAPTER,
          actingUserId: ASKER,
          query: 'budget',
          filter: { sourceTypes: ['meeting_minutes'] },
        },
        NOW,
      );
      expect(ids(result)).toEqual([]);
    });

    it('sends no filter when none is asked for', async () => {
      const { retrieve, corpus } = setup();
      await retrieve();
      expect(corpus.match.mock.calls[0][0]).not.toHaveProperty('filter');
    });
  });

  describe('readSource', () => {
    const chunks = {
      title: 'Bylaws',
      source_at: '2026-01-01T00:00:00.000Z',
      total: 12,
      chunks: [
        {
          id: 'chunk-6',
          chunk_index: 5,
          heading: 'Article IV',
          content: 'Dues are $225.',
          page_start: 4,
          page_end: 4,
        },
      ],
    };
    const request = {
      chapterId: CHAPTER,
      actingUserId: ASKER,
      sourceType: 'chapter_document',
      sourceId: 'doc-1',
      offset: 5,
      limit: 5,
    };
    const withChunks = () => {
      const made = setup();
      (made.corpus as unknown as Record<string, jest.Mock>).readSourceChunks =
        jest.fn().mockResolvedValue(chunks);
      return made;
    };

    it('reads the passages for a member who may open the source, with no model call', async () => {
      const { service, corpus, documents, embed } = withChunks();
      await expect(service.readSource(request)).resolves.toEqual({
        ...chunks,
        facts: null,
      });
      expect(documents.readableBy).toHaveBeenCalledWith(CHAPTER, ASKER, [
        'doc-1',
      ]);
      expect(corpus.readSourceChunks).toHaveBeenCalledWith({
        chapterId: CHAPTER,
        userId: ASKER,
        sourceType: 'chapter_document',
        sourceId: 'doc-1',
        offset: 5,
        limit: 5,
      });
      expect(embed).not.toHaveBeenCalled();
    });

    it('says what the source is, from its adapter, with its uploader named (#5180)', async () => {
      const { service, documents } = withChunks();
      documents.describe = jest.fn(
        async () =>
          new Map([
            [
              'doc-1',
              {
                type: 'Policy',
                folder: null,
                by: { verb: 'uploaded' as const, userId: 'uploader' },
                fromDrive: false,
              },
            ],
          ]),
      );
      await expect(service.readSource(request)).resolves.toMatchObject({
        facts: {
          type: 'Policy',
          folder: null,
          by: { verb: 'uploaded', name: 'Dana Reyes' },
          fromDrive: false,
        },
      });
      expect(documents.describe).toHaveBeenCalledWith(CHAPTER, ['doc-1']);
    });

    it('reads nothing for a source the member cannot open', async () => {
      const { service, corpus } = withChunks();
      await expect(
        service.readSource({
          ...request,
          sourceType: 'meeting_minutes',
          sourceId: 'meeting-exec',
        }),
      ).resolves.toBeNull();
      expect(corpus.readSourceChunks).not.toHaveBeenCalled();
    });

    it.each(['chat_message', 'vault_file'])(
      'never reads a %s source this way',
      async (sourceType) => {
        const { service, corpus } = withChunks();
        await expect(
          service.readSource({ ...request, sourceType }),
        ).resolves.toBeNull();
        expect(corpus.readSourceChunks).not.toHaveBeenCalled();
      },
    );

    it('holds a read to twenty passages', async () => {
      const { service, corpus } = withChunks();
      await service.readSource({ ...request, limit: 500 });
      expect(corpus.readSourceChunks).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20 }),
      );
    });
  });
});
