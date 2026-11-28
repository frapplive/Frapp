// What a member assigned, a task for everyone counted once (#5492), and the
// one read Activity draws its task lists from (`activity_task_reads`, #6061),
// against a real Postgres and PostgREST.
//
// The unit specs prove what the repository asks for and what the service
// makes of the answer. This proves what the function itself returns: that a
// group with a copy not yet confirmed is kept and a finished one is not, with
// its lowest-id open copy whole; that every capped list is cut at the limit
// asked and ordered as its own read was, and `waiting_total` counts past the
// cap; that one-person tasks leave out every copy; that copy states cover a
// group the caller made but holds no copy of, in their few columns only; that
// a caller without `tasks:manage` gets their own tasks only; that `own` holds
// what was done since the week began; and that rows come back as PostgREST
// serves them.
//
// Run: `npm run test:integration -w apps/api` (needs a local Supabase stack
// with `20261128043840` applied; skips cleanly without a stack).

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
    /** Oldest first: Open, Finished, Half, Others. */
    const groupIds: string[] = [];

    const assertOk = (label: string, error: unknown) => {
      if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
    };

    const makeGroup = async (
      title: string,
      assigneeIds = userIds,
    ): Promise<Task[]> =>
      tasks.createGroup({
        chapter_id: chapterId,
        created_by: officerId,
        audience: 'everyone',
        target_id: null,
        target_name: null,
        assignee_ids: assigneeIds,
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
      // A fourth the officer made for the three members only: no copy of it is
      // the officer's, so only `made_groups` draws its copies.
      groupIds.push((await makeGroup('Others', userIds.slice(1)))[0].group_id!);
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
      // Done by members and waiting on an officer's confirm, made in this
      // order and done on different days: the longest waiting is not the
      // oldest made, nor the newest.
      for (const [title, assignee, completedAt] of [
        ['Waiting', userIds[2], '2026-11-18T00:00:00.000Z'],
        ['Waiting longest', userIds[3], '2026-11-16T00:00:00.000Z'],
        ['Waiting newest', userIds[1], '2026-11-19T00:00:00.000Z'],
      ] as const) {
        assertOk(
          'waiting task',
          (
            await supabase.from('tasks').insert({
              chapter_id: chapterId,
              title,
              assignee_id: assignee,
              created_by: officerId,
              due_date: '2026-12-01',
              status: TaskStatus.COMPLETED,
              completed_at: completedAt,
            })
          ).error,
        );
      }
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

    const COPY_STATE_COLUMNS = [
      'assignee_id',
      'due_at',
      'due_date',
      'group_id',
      'id',
      'points_awarded',
      'status',
    ];

    it('keeps only groups with a copy not yet confirmed, newest first, each with one open copy whole', async () => {
      const [open, finished, half, others] = groupIds;
      const reads = await read(officerId, true);

      expect(reads.made_groups.map((group) => group.id)).toEqual([
        others,
        half,
        open,
      ]);
      // One copy not confirmed per live group, the lowest id, read whole.
      expect(reads.shared.map((copy) => copy.group_id).sort()).toEqual(
        [others, half, open].sort(),
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
      // The groups of every row drawn: the officer holds a copy of the first
      // three, and made a copy of all four.
      expect(reads.row_groups.map((group) => group.id).sort()).toEqual(
        [open, finished, half, others].sort(),
      );
      expect(reads.copy_states).toHaveLength(15);
      for (const state of reads.copy_states) {
        expect(Object.keys(state).sort()).toEqual(COPY_STATE_COLUMNS);
      }
    });

    it('draws every copy of a group the caller made but holds no copy of', async () => {
      const [, , half, others] = groupIds;
      // At 2, `made` holds only the two newest one-person tasks, so no row
      // brings Others in: only `made_groups` does.
      const reads = await read(officerId, true, { limit: 2 });

      expect(reads.made_groups.map((group) => group.id)).toEqual([
        others,
        half,
      ]);
      expect(reads.row_groups.map((group) => group.id)).not.toContain(others);
      expect(
        reads.copy_states.filter((state) => state.group_id === others),
      ).toHaveLength(3);
      expect(reads.shared.map((copy) => copy.group_id)).toContain(others);
    });

    it('reads one-person tasks the caller made apart from every copy, newest first', async () => {
      const reads = await read(officerId, true);

      expect(reads.singles.map((task) => task.title)).toEqual([
        'Waiting newest',
        'Waiting longest',
        'Waiting',
        'Solo',
      ]);
      for (const task of reads.singles) expect(task.group_id).toBeNull();
    });

    it('caps every list at the limit asked', async () => {
      const reads = await read(officerId, true, { limit: 2 });

      expect(reads.made).toHaveLength(2);
      expect(reads.made.map((task) => task.title)).toEqual([
        'Waiting newest',
        'Waiting longest',
      ]);
      expect(reads.singles.map((task) => task.title)).toEqual([
        'Waiting newest',
        'Waiting longest',
      ]);
      expect(reads.made_groups).toHaveLength(2);
      expect(reads.waiting).toHaveLength(2);
    });

    it('lists finished work waiting on a confirm longest first, with how many wait in all', async () => {
      const reads = await read(officerId, true, { limit: 2 });

      expect(reads.waiting.map((task) => task.title)).toEqual([
        'Waiting longest',
        'Waiting',
      ]);
      // Counted past the cap.
      expect(reads.waiting_total).toBe(3);
      // Not the caller's own completion: theirs isn't theirs to confirm.
      const asAssignee = await read(userIds[2], true);
      expect(asAssignee.waiting.map((task) => task.title)).toEqual([
        'Waiting longest',
        'Waiting newest',
      ]);
      expect(asAssignee.waiting_total).toBe(2);
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
