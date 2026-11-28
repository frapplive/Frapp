// Activity's page read (`activity_page_reads`, #6061 step 2) against a real
// Postgres and PostgREST.
//
// The unit specs prove what the repository asks for and what the service
// makes of the answer. This proves what the function itself returns: that
// each card scan keeps its own kind, chapter and cap, newest first, with no
// deleted card and none from another chapter; that the caller's own polls
// are found however many of the chapter's are newer; that `p_polls: false`
// reads no poll; that reminders are the caller's own in this chapter, due
// ones latest first and then waiting ones soonest first, each capped apart so
// old due ones can't crowd out a waiting one, each with its message in a
// bookmark's columns; that snoozes are the caller's own that end after the
// cut; and that the unread start is the caller's own.
//
// Run: `npm run test:integration -w apps/api` (needs a local Supabase stack
// with `20261128174544` applied; skips cleanly without a stack).

import { randomUUID } from 'node:crypto';
import { SupabaseActivityItemReadRepository } from '../../src/infrastructure/supabase/repositories/supabase-activity-item-read.repository';
import type { FrappSupabaseClient } from '../../src/infrastructure/supabase/database.types';
import { createServiceRoleClient, describeIntegration } from './stack';

describeIntegration(
  'Activity’s page read against live PostgREST (#6061)',
  () => {
    let supabase: FrappSupabaseClient;
    let repo: SupabaseActivityItemReadRepository;

    const chapterId = randomUUID();
    const otherChapterId = randomUUID();
    const me = randomUUID();
    const other = randomUUID();
    const channelId = randomUUID();
    const otherChannelId = randomUUID();

    const NOW = '2026-11-20T12:00:00.000Z';
    const hoursFrom = (hours: number) =>
      new Date(Date.parse(NOW) + hours * 3_600_000).toISOString();

    /** Messages by name, so assertions read as the seed does. */
    const ids: Record<string, string> = {};
    const id = (name: string) => (ids[name] ??= randomUUID());

    const assertOk = (label: string, error: unknown) => {
      if (error) throw new Error(`seed ${label}: ${JSON.stringify(error)}`);
    };

    const card = (
      name: string,
      kind: string,
      hoursAgo: number,
      extra: Record<string, unknown> = {},
    ) => ({
      id: id(name),
      channel_id: channelId,
      sender_id: other,
      content: name,
      type: 'TEXT',
      kind,
      payload: { title: name },
      // A bulk insert sends every row the union of their keys, so each row
      // carries the columns any row sets.
      metadata: {},
      is_deleted: false,
      created_at: hoursFrom(-hoursAgo),
      ...extra,
    });

    const read = (
      overrides: Partial<{
        polls: boolean;
        pollLimit: number;
        cardLimit: number;
        reminderLimit: number;
        user: string;
      }> = {},
    ) =>
      repo.readPage(chapterId, overrides.user ?? me, {
        now: NOW,
        snoozesEndedAfter: hoursFrom(-24),
        polls: overrides.polls ?? true,
        pollLimit: overrides.pollLimit ?? 100,
        cardLimit: overrides.cardLimit ?? 100,
        reminderLimit: overrides.reminderLimit ?? 50,
      });

    beforeAll(async () => {
      supabase = createServiceRoleClient();
      repo = new SupabaseActivityItemReadRepository(supabase);
      assertOk(
        'chapters',
        (
          await supabase.from('chapters').insert([
            {
              id: chapterId,
              name: `apr-${chapterId.slice(0, 8)}`,
              university: 'Integration Test University',
            },
            {
              id: otherChapterId,
              name: `apr-${otherChapterId.slice(0, 8)}`,
              university: 'Integration Test University',
            },
          ] as never)
        ).error,
      );
      assertOk(
        'users',
        (
          await supabase.from('users').insert(
            [me, other].map((userId, index) => ({
              id: userId,
              supabase_auth_id: randomUUID(),
              email: `apr-${userId}@example.test`,
              display_name: `Page ${index}`,
            })) as never,
          )
        ).error,
      );
      // Snoozes and unread starts belong to a membership.
      assertOk(
        'members',
        (
          await supabase.from('members').insert([
            { user_id: me, chapter_id: chapterId },
            { user_id: other, chapter_id: chapterId },
            { user_id: me, chapter_id: otherChapterId },
          ] as never)
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
            // Polls, newest first: new, mine (older), deleted, old.
            card('poll-new', 'poll', 1),
            card('poll-mine', 'poll', 5, { sender_id: me }),
            card('poll-deleted', 'poll', 2, { is_deleted: true }),
            card('poll-old', 'poll', 10),
            // Another chapter's newest poll is never in this chapter's scan.
            card('poll-elsewhere', 'poll', 0.5, { channel_id: otherChannelId }),
            card('signup-new', 'signup', 1),
            card('signup-old', 'signup', 3),
            card('form-new', 'form', 2),
            card('form-old', 'form', 4),
            // A text message is no card.
            card('text', 'text', 1),
            // Reminder targets, plain messages.
            card('due-old', 'text', 30, { metadata: { gif: { id: 'g1' } } }),
            card('due-new', 'text', 29),
            card('waiting-soon', 'text', 28),
            card('waiting-later', 'text', 27),
          ] as never)
        ).error,
      );
      assertOk(
        'chat_message_reminders',
        (
          await supabase.from('chat_message_reminders').insert([
            {
              user_id: me,
              chapter_id: chapterId,
              message_id: id('due-old'),
              remind_at: hoursFrom(-5),
            },
            {
              user_id: me,
              chapter_id: chapterId,
              message_id: id('due-new'),
              remind_at: hoursFrom(-1),
            },
            {
              user_id: me,
              chapter_id: chapterId,
              message_id: id('waiting-later'),
              remind_at: hoursFrom(9),
            },
            {
              user_id: me,
              chapter_id: chapterId,
              message_id: id('waiting-soon'),
              remind_at: hoursFrom(2),
            },
            // Someone else's, on the same message: never the caller's.
            {
              user_id: other,
              chapter_id: chapterId,
              message_id: id('due-new'),
              remind_at: hoursFrom(-2),
            },
          ] as never)
        ).error,
      );
      assertOk(
        'activity_item_snoozes',
        (
          await supabase.from('activity_item_snoozes').insert([
            // Holding, and ended within the cut: both kept.
            {
              user_id: me,
              chapter_id: chapterId,
              kind: 'task',
              item_id: randomUUID(),
              until: hoursFrom(3),
            },
            {
              user_id: me,
              chapter_id: chapterId,
              kind: 'poll',
              item_id: randomUUID(),
              until: hoursFrom(-2),
            },
            // Ended before the cut, someone else's, another chapter's: not.
            {
              user_id: me,
              chapter_id: chapterId,
              kind: 'task',
              item_id: randomUUID(),
              until: hoursFrom(-48),
            },
            {
              user_id: other,
              chapter_id: chapterId,
              kind: 'task',
              item_id: randomUUID(),
              until: hoursFrom(3),
            },
            {
              user_id: me,
              chapter_id: otherChapterId,
              kind: 'task',
              item_id: randomUUID(),
              until: hoursFrom(3),
            },
          ] as never)
        ).error,
      );
      assertOk(
        'activity_unread_starts',
        (
          await supabase.from('activity_unread_starts').insert([
            { user_id: me, chapter_id: chapterId, started_at: hoursFrom(-72) },
            {
              user_id: me,
              chapter_id: otherChapterId,
              started_at: hoursFrom(-1),
            },
          ] as never)
        ).error,
      );
    });

    afterAll(async () => {
      if (!supabase) return;
      const chapters = [chapterId, otherChapterId];
      await supabase
        .from('activity_unread_starts')
        .delete()
        .in('chapter_id', chapters);
      await supabase
        .from('activity_item_snoozes')
        .delete()
        .in('chapter_id', chapters);
      await supabase
        .from('chat_message_reminders')
        .delete()
        .in('chapter_id', chapters);
      await supabase
        .from('chat_messages')
        .delete()
        .in('channel_id', [channelId, otherChannelId]);
      await supabase
        .from('chat_channels')
        .delete()
        .in('id', [channelId, otherChannelId]);
      await supabase.from('members').delete().in('chapter_id', chapters);
    await supabase.from('users').delete().in('id', [me, other]);
      await supabase.from('chapters').delete().in('id', chapters);
    });

    const names = (rows: { id: string }[]) =>
      rows.map((row) => Object.keys(ids).find((name) => ids[name] === row.id));

    it('scans each card kind in the chapter, newest first, with no deleted card', async () => {
      const page = await read();

      expect(names(page.polls)).toEqual(['poll-new', 'poll-mine', 'poll-old']);
      expect(names(page.own_polls)).toEqual(['poll-mine']);
      expect(names(page.signups)).toEqual(['signup-new', 'signup-old']);
      expect(names(page.forms)).toEqual(['form-new', 'form-old']);
      // A card is the message `findCardsByChapter` served: its columns, and no
      // search vector or chapter join riding along.
      expect(Object.keys(page.polls[0]).sort()).toEqual(
        [
          'id',
          'channel_id',
          'sender_id',
          'author_name',
          'author_avatar_path',
          'author_external_id',
          'content',
          'type',
          'kind',
          'payload',
          'client_message_id',
          'reply_to_id',
          'metadata',
          'mentions',
          'thread_root_id',
          'thread_reply_count',
          'thread_last_reply_at',
          'thread_recent_sender_ids',
          'thread_last_reply',
          'forwarded_from',
          'is_pinned',
          'pinned_at',
          'flag',
          'flagged_by',
          'flagged_at',
          'edited_at',
          'is_deleted',
          'created_at',
        ].sort(),
      );
      expect(page.polls[0].payload).toEqual({ title: 'poll-new' });
    });

    it('caps each scan apart, and finds the caller’s own polls past the chapter’s cap', async () => {
      const page = await read({ pollLimit: 1, cardLimit: 1 });

      expect(names(page.polls)).toEqual(['poll-new']);
      expect(names(page.own_polls)).toEqual(['poll-mine']);
      expect(names(page.signups)).toEqual(['signup-new']);
      expect(names(page.forms)).toEqual(['form-new']);
    });

    it('reads no poll when polls are off, and still the other cards', async () => {
      const page = await read({ polls: false });

      expect(page.polls).toEqual([]);
      expect(page.own_polls).toEqual([]);
      expect(names(page.signups)).toEqual(['signup-new', 'signup-old']);
    });

    it('lists the caller’s reminders: due latest first, then waiting soonest first, each with its message', async () => {
      const page = await read();

      expect(page.reminders.map((row) => row.message.content)).toEqual([
        'due-new',
        'due-old',
        'waiting-soon',
        'waiting-later',
      ]);
      expect(page.reminders.every((row) => row.user_id === me)).toBe(true);
      const dueOld = page.reminders[1];
      expect(dueOld.message).toEqual({
        id: id('due-old'),
        channel_id: channelId,
        sender_id: other,
        author_name: null,
        author_avatar_path: null,
        author_external_id: null,
        content: 'due-old',
        is_deleted: false,
        created_at: expect.any(String),
        thread_root_id: null,
        forwarded_from: null,
        gif: { id: 'g1' },
        metadata: { gif: { id: 'g1' } },
      });
    });

    it('caps due and waiting reminders apart, so old due ones never crowd out a waiting one', async () => {
      const page = await read({ reminderLimit: 1 });

      expect(page.reminders.map((row) => row.message.content)).toEqual([
        'due-new',
        'waiting-soon',
      ]);
    });

    it('reads the caller’s own snoozes that end after the cut, and their own unread start', async () => {
      const page = await read();

      expect(
        page.snoozes.map((row) => Date.parse(row.until)).sort((a, b) => a - b),
      ).toEqual([Date.parse(hoursFrom(-2)), Date.parse(hoursFrom(3))]);
      expect(
        page.snoozes.every(
          (row) => row.user_id === me && row.chapter_id === chapterId,
        ),
      ).toBe(true);
      expect(Date.parse(page.unread_since!)).toBe(Date.parse(hoursFrom(-72)));

      const theirs = await read({ user: other });
      expect(theirs.snoozes).toHaveLength(1);
      expect(theirs.unread_since).toBeNull();
      expect(theirs.reminders.map((row) => row.message.content)).toEqual([
        'due-new',
      ]);
    });
  },
);
