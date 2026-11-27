// The push worker's catch-up read against a real database (#6123, #5938).
//
// `chat-push-worker.service.spec.ts` mocks `unclaimedSince`, so the filter that
// decides what a catch-up pushes lives only in SQL
// (`chat_push_unclaimed_messages`, 20261127184653). This file asks the real
// function: messages since the cutoff, oldest first, without a claim, and
// never an imported, posted-answer or deleted row.
//
// Run: `npm run test:integration -w apps/api` (needs a local Supabase stack;
// skips cleanly without one). Not run by CI today (#1568), like the rest of
// this suite.

import { randomUUID } from 'node:crypto';
import { SupabaseChatPushDispatchRepository } from '../../src/infrastructure/supabase/repositories/supabase-chat-push-dispatch.repository';
import type { FrappSupabaseClient } from '../../src/infrastructure/supabase/database.types';
import { createServiceRoleClient, describeIntegration } from './stack';

describeIntegration('Chat push catch-up read against live PostgREST', () => {
  let supabase: FrappSupabaseClient;
  let repo: SupabaseChatPushDispatchRepository;

  const chapterId = randomUUID();
  const userId = randomUUID();
  const channelId = randomUUID();
  const ids = {
    tooOld: randomUUID(),
    first: randomUUID(),
    second: randomUUID(),
    claimed: randomUUID(),
    imported: randomUUID(),
    askAnswer: randomUUID(),
    deleted: randomUUID(),
  };
  const ours = new Set<string>(Object.values(ids));

  const assertOk = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label}: ${error.message}`);
  };
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
  const cutoff = new Date(now - 15 * 60_000);

  beforeAll(async () => {
    supabase = createServiceRoleClient();
    assertOk(
      'chapters',
      (
        await supabase.from('chapters').insert({
          id: chapterId,
          name: `catch-up-${chapterId.slice(0, 8)}`,
          university: 'Integration Test University',
        } as never)
      ).error,
    );
    assertOk(
      'users',
      (
        await supabase.from('users').insert({
          id: userId,
          supabase_auth_id: randomUUID(),
          email: `catch-up-${userId}@example.test`,
          display_name: 'Catch Up',
        } as never)
      ).error,
    );
    assertOk(
      'chat_channels',
      (
        await supabase.from('chat_channels').insert({
          id: channelId,
          chapter_id: chapterId,
          name: 'general',
          type: 'PUBLIC',
        } as never)
      ).error,
    );
    const row = (
      id: string,
      createdAt: string,
      extra: Record<string, unknown> = {},
    ) => ({
      id,
      channel_id: channelId,
      sender_id: userId,
      content: 'hello',
      type: 'TEXT',
      kind: 'text',
      is_deleted: false,
      created_at: createdAt,
      ...extra,
    });
    assertOk(
      'chat_messages',
      (
        await supabase
          .from('chat_messages')
          .insert([
            row(ids.tooOld, minutesAgo(20)),
            row(ids.second, minutesAgo(3)),
            row(ids.first, minutesAgo(5)),
            row(ids.claimed, minutesAgo(4)),
            row(ids.imported, minutesAgo(4), { kind: 'imported' }),
            row(ids.askAnswer, minutesAgo(4), { kind: 'ask_answer' }),
            row(ids.deleted, minutesAgo(4), { is_deleted: true }),
          ] as never)
      ).error,
    );
    repo = new SupabaseChatPushDispatchRepository(supabase);
    expect(await repo.claim(ids.claimed)).toBe('claimed');
  });

  afterAll(async () => {
    if (!supabase) return;
    await supabase
      .from('chat_messages')
      .delete()
      .in('id', [...ours]);
    await supabase.from('chat_channels').delete().eq('id', channelId);
    await supabase.from('users').delete().eq('id', userId);
    await supabase.from('chapters').delete().eq('id', chapterId);
  });

  it('returns only unclaimed, pushable messages since the cutoff, oldest first', async () => {
    const rows = await repo.unclaimedSince(cutoff, 200);

    // The read spans every chapter, so other suites' rows are ignored here.
    expect(rows.map((r) => r.id).filter((id) => ours.has(id))).toEqual([
      ids.first,
      ids.second,
    ]);
  });

  it('stops at the limit, keeping the oldest', async () => {
    const rows = await repo.unclaimedSince(new Date(now - 6 * 60_000), 1);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(ids.first);
  });

  it('drops a message once it is claimed', async () => {
    expect(await repo.claim(ids.first)).toBe('claimed');

    const rows = await repo.unclaimedSince(cutoff, 200);

    expect(rows.map((r) => r.id).filter((id) => ours.has(id))).toEqual([
      ids.second,
    ]);
  });
});
