import { SupabaseMeetingActionItemTaskRepository } from './supabase-meeting-action-item-task.repository';
import type { FrappSupabaseClient } from '../database.types';

/**
 * `meeting_action_item_tasks` (#6062): the claim that keeps an action item to
 * one task. The table has no `id`, which the tenant harness keys rows by, so
 * a recording fake checks each query's filters instead: every one is
 * chapter-first, and the takeover and the release touch only an empty claim.
 */

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

describe('SupabaseMeetingActionItemTaskRepository', () => {
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
