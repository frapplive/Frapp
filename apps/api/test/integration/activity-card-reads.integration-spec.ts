// `activity_card_reads` against a real Postgres (#6061 step 2).
//
// The function replaces Activity's four card scans of `chat_messages` and
// the vote, claim and form-answer reads that followed them. The unit specs
// serve its answer from a fake, so this file is where its filters, orders and
// caps are checked: the chapter scope through `chat_channels`, deleted rows
// left out, each kind capped at `p_limit` newest first, the caller's own polls
// found past the chapter-wide cap, and the action and answer lists limited to
// the cards it read.
//
// Run: `npm run test:integration -w apps/api` (needs a local Supabase stack;
// skips cleanly without one). Not run by CI (#1568).

import { randomUUID } from 'node:crypto';
import { SupabaseChatMessageRepository } from '../../src/infrastructure/supabase/repositories/supabase-chat-message.repository';
import { CHAT_MESSAGE_COLUMNS } from '../../src/infrastructure/supabase/repositories/supabase-chat-message.repository';
import type { FrappSupabaseClient } from '../../src/infrastructure/supabase/database.types';
import { createServiceRoleClient, describeIntegration } from './stack';

describeIntegration('activity_card_reads against live Postgres (#6061)', () => {
  let supabase: FrappSupabaseClient;
  let repo: SupabaseChatMessageRepository;

  const chapterId = randomUUID();
  const otherChapterId = randomUUID();
  const me = randomUUID();
  const other = randomUUID();
  const channelId = randomUUID();
  const otherChannelId = randomUUID();

  // Oldest first within each kind; `at(n)` is n minutes after a fixed start.
  const myOldPoll = randomUUID();
  const theirPoll1 = randomUUID();
  const theirPoll2 = randomUUID();
  const theirPoll3 = randomUUID();
  const deletedPoll = randomUUID();
  const otherChapterPoll = randomUUID();
  const signup1 = randomUUID();
  const signup2 = randomUUID();
  const form1 = randomUUID();
  const textMessage = randomUUID();
  const messageIds = [
    myOldPoll,
    theirPoll1,
    theirPoll2,
    theirPoll3,
    deletedPoll,
    otherChapterPoll,
    signup1,
    signup2,
    form1,
    textMessage,
  ];

  const start = Date.parse('2026-11-01T12:00:00.000Z');
  const at = (minutes: number) =>
    new Date(start + minutes * 60_000).toISOString();

  const assertOk = (label: string, error: unknown) => {
    if (error) throw new Error(`seed ${label}: ${JSON.stringify(error)}`);
  };

  const message = (
    id: string,
    channel: string,
    sender: string,
    kind: string,
    minutes: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    channel_id: channel,
    sender_id: sender,
    content: `${kind} ${id.slice(0, 4)}`,
    type: 'TEXT',
    kind,
    payload: { title: 'Card' },
    is_deleted: false,
    created_at: at(minutes),
    ...extra,
  });

  beforeAll(async () => {
    supabase = createServiceRoleClient();
    repo = new SupabaseChatMessageRepository(supabase);
    assertOk(
      'chapters',
      (
        await supabase.from('chapters').insert([
          {
            id: chapterId,
            name: `cards-${chapterId.slice(0, 8)}`,
            university: 'Integration Test University',
          },
          {
            id: otherChapterId,
            name: `cards-other-${otherChapterId.slice(0, 8)}`,
            university: 'Integration Test University',
          },
        ] as never)
      ).error,
    );
    assertOk(
      'users',
      (
        await supabase.from('users').insert(
          [me, other].map((id) => ({
            id,
            supabase_auth_id: randomUUID(),
            email: `cards-${id}@example.test`,
            display_name: 'Card Probe',
          })) as never,
        )
      ).error,
    );
    assertOk(
      'chat_channels',
      (
        await supabase.from('chat_channels').insert([
          {
            id: channelId,
            chapter_id: chapterId,
            name: 'general',
            type: 'PUBLIC',
          },
          {
            id: otherChannelId,
            chapter_id: otherChapterId,
            name: 'general',
            type: 'PUBLIC',
          },
        ] as never)
      ).error,
    );
    assertOk(
      'chat_messages',
      (
        await supabase.from('chat_messages').insert([
          message(myOldPoll, channelId, me, 'poll', 1),
          message(theirPoll1, channelId, other, 'poll', 2),
          message(theirPoll2, channelId, other, 'poll', 3),
          message(theirPoll3, channelId, other, 'poll', 4),
          message(deletedPoll, channelId, other, 'poll', 5, {
            is_deleted: true,
          }),
          // The newest poll of all, in the other chapter, by the caller.
          message(otherChapterPoll, otherChannelId, me, 'poll', 6),
          message(signup1, channelId, other, 'signup', 7),
          message(signup2, channelId, other, 'signup', 8),
          message(form1, channelId, other, 'form', 9),
          message(textMessage, channelId, other, 'text', 10),
        ] as never)
      ).error,
    );
    assertOk(
      'chat_message_actions',
      (
        await supabase.from('chat_message_actions').insert([
          // The caller's vote on a poll the scan reads, and on one it can't.
          {
            message_id: theirPoll3,
            user_id: me,
            action_type: 'vote',
            payload: { option_ids: ['a'] },
            created_at: at(20),
          },
          {
            message_id: otherChapterPoll,
            user_id: me,
            action_type: 'vote',
            payload: { option_ids: ['a'] },
            created_at: at(21),
          },
          // Someone else's vote: never the caller's.
          {
            message_id: theirPoll3,
            user_id: other,
            action_type: 'vote',
            payload: { option_ids: ['b'] },
            created_at: at(22),
          },
          // Every member's claims on the sign-ups.
          {
            message_id: signup1,
            user_id: other,
            action_type: 'signup',
            payload: { slot_ids: ['s1'] },
            created_at: at(23),
          },
          {
            message_id: signup2,
            user_id: me,
            action_type: 'signup',
            payload: { slot_ids: ['s2'] },
            created_at: at(24),
          },
          // A reaction on a sign-up is not a claim.
          {
            message_id: signup1,
            user_id: me,
            action_type: 'reaction',
            payload: {},
            created_at: at(25),
          },
        ] as never)
      ).error,
    );
    assertOk(
      'chat_form_responses',
      (
        await supabase.from('chat_form_responses').insert([
          {
            message_id: form1,
            user_id: me,
            answers: { q: 'secret' },
            created_at: at(30),
          },
          {
            message_id: form1,
            user_id: other,
            answers: { q: 'theirs' },
            created_at: at(31),
          },
        ] as never)
      ).error,
    );
  });

  afterAll(async () => {
    if (!supabase) return;
    await supabase
      .from('chat_form_responses')
      .delete()
      .in('message_id', messageIds);
    await supabase
      .from('chat_message_actions')
      .delete()
      .in('message_id', messageIds);
    await supabase.from('chat_messages').delete().in('id', messageIds);
    await supabase
      .from('chat_channels')
      .delete()
      .in('id', [channelId, otherChannelId]);
    await supabase.from('users').delete().in('id', [me, other]);
    await supabase
      .from('chapters')
      .delete()
      .in('id', [chapterId, otherChapterId]);
  });

  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

  it('caps each kind at the limit, newest first, inside the chapter, without deleted rows', async () => {
    const reads = await repo.readActivityCards(chapterId, me, 2);

    // Not the deleted poll, not the other chapter's newer one.
    expect(ids(reads.polls)).toEqual([theirPoll3, theirPoll2]);
    expect(ids(reads.signups)).toEqual([signup2, signup1]);
    expect(ids(reads.forms)).toEqual([form1]);
  });

  it('finds the caller’s own poll past the chapter-wide cap', async () => {
    const reads = await repo.readActivityCards(chapterId, me, 2);

    expect(ids(reads.polls)).not.toContain(myOldPoll);
    expect(ids(reads.own_polls)).toEqual([myOldPoll]);
  });

  it('serves each card with the columns a chat message read serves', async () => {
    const reads = await repo.readActivityCards(chapterId, me, 2);

    expect(Object.keys(reads.polls[0]).sort()).toEqual(
      CHAT_MESSAGE_COLUMNS.split(',')
        .map((column) => column.trim())
        .sort(),
    );
  });

  it('reads the caller’s votes and form answers, and every claim, on the cards it read only', async () => {
    const reads = await repo.readActivityCards(chapterId, me, 2);

    // Not the vote on the other chapter's poll, nor the other member's.
    expect(reads.votes).toEqual([
      {
        message_id: theirPoll3,
        payload: { option_ids: ['a'] },
        created_at: expect.any(String),
      },
    ]);
    expect(Date.parse(reads.votes[0].created_at)).toBe(Date.parse(at(20)));
    // Both members' claims, not the reaction.
    expect(
      reads.signup_claims.map((row) => [row.message_id, row.user_id]),
    ).toEqual(
      expect.arrayContaining([
        [signup1, other],
        [signup2, me],
      ]),
    );
    expect(reads.signup_claims).toHaveLength(2);
    // Which form, and when; never what the caller wrote.
    expect(reads.form_answers).toEqual([
      { message_id: form1, created_at: expect.any(String) },
    ]);
  });

  it('reads nothing of a chapter the caller asks about wrongly', async () => {
    const reads = await repo.readActivityCards(randomUUID(), me, 2);

    expect(reads).toEqual({
      polls: [],
      own_polls: [],
      signups: [],
      forms: [],
      votes: [],
      signup_claims: [],
      form_answers: [],
    });
  });
});
