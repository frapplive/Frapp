// What a member assigned, a task for everyone counted once (#5492), and the
// one read Activity draws its task lists from (`activity_task_reads`, #6061),
// against a real Postgres and PostgREST.
//
// The unit specs prove what the repository asks for and what the service
// makes of the answer. This proves what the function does with it: that a
// group with a copy not yet confirmed is kept and a finished one is not; that
// every list is capped at the limit asked and ordered as its own read was;
// that a caller without `tasks:manage` gets their own tasks only; that `own`
// holds what was done since the week began; that `groupless` leaves out every
// copy; and that copy states carry their few columns only.
//
// Run: `npm run test:integration -w apps/api` (needs a local Supabase stack
// with `20261127184500` applied; skips cleanly without a stack).

import { randomUUID } from 'node:crypto';
import { SupabaseTaskRepository } from '../../src/infrastructure/supabase/repositories/supabase-task.repository';
import type { FrappSupabaseClient } from '../../src/infrastructure/supabase/database.types';
import { TaskStatus } from '../../src/domain/entities/task.entity';
import type { Task } from '../../src/domain/entities/task.entity';
import { createServiceRoleClient, describeIntegration } from './stack';

describeIntegration(
  'A creator’s unfinished groups against live PostgREST (#5492)',
  () => {
    let supabase: FrappSupabaseClient;
    let tasks: SupabaseTaskRepository;
    const chapterId = randomUUID();
    const officerId = randomUUID();
    /** Everyone a group goes to: the officer and three members. */
    const userIds = [officerId, randomUUID(), randomUUID(), randomUUID()];
    /** Oldest first: Open, Finished, Half. */
    const groupIds: string[] = [];

    const assertOk = (label: string, error: unknown) => {
      if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
    };

    const makeGroup = async (title: string): Promise<Task[]> =>
      tasks.createGroup({
        chapter_id: chapterId,
        created_by: officerId,
        audience: 'everyone',
        target_id: null,
        target_name: null,
        assignee_ids: userIds,
        title,
        description: null,
        due_date: '2026-12-01',
        due_at: null,
        point_reward: null,
        proof_kind: 'none',
        subtask_titles: [],
        attachments: [],
      });

    const confirm = async (copy: Task) =>
      assertOk(
        'confirm',
        (
          await supabase
            .from('tasks')
            .update({
              status: TaskStatus.COMPLETED,
              completed_at: '2026-11-18T00:00:00.000Z',
              confirmed_at: '2026-11-18T00:00:00.000Z',
              points_awarded: true,
            })
            .eq('id', copy.id)
        ).error,
      );

    beforeAll(async () => {
      supabase = createServiceRoleClient();
      tasks = new SupabaseTaskRepository(supabase);
      assertOk(
        'chapter',
        (
          await supabase
            .from('chapters')
            .insert({ id: chapterId, name: 'Groups', university: 'U' })
        ).error,
      );
      for (const id of userIds) {
        assertOk(
          'user',
          (
            await supabase.from('users').insert({
              id,
              supabase_auth_id: randomUUID(),
              email: `${id}@example.test`,
            })
          ).error,
        );
      }
      // Three groups of four copies, oldest first: Open (four open copies),
      // Finished (every copy confirmed), Half (one confirmed, three open).
      for (const title of ['Open', 'Finished', 'Half']) {
        const copies = await makeGroup(title);
        groupIds.push(copies[0].group_id!);
        if (title === 'Finished') {
          for (const copy of copies) await confirm(copy);
        }
        if (title === 'Half') await confirm(copies[0]);
      }
      assertOk(
        'one-person task',
        (
          await supabase.from('tasks').insert({
            chapter_id: chapterId,
            title: 'Solo',
            assignee_id: userIds[1],
            created_by: officerId,
            due_date: '2026-12-01',
            status: TaskStatus.TODO,
          })
        ).error,
      );
      // Done by a member and waiting on an officer's confirm.
      assertOk(
        'waiting task',
        (
          await supabase.from('tasks').insert({
            chapter_id: chapterId,
            title: 'Waiting',
            assignee_id: userIds[2],
            created_by: officerId,
            due_date: '2026-12-01',
            status: TaskStatus.COMPLETED,
            completed_at: '2026-11-18T00:00:00.000Z',
          })
        ).error,
      );
    });

    afterAll(async () => {
      if (!supabase) return;
      await supabase.from('chapters').delete().eq('id', chapterId);
      await supabase.from('users').delete().in('id', userIds);
    });

    const read = (
      userId: string,
      canManage: boolean,
      { weekStart = '2026-11-17T00:00:00.000Z', limit = 25 } = {},
    ) =>
      tasks.readActivityTasks(chapterId, {
        userId,
        canManage,
        weekStart,
        limit,
      });

    it('keeps only groups with a copy not yet confirmed, newest first, each with one open copy whole', async () => {
      const [open, finished, half] = groupIds;
      const reads = await read(officerId, true);

      expect(reads.made_groups.map((group) => group.id)).toEqual([half, open]);
      // One copy not confirmed per live group, the lowest id, read whole.
      expect(reads.shared.map((copy) => copy.group_id).sort()).toEqual(
        [half, open].sort(),
      );
      for (const copy of reads.shared) {
        expect(copy.points_awarded).toBe(false);
        expect(copy).toHaveProperty('title');
        const lowest = reads.copy_states
          .filter(
            (state) =>
              state.group_id === copy.group_id && !state.points_awarded,
          )
          .map((state) => state.id)
          .sort()[0];
        expect(copy.id).toBe(lowest);
      }
      // Every copy of the groups drawn: the officer holds a copy of all three,
      // so `own` draws Finished's too.
      expect(reads.row_groups.map((group) => group.id).sort()).toEqual(
        [open, finished, half].sort(),
      );
      expect(reads.copy_states).toHaveLength(12);
    });

    it('caps every list at the limit asked', async () => {
      const [open, , half] = groupIds;
      const reads = await read(officerId, true, { limit: 2 });

      // Two live groups, each with several open copies: still both.
      expect(reads.made_groups.map((group) => group.id)).toEqual([half, open]);
      expect(reads.made).toHaveLength(2);
      expect(reads.singles).toHaveLength(2);
      // The newest first, as the page reads them.
      expect(reads.singles.map((task) => task.title)).toEqual([
        'Waiting',
        'Solo',
      ]);
    });

    it('lists finished work waiting on a confirm, with how many wait in all', async () => {
      const reads = await read(officerId, true, { limit: 1 });

      expect(reads.waiting.map((task) => task.title)).toEqual(['Waiting']);
      expect(reads.waiting_total).toBe(1);
      // Not the officer's own completion: theirs isn't theirs to confirm.
      const asAssignee = await read(userIds[2], true);
      expect(asAssignee.waiting).toEqual([]);
      expect(asAssignee.waiting_total).toBe(0);
    });

    it('holds what was done since the week began, confirmed or not, and nothing confirmed before it', async () => {
      const [, finished] = groupIds;
      const inWeek = await read(officerId, true);
      const after = await read(officerId, true, {
        weekStart: '2026-11-19T00:00:00.000Z',
      });

      expect(inWeek.own.some((task) => task.group_id === finished)).toBe(true);
      expect(after.own.some((task) => task.group_id === finished)).toBe(false);
      for (const task of [...inWeek.own, ...after.own]) {
        expect(task.assignee_id).toBe(officerId);
      }
    });

    it('gives a member without tasks:manage their own tasks only', async () => {
      const member = userIds[1];
      const reads = await read(member, false);

      expect(reads.own.length).toBeGreaterThan(0);
      for (const task of reads.own) expect(task.assignee_id).toBe(member);
      expect(reads.own.map((task) => task.title)).toContain('Solo');
      expect(reads.waiting).toEqual([]);
      expect(reads.waiting_total).toBe(0);
      expect(reads.made).toEqual([]);
      expect(reads.singles).toEqual([]);
      expect(reads.made_groups).toEqual([]);
      expect(reads.shared).toEqual([]);
    });

    it('returns each row and group as PostgREST serves it, every column alike', async () => {
      const reads = await read(officerId, true);
      const waiting = reads.waiting[0];
      const [group] = reads.made_groups;

      expect(waiting).toEqual(await tasks.findById(waiting.id, chapterId));
      expect(group).toEqual((await tasks.findGroups(chapterId, [group.id]))[0]);
    });

    it('reads nothing of another chapter', async () => {
      const reads = await tasks.readActivityTasks(randomUUID(), {
        userId: officerId,
        canManage: true,
        weekStart: '2026-11-17T00:00:00.000Z',
        limit: 25,
      });

      expect(reads).toEqual({
        own: [],
        waiting: [],
        waiting_total: 0,
        made: [],
        singles: [],
        made_groups: [],
        row_groups: [],
        copy_states: [],
        shared: [],
      });
    });

    it('reads one-person tasks apart from every copy', async () => {
      const solo = await tasks.findByChapter(chapterId, {
        createdBy: officerId,
        groupless: true,
      });

      expect(solo.map((task) => task.title)).toEqual(['Waiting', 'Solo']);
    });

    it('reads a group’s copy states as their few columns only', async () => {
      const [open] = groupIds;
      const states = await tasks.findGroupCopyStates(chapterId, [open]);

      expect(states).toHaveLength(4);
      for (const state of states) {
        expect(Object.keys(state).sort()).toEqual([
          'assignee_id',
          'due_at',
          'due_date',
          'group_id',
          'id',
          'points_awarded',
          'status',
        ]);
      }
    });
  },
);
