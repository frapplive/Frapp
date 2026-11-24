/**
 * The recruitment follow-up queries (#5934) against live PostgREST. The unit
 * specs mock the repositories, so this is where their filters meet the real
 * columns:
 * - `advanceLastContact` moves a prospect's last contact only forward (the
 *   `.or()` filter), so two contacts logged at once settle on the later day;
 * - a claim lands only on an unowned prospect, so two at once leave one owner;
 * - the candidate repository never reads the pipeline's owner and follow-up
 *   columns, which the chat card would otherwise spread into a channel;
 * - the morning sweeps read due follow-ups and owned open prospects, and skip
 *   closed ones.
 */
import { randomUUID } from 'node:crypto';
import { SupabaseRushPipelineRepository } from '../../src/infrastructure/supabase/repositories/supabase-rush-pipeline.repository';
import { SupabaseRushCandidateRepository } from '../../src/infrastructure/supabase/repositories/supabase-rush-candidate.repository';
import { SupabaseScheduledJobsRepository } from '../../src/infrastructure/supabase/repositories/supabase-scheduled-jobs.repository';
import type { FrappSupabaseClient } from '../../src/infrastructure/supabase/database.types';
import { createServiceRoleClient, describeIntegration } from './stack';

describeIntegration('Recruitment follow-ups against live PostgREST', () => {
  let supabase: FrappSupabaseClient;
  let pipeline: SupabaseRushPipelineRepository;
  let candidates: SupabaseRushCandidateRepository;
  let sweeps: SupabaseScheduledJobsRepository;

  const chapterId = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const open = randomUUID();
  const closed = randomUUID();

  const assertOk = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };

  beforeAll(async () => {
    supabase = createServiceRoleClient();
    pipeline = new SupabaseRushPipelineRepository(supabase);
    candidates = new SupabaseRushCandidateRepository(supabase);
    sweeps = new SupabaseScheduledJobsRepository(supabase);

    assertOk(
      'users',
      (
        await supabase.from('users').insert([
          {
            id: userA,
            supabase_auth_id: randomUUID(),
            email: `rush-a-${userA}@example.com`,
            display_name: 'A',
          },
          {
            id: userB,
            supabase_auth_id: randomUUID(),
            email: `rush-b-${userB}@example.com`,
            display_name: 'B',
          },
        ] as never)
      ).error,
    );
    assertOk(
      'chapter',
      (
        await supabase
          .from('chapters')
          .insert({ id: chapterId, name: 'Rush IT', university: 'U' } as never)
      ).error,
    );
    assertOk(
      'candidates',
      (
        await supabase.from('rush_candidates').insert([
          {
            id: open,
            chapter_id: chapterId,
            display_name: 'Open One',
            created_by: userA,
            stage: 'new',
            closed_reason: null,
          },
          {
            id: closed,
            chapter_id: chapterId,
            display_name: 'Closed One',
            created_by: userA,
            stage: 'closed',
            closed_reason: 'no_response',
          },
        ] as never)
      ).error,
    );
  });

  afterAll(async () => {
    await supabase.from('chapters').delete().eq('id', chapterId);
    await supabase.from('users').delete().in('id', [userA, userB]);
  });

  it('moves the last contact only forward', async () => {
    await pipeline.advanceLastContact(open, chapterId, '2026-11-20', userA);
    await pipeline.advanceLastContact(open, chapterId, '2026-11-18', userB);
    let row = await pipeline.findCandidate(open, chapterId);
    expect(row).toMatchObject({
      last_contact_on: '2026-11-20',
      last_contact_by: userA,
    });

    await pipeline.advanceLastContact(open, chapterId, '2026-11-22', userB);
    row = await pipeline.findCandidate(open, chapterId);
    expect(row).toMatchObject({
      last_contact_on: '2026-11-22',
      last_contact_by: userB,
    });
  });

  it('lets one claim land on an unowned prospect', async () => {
    const first = await pipeline.setOwner(open, chapterId, userA, null);
    const second = await pipeline.setOwner(open, chapterId, userB, null);
    expect(first?.owner_id).toBe(userA);
    expect(second).toBeNull();

    const released = await pipeline.setOwner(open, chapterId, null, userA);
    expect(released?.owner_id).toBeNull();
    await pipeline.setOwner(open, chapterId, userA);
  });

  it('keeps the work columns off the candidate the card reads', async () => {
    const card = await candidates.findById(open, chapterId);
    expect(card).not.toBeNull();
    expect(card).not.toHaveProperty('owner_id');
    expect(card).not.toHaveProperty('follow_up_on');
    expect(card).toHaveProperty('closed_reason', null);
  });

  it('reads due follow-ups and owned open prospects for the sweeps', async () => {
    await pipeline.setFollowUp(open, chapterId, {
      on: '2026-11-26',
      note: 'Dinner',
      userId: userB,
    });
    await pipeline.setFollowUp(closed, chapterId, {
      on: '2026-11-26',
      note: null,
      userId: userB,
    });
    await pipeline.setOwner(closed, chapterId, userB);

    const due = (
      await sweeps.findRushFollowUpsDueBetween('2026-11-25', '2026-11-27')
    ).filter((row) => row.chapter_id === chapterId);
    expect(due).toEqual([
      expect.objectContaining({
        id: open,
        follow_up_on: '2026-11-26',
        follow_up_note: 'Dinner',
        follow_up_user_id: userB,
      }),
    ]);

    const owned = (await sweeps.findOwnedOpenRushCandidates()).filter(
      (row) => row.chapter_id === chapterId,
    );
    expect(owned.map((row) => row.id)).toEqual([open]);

    await pipeline.saveSettings(chapterId, 4);
    const chapters = await sweeps.findRushChapters([chapterId]);
    expect(chapters.staleDays.get(chapterId)).toBe(4);
    expect(chapters.enabledModules.has(chapterId)).toBe(true);
  });
});
