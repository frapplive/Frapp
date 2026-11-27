import { SupabaseMeetingActionItemTaskRepository } from './supabase-meeting-action-item-task.repository';
import type { FrappSupabaseClient } from '../database.types';
import {
  CHAPTER_A,
  CHAPTER_B,
  USER_SHARED,
  createTenantHarness,
  inA,
  inB,
} from '#test/helpers/tenant-scope.harness';

/**
 * `meeting_action_item_tasks` (#6062): the claim that keeps an action item to
 * one task. Its key is `(meeting_id, item_key)`; the harness tracks rows by
 * `id`, so the seed gives each twin one (as `meeting_drafts`' spec does). The
 * A/B twins agree on everything but their chapter, so a query that drops the
 * chapter predicate reaches the other chapter's twin.
 *
 * The harness doesn't enforce the primary key, so the unique violation a
 * second claim meets, and the takeover after it, are pinned with a recording
 * fake below.
 */

const T_MINUTES = '0f000000-0000-4000-8000-000000006062';
const T_KEY_DONE = 'a'.repeat(32);
const T_KEY_EMPTY = 'b'.repeat(32);
const T_TASK = '0d000000-0000-4000-8000-000000006062';

const seeded = (key: string, over: Record<string, unknown> = {}) => ({
  meeting_id: T_MINUTES,
  item_key: key,
  task_id: null,
  task_group_id: null,
  created_by: USER_SHARED,
  created_at: '2026-11-25T00:00:00.000Z',
  ...over,
});

describe('SupabaseMeetingActionItemTaskRepository — tenant scope', () => {
  const build = () => {
    const harness = createTenantHarness({
      tables: {
        meeting_action_item_tasks: [
          inA({ id: 'done-a', ...seeded(T_KEY_DONE, { task_id: T_TASK }) }),
          inB({ id: 'done-b', ...seeded(T_KEY_DONE, { task_id: T_TASK }) }),
          inA({ id: 'empty-a', ...seeded(T_KEY_EMPTY) }),
          inB({ id: 'empty-b', ...seeded(T_KEY_EMPTY) }),
        ],
      },
    });
    return {
      harness,
      repo: new SupabaseMeetingActionItemTaskRepository(harness.client),
      row: (id: string) =>
        harness.rows('meeting_action_item_tasks').find((r) => r.id === id),
    };
  };

  it('lists only the chapter’s links for the minutes', async () => {
    const { harness, repo } = build();
    const rows = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.listForMeeting(CHAPTER_A, T_MINUTES),
    );
    expect(rows.map((r) => (r as { id?: string }).id).sort()).toEqual([
      'done-a',
      'empty-a',
    ]);
  });

  it('fills in only the chapter’s claim', async () => {
    const { harness, repo, row } = build();
    await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.setTask(CHAPTER_A, T_MINUTES, T_KEY_EMPTY, {
        id: T_TASK,
        group_id: null,
      }),
    );
    expect(row('empty-a')?.task_id).toBe(T_TASK);
    expect(row('empty-b')?.task_id).toBeNull();
  });

  it('gives back only the chapter’s empty claim, never one with its task', async () => {
    const { harness, repo, row } = build();
    await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.release(CHAPTER_A, T_MINUTES, T_KEY_EMPTY),
    );
    expect(row('empty-a')).toBeUndefined();
    expect(row('empty-b')).toBeDefined();
    await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.release(CHAPTER_A, T_MINUTES, T_KEY_DONE),
    );
    expect(row('done-a')).toBeDefined();
  });
});

/** The claim's conflict paths, which the harness can't raise. */

const CHAPTER = '11111111-1111-4111-8111-111111111111';
const MINUTES = '0f000000-0000-4000-8000-000000006062';
const KEY = 'a'.repeat(32);
const USER = '33333333-3333-4333-8333-333333333333';
const STALE_BEFORE = '2026-11-25T01:00:00.000Z';

type Call = [string, ...unknown[]];

function fake(options: {
  insertError?: { code: string; message: string } | null;
  takenOver?: number;
}) {
  const calls: Call[] = [];
  const chain = (result: unknown): Record<string, unknown> => {
    const node: Record<string, unknown> = {};
    for (const name of ['update', 'delete', 'eq', 'is', 'lt', 'select']) {
      node[name] = (...args: unknown[]) => {
        calls.push([name, ...args]);
        return node;
      };
    }
    // Awaiting the chain gives the result.
    node.then = (resolve: (value: unknown) => void) => resolve(result);
    return node;
  };
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);
      return {
        insert: async (row: unknown) => {
          calls.push(['insert', row]);
          return { error: options.insertError ?? null };
        },
        ...chain({
          data: Array.from({ length: options.takenOver ?? 0 }, () => ({
            item_key: KEY,
          })),
          error: null,
        }),
      };
    },
  } as unknown as FrappSupabaseClient;
  return { client, calls };
}

const row = {
  meeting_id: MINUTES,
  item_key: KEY,
  chapter_id: CHAPTER,
  created_by: USER,
};

const has = (calls: Call[], ...call: unknown[]) =>
  calls.some((entry) => JSON.stringify(entry) === JSON.stringify(call));

describe('SupabaseMeetingActionItemTaskRepository — the claim', () => {
  it('claims a free item with one insert', async () => {
    const { client, calls } = fake({});
    await expect(
      new SupabaseMeetingActionItemTaskRepository(client).claim(
        row,
        STALE_BEFORE,
      ),
    ).resolves.toBe(true);
    expect(calls.filter(([name]) => name === 'update')).toHaveLength(0);
  });

  it('answers a taken item (unique violation) by trying only an empty, stale claim in the chapter', async () => {
    const { client, calls } = fake({
      insertError: { code: '23505', message: 'duplicate' },
    });
    await expect(
      new SupabaseMeetingActionItemTaskRepository(client).claim(
        row,
        STALE_BEFORE,
      ),
    ).resolves.toBe(false);
    expect(has(calls, 'eq', 'chapter_id', CHAPTER)).toBe(true);
    expect(has(calls, 'eq', 'meeting_id', MINUTES)).toBe(true);
    expect(has(calls, 'eq', 'item_key', KEY)).toBe(true);
    expect(has(calls, 'is', 'task_id', null)).toBe(true);
    expect(has(calls, 'is', 'task_group_id', null)).toBe(true);
    expect(has(calls, 'lt', 'created_at', STALE_BEFORE)).toBe(true);
  });

  it('takes over a stale empty claim', async () => {
    const { client } = fake({
      insertError: { code: '23505', message: 'duplicate' },
      takenOver: 1,
    });
    await expect(
      new SupabaseMeetingActionItemTaskRepository(client).claim(
        row,
        STALE_BEFORE,
      ),
    ).resolves.toBe(true);
  });

  it('throws any other insert error', async () => {
    const { client } = fake({
      insertError: { code: '42501', message: 'denied' },
    });
    await expect(
      new SupabaseMeetingActionItemTaskRepository(client).claim(
        row,
        STALE_BEFORE,
      ),
    ).rejects.toThrow();
  });

  it('gives back only an empty claim, in the chapter', async () => {
    const { client, calls } = fake({});
    await new SupabaseMeetingActionItemTaskRepository(client).release(
      CHAPTER,
      MINUTES,
      KEY,
    );
    expect(has(calls, 'delete')).toBe(true);
    expect(has(calls, 'eq', 'chapter_id', CHAPTER)).toBe(true);
    expect(has(calls, 'is', 'task_id', null)).toBe(true);
    expect(has(calls, 'is', 'task_group_id', null)).toBe(true);
  });

  it('fills in a claim and lists links, chapter-first', async () => {
    const { client, calls } = fake({});
    const repo = new SupabaseMeetingActionItemTaskRepository(client);
    await repo.setTask(CHAPTER, MINUTES, KEY, { id: 't-1', group_id: 'g-1' });
    expect(has(calls, 'update', { task_id: 't-1', task_group_id: 'g-1' })).toBe(
      true,
    );
    calls.length = 0;
    await repo.listForMeeting(CHAPTER, MINUTES);
    expect(has(calls, 'eq', 'chapter_id', CHAPTER)).toBe(true);
    expect(has(calls, 'eq', 'meeting_id', MINUTES)).toBe(true);
  });
});
