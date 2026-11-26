import { SupabaseTaskExtensionRequestRepository } from './supabase-task-extension-request.repository';
import {
  CHAPTER_A,
  CHAPTER_B,
  USER_SHARED,
  createTenantHarness,
  inA,
  inB,
  type TenantHarness,
} from '#test/helpers/tenant-scope.harness';

/**
 * Tenant scope for `task_extension_requests` and the members' extension block
 * (#6096). Every officer's Needs you reads the chapter's waiting requests, and
 * a dropped predicate would show one chapter's member asking another's
 * officers, or decide, block or restore a member in the wrong chapter.
 */

const TASK = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const SERIES = 'aaaaaaaa-0000-4000-8000-0000000000b1';

const request = {
  task_id: TASK,
  requester_id: USER_SHARED,
  reason: 'Shift ran late',
  from_due_date: '2026-11-26',
  from_due_at: null,
  to_due_date: '2026-11-27',
  to_due_at: null,
  status: 'pending',
  needs_officer: 'reason_invalid',
  ai_verdict: 'invalid',
  ai_note: null,
  auto_approved: false,
  decided_by: null,
  decided_at: null,
  decline_reason: null,
  created_at: '2026-11-26T00:00:00.000Z',
};

const member = {
  user_id: USER_SHARED,
  extension_requests_blocked_at: '2026-11-20T00:00:00.000Z',
  extension_requests_restored_at: null,
};

const seed = () => ({
  task_extension_requests: [
    inA({ id: 'req-a', ...request }),
    inB({ id: 'req-b', ...request }),
  ],
  members: [
    inA({ id: 'member-a', ...member }),
    inB({ id: 'member-b', ...member }),
  ],
  tasks: [
    inA({ id: 'task-a', series_id: SERIES, occurrence_date: '2026-11-19' }),
    inB({ id: 'task-b', series_id: SERIES, occurrence_date: '2026-11-19' }),
  ],
});

describe('SupabaseTaskExtensionRequestRepository — tenant scope', () => {
  let harness: TenantHarness;
  let repo: SupabaseTaskExtensionRequestRepository;

  beforeEach(() => {
    harness = createTenantHarness({ tables: seed() });
    repo = new SupabaseTaskExtensionRequestRepository(harness.client);
  });

  it('reads only the caller chapter requests', async () => {
    const byId = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.findById(CHAPTER_B, 'req-b'),
    );
    expect(byId?.chapter_id).toBe(CHAPTER_B);

    const forTask = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.listForTask(CHAPTER_B, TASK),
    );
    expect(forTask.map((row) => row.id)).toEqual(['req-b']);

    const latest = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.latestForTasks(CHAPTER_B, [TASK]),
    );
    expect(latest.get(TASK)?.id).toBe('req-b');

    const pending = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.listPending(CHAPTER_B, 25),
    );
    expect(pending.map((row) => row.id)).toEqual(['req-b']);
  });

  it('decides only the caller chapter request', async () => {
    const decided = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.decide(CHAPTER_B, 'req-b', {
        status: 'declined',
        decided_by: USER_SHARED,
        decided_at: '2026-11-26T01:00:00.000Z',
        decline_reason: 'No',
      }),
    );

    expect(decided?.status).toBe('declined');
    const rows = harness.rows('task_extension_requests');
    expect(rows.find((row) => row.id === 'req-a')?.status).toBe('pending');
  });

  it('withdraws only the caller chapter waiting request', async () => {
    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.withdrawPending(CHAPTER_B, TASK),
    );

    const rows = harness.rows('task_extension_requests');
    expect(rows.find((row) => row.id === 'req-b')?.status).toBe('withdrawn');
    expect(rows.find((row) => row.id === 'req-a')?.status).toBe('pending');
  });

  it('counts, and finds the previous copy, within the caller chapter', async () => {
    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.countApprovedSince(CHAPTER_B, USER_SHARED, '2026-11-01T00:00:00Z'),
    );
    const previous = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.previousSeriesCopyId(CHAPTER_B, SERIES, '2026-11-26'),
    );
    expect(previous).toBe('task-b');
  });

  it('reads, restores and lists the block within the caller chapter', async () => {
    const standing = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.standing(CHAPTER_B, USER_SHARED),
    );
    expect(standing?.blocked_at).toBe(member.extension_requests_blocked_at);

    const blocked = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.listBlocked(CHAPTER_B),
    );
    expect(blocked).toHaveLength(1);

    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.restore(CHAPTER_B, USER_SHARED, '2026-11-26T02:00:00.000Z'),
    );
    const members = harness.rows('members');
    expect(
      members.find((row) => row.id === 'member-b')
        ?.extension_requests_blocked_at,
    ).toBeNull();
    expect(
      members.find((row) => row.id === 'member-a')
        ?.extension_requests_blocked_at,
    ).toBe(member.extension_requests_blocked_at);
  });

  it('blocks only the caller chapter member', async () => {
    harness = createTenantHarness({
      tables: {
        members: [
          inA({
            id: 'member-a',
            ...member,
            extension_requests_blocked_at: null,
          }),
          inB({
            id: 'member-b',
            ...member,
            extension_requests_blocked_at: null,
          }),
        ],
      },
    });
    repo = new SupabaseTaskExtensionRequestRepository(harness.client);

    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.block(CHAPTER_B, USER_SHARED, '2026-11-26T03:00:00.000Z'),
    );

    const members = harness.rows('members');
    expect(
      members.find((row) => row.id === 'member-a')
        ?.extension_requests_blocked_at,
    ).toBeNull();
  });
});
