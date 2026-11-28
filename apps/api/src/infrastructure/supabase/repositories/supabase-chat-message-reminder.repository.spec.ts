import { SupabaseChatMessageReminderRepository } from './supabase-chat-message-reminder.repository';
import {
  CHAPTER_A,
  USER_SHARED,
  USER_A,
  createTenantHarness,
  inA,
  inB,
  type TenantHarness,
} from '#test/helpers/tenant-scope.harness';

/**
 * Tenant scope for `chat_message_reminders` (#4957), shaped like the bookmark
 * spec: the table has its own `chapter_id`, and a second scope the harness
 * does not know about, `user_id`, which is the privacy guarantee. Both are
 * asserted on the member-facing reads. The sweep's `findDue` and `claimDue`
 * walk every chapter by design; what they write is pinned below, because the
 * integration spec that runs them against a real server isn't run by CI.
 */

const MESSAGE_A = '0a000000-0000-4000-8000-000000000260';
const MESSAGE_B = '0b000000-0000-4000-8000-000000000260';
const MESSAGE_A_OTHER_USER = '0a000000-0000-4000-8000-000000000262';
const MESSAGE_B_OTHER_USER = '0b000000-0000-4000-8000-000000000262';

const REMINDER_A = '0a000000-0000-4000-8000-000000000270';
const REMINDER_B = '0b000000-0000-4000-8000-000000000270';
const REMINDER_A_OTHER_USER = '0a000000-0000-4000-8000-000000000272';
const REMINDER_B_OTHER_USER = '0b000000-0000-4000-8000-000000000272';

/** The harness ignores `select()`, so the embed is seeded under its key. */
const message = (id: string) => ({
  id,
  channel_id: '0a000000-0000-4000-8000-000000000280',
  content: 'dues are due Friday',
  is_deleted: false,
  created_at: '2026-01-01T00:00:00.000Z',
});

const row = (id: string, userId: string, messageId: string) => ({
  id,
  user_id: userId,
  message_id: messageId,
  remind_at: '2026-01-02T09:00:00.000Z',
  fired_at: null,
  created_at: '2026-01-01T12:00:00.000Z',
  updated_at: '2026-01-01T12:00:00.000Z',
  message: message(messageId),
});

const seed = () => ({
  chat_message_reminders: [
    inA(row(REMINDER_A, USER_SHARED, MESSAGE_A)),
    inB(row(REMINDER_B, USER_SHARED, MESSAGE_B)),
    inA(row(REMINDER_A_OTHER_USER, USER_A, MESSAGE_A_OTHER_USER)),
    inB(row(REMINDER_B_OTHER_USER, USER_A, MESSAGE_B_OTHER_USER)),
  ],
});

describe('SupabaseChatMessageReminderRepository — tenant scope', () => {
  let harness: TenantHarness;
  let repo: SupabaseChatMessageReminderRepository;

  beforeEach(() => {
    harness = createTenantHarness({
      tables: seed(),
      collisionExempt: {
        chat_message_reminders: ['user_id', 'message_id', 'message'],
      },
    });
    repo = new SupabaseChatMessageReminderRepository(harness.client);
  });

  it('delete removes only the caller’s own reminder in this chapter', async () => {
    await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.delete(USER_SHARED, MESSAGE_A, CHAPTER_A),
    );
    expect(
      harness
        .rows('chat_message_reminders')
        .map((r) => r.id)
        .sort(),
    ).toEqual(
      [REMINDER_B, REMINDER_A_OTHER_USER, REMINDER_B_OTHER_USER].sort(),
    );
  });

  it('setting a reminder again moves it and re-arms one that already fired', async () => {
    harness = createTenantHarness({
      tables: {
        chat_message_reminders: [
          inA({
            ...row(REMINDER_A, USER_SHARED, MESSAGE_A),
            fired_at: '2026-01-02T09:00:00.000Z',
          }),
          inB(row(REMINDER_B, USER_SHARED, MESSAGE_B)),
        ],
      },
      collisionExempt: {
        chat_message_reminders: [
          'user_id',
          'message_id',
          'message',
          'fired_at',
        ],
      },
    });
    repo = new SupabaseChatMessageReminderRepository(harness.client);

    await repo.upsert(
      USER_SHARED,
      MESSAGE_A,
      CHAPTER_A,
      '2026-01-05T09:00:00.000Z',
    );

    const stored = harness
      .rows('chat_message_reminders')
      .find((r) => r.id === REMINDER_A);
    expect(stored?.remind_at).toBe('2026-01-05T09:00:00.000Z');
    // Snooze on a due reminder: without this it would never fire again.
    expect(stored?.fired_at).toBeNull();
  });

  it('claimDue wins once, and loses for a reminder moved since it was read', async () => {
    const at = '2026-01-02T09:01:00.000Z';
    const read = { id: REMINDER_A, remind_at: '2026-01-02T09:00:00.000Z' };

    expect(await repo.claimDue(read, at)).toBe(true);
    expect(await repo.claimDue(read, at)).toBe(false);

    // Moved after the sweep read it: the stale claim must leave it unfired.
    expect(
      await repo.claimDue(
        { id: REMINDER_B, remind_at: '2026-01-01T09:00:00.000Z' },
        at,
      ),
    ).toBe(false);
    expect(
      harness.rows('chat_message_reminders').find((r) => r.id === REMINDER_B)
        ?.fired_at,
    ).toBeNull();
  });
});
