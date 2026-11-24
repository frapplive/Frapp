import { SupabaseRushPipelineRepository } from './supabase-rush-pipeline.repository';
import {
  CHAPTER_A,
  CHAPTER_B,
  USER_SHARED,
  createTenantHarness,
  inA,
  inB,
  type Row,
  type TenantHarness,
} from '#test/helpers/tenant-scope.harness';

const STAGE_A = '0a000000-0000-4000-8000-000000005924';
const STAGE_B = '0b000000-0000-4000-8000-000000005924';
const CANDIDATE_A = '0a000000-0000-4000-8000-000000005925';
const CANDIDATE_B = '0b000000-0000-4000-8000-000000005925';
const TAG_A = '0a000000-0000-4000-8000-000000005926';
const TAG_B = '0b000000-0000-4000-8000-000000005926';
const NOTE_A = '0a000000-0000-4000-8000-000000005927';
const NOTE_B = '0b000000-0000-4000-8000-000000005927';
const NEW_TAG_B = '0b000000-0000-4000-8000-000000005928';
const AT = '2026-01-01T00:00:00.000Z';

const stage = (id: string) => ({
  id,
  key: 'new',
  label: 'New',
  category: 'new',
  position: 0,
  hidden: false,
  created_at: AT,
  updated_at: AT,
});
const candidate = (id: string) => ({
  id,
  display_name: 'Jane Doe',
  name_key: 'jane doe',
  user_id: null,
  stage: 'new',
  closed_reason: null,
  bid_status: 'none',
  created_by: USER_SHARED,
  created_at: AT,
});
const tag = (id: string) => ({ id, label: 'Legacy', created_at: AT });
// `rush_candidate_tags` and `rush_candidate_ratings` are keyed by
// (candidate_id, tag_id) and (candidate_id, rater_id), with no `id` column;
// each seeded row carries a synthetic one the repository never reads, because
// the harness tracks rows by `id`.
const candidateTag = (id: string, candidate_id: string, tag_id: string) => ({
  id,
  candidate_id,
  tag_id,
  created_at: AT,
});
const rating = (id: string, candidate_id: string) => ({
  id,
  candidate_id,
  rater_id: USER_SHARED,
  rating: 4,
  created_at: AT,
  updated_at: AT,
});
const vote = (id: string, candidate_id: string) => ({
  id,
  candidate_id,
  voter_id: USER_SHARED,
  created_at: AT,
});
const note = (id: string, candidate_id: string) => ({
  id,
  candidate_id,
  author_id: USER_SHARED,
  body: 'Great conversation',
  created_at: AT,
  updated_at: AT,
});

/**
 * Twins in every pipeline table. The child tables point at their own
 * chapter's candidate and tag, so those columns are exempt from collision;
 * each read below filters on them too, which is why a cross-chapter id is
 * also tried against every keyed read and write.
 */
const seed = () => ({
  rush_stages: [inA(stage(STAGE_A)), inB(stage(STAGE_B))],
  rush_candidates: [inA(candidate(CANDIDATE_A)), inB(candidate(CANDIDATE_B))],
  rush_tags: [inA(tag(TAG_A)), inB(tag(TAG_B))],
  rush_candidate_tags: [
    inA(candidateTag('link-a', CANDIDATE_A, TAG_A)),
    inB(candidateTag('link-b', CANDIDATE_B, TAG_B)),
  ],
  rush_candidate_ratings: [
    inA(rating('rating-a', CANDIDATE_A)),
    inB(rating('rating-b', CANDIDATE_B)),
  ],
  rush_candidate_votes: [
    inA(vote('0a000000-0000-4000-8000-000000005929', CANDIDATE_A)),
    inB(vote('0b000000-0000-4000-8000-000000005929', CANDIDATE_B)),
  ],
  rush_candidate_notes: [
    inA(note(NOTE_A, CANDIDATE_A)),
    inB(note(NOTE_B, CANDIDATE_B)),
  ],
});

const collisionExempt = {
  rush_candidate_tags: ['candidate_id', 'tag_id'],
  rush_candidate_ratings: ['candidate_id'],
  rush_candidate_votes: ['candidate_id'],
  rush_candidate_notes: ['candidate_id'],
};

describe('SupabaseRushPipelineRepository — tenant scope', () => {
  let harness: TenantHarness;
  let repo: SupabaseRushPipelineRepository;

  beforeEach(() => {
    harness = createTenantHarness({ tables: seed(), collisionExempt });
    repo = new SupabaseRushPipelineRepository(harness.client);
  });

  const row = (table: string, id: string): Row | undefined =>
    harness.rows(table).find((r) => r.id === id);

  describe('reads return only the caller chapter rows', () => {
    it.each([
      ['listStages', STAGE_B],
      ['listCandidates', CANDIDATE_B],
      ['listTags', TAG_B],
    ] as const)('%s', async (method, id) => {
      const rows: { id: string }[] = await harness.expectTenantScoped(
        CHAPTER_B,
        (): Promise<{ id: string }[]> => repo[method](CHAPTER_B),
      );
      expect(rows.map((r) => r.id)).toEqual([id]);
    });

    it('listCandidateTags', async () => {
      const rows = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.listCandidateTags(CHAPTER_B),
      );
      expect(rows.map((r) => [r.candidate_id, r.tag_id])).toEqual([
        [CANDIDATE_B, TAG_B],
      ]);
    });

    it('listRatings', async () => {
      const rows = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.listRatings(CHAPTER_B),
      );
      expect(rows.map((r) => r.candidate_id)).toEqual([CANDIDATE_B]);
    });

    it('listVotes', async () => {
      const rows = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.listVotes(CHAPTER_B),
      );
      expect(rows.map((r) => r.candidate_id)).toEqual([CANDIDATE_B]);
    });

    it("listNotes, and none for another chapter's candidate", async () => {
      const rows = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.listNotes(CANDIDATE_B, CHAPTER_B),
      );
      expect(rows.map((r) => r.id)).toEqual([NOTE_B]);

      const leaked = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.listNotes(CANDIDATE_A, CHAPTER_B),
      );
      expect(leaked).toEqual([]);
    });

    it("findTag and findNote miss another chapter's id", async () => {
      await expect(
        harness.expectTenantScoped(CHAPTER_B, () =>
          repo.findTag(TAG_B, CHAPTER_B),
        ),
      ).resolves.toMatchObject({ id: TAG_B });
      await expect(
        harness.expectTenantScoped(CHAPTER_B, () =>
          repo.findTag(TAG_A, CHAPTER_B),
        ),
      ).resolves.toBeNull();
      await expect(
        harness.expectTenantScoped(CHAPTER_B, () =>
          repo.findNote(NOTE_B, CANDIDATE_B, CHAPTER_B),
        ),
      ).resolves.toMatchObject({ id: NOTE_B });
      await expect(
        harness.expectTenantScoped(CHAPTER_B, () =>
          repo.findNote(NOTE_A, CANDIDATE_A, CHAPTER_B),
        ),
      ).resolves.toBeNull();
    });
  });

  describe('stages', () => {
    it('insertStagesIfMissing skips a key the chapter has and writes only its own rows', async () => {
      await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.insertStagesIfMissing(CHAPTER_B, [
          {
            key: 'new',
            label: 'Renamed',
            category: 'new',
            position: 0,
            hidden: false,
          },
          {
            key: 'closed',
            label: 'Closed',
            category: 'closed',
            position: 5,
            hidden: false,
          },
        ]),
      );
      const b = harness
        .rows('rush_stages')
        .filter((r) => r.chapter_id === CHAPTER_B);
      expect(b.map((r) => [r.key, r.label])).toEqual([
        ['new', 'New'],
        ['closed', 'Closed'],
      ]);
      expect(
        harness.rows('rush_stages').filter((r) => r.chapter_id === CHAPTER_A),
      ).toHaveLength(1);
    });

    it("saveStages can't update another chapter's stage by its id", async () => {
      const saved = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.saveStages(CHAPTER_B, [
          {
            id: STAGE_A,
            key: 'new',
            label: 'Hijacked',
            category: 'new',
            position: 3,
            hidden: true,
          },
          {
            id: STAGE_B,
            key: 'new',
            label: 'Lead',
            category: 'new',
            position: 0,
            hidden: false,
          },
          {
            key: 's_added',
            label: 'Walk-in',
            category: 'new',
            position: 1,
            hidden: false,
          },
        ]),
      );

      expect(row('rush_stages', STAGE_A)).toMatchObject({
        label: 'New',
        position: 0,
        hidden: false,
      });
      expect(saved.map((s) => s.label)).toEqual(['Lead', 'Walk-in']);
      expect(saved.every((s) => s.chapter_id === CHAPTER_B)).toBe(true);
    });
  });

  it('setCandidateStage refuses an id belonging to another chapter', async () => {
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.setCandidateStage(CANDIDATE_A, CHAPTER_B, 'closed', 'withdrew'),
      ),
    ).rejects.toMatchObject({ code: 'PGRST116' });
    expect(row('rush_candidates', CANDIDATE_A)).toMatchObject({
      stage: 'new',
      closed_reason: null,
    });

    const moved = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.setCandidateStage(CANDIDATE_B, CHAPTER_B, 'closed', 'no_response'),
    );
    expect(moved).toMatchObject({
      stage: 'closed',
      closed_reason: 'no_response',
    });
  });

  describe('tags', () => {
    it('createTag stamps the caller chapter', async () => {
      const created = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.createTag(CHAPTER_B, 'Athlete'),
      );
      expect(created.chapter_id).toBe(CHAPTER_B);
    });

    it('renameTag refuses an id belonging to another chapter', async () => {
      await expect(
        harness.expectTenantScoped(CHAPTER_B, () =>
          repo.renameTag(TAG_A, CHAPTER_B, 'Hijacked'),
        ),
      ).rejects.toMatchObject({ code: 'PGRST116' });
      expect(row('rush_tags', TAG_A)?.label).toBe('Legacy');
    });

    it("deleteTag leaves another chapter's tag in place", async () => {
      await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.deleteTag(TAG_A, CHAPTER_B),
      );
      expect(row('rush_tags', TAG_A)).toBeDefined();
      expect(row('rush_tags', TAG_B)).toBeDefined();
    });

    it('setCandidateTags deletes and writes only caller chapter rows', async () => {
      await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.setCandidateTags(CANDIDATE_B, CHAPTER_B, [NEW_TAG_B]),
      );
      const links = harness
        .rows('rush_candidate_tags')
        .map((r) => [r.chapter_id, r.candidate_id, r.tag_id]);
      expect(links).toEqual([
        [CHAPTER_A, CANDIDATE_A, TAG_A],
        [CHAPTER_B, CANDIDATE_B, NEW_TAG_B],
      ]);
    });

    it("setCandidateTags with another chapter's candidate deletes nothing", async () => {
      await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.setCandidateTags(CANDIDATE_A, CHAPTER_B, []),
      );
      expect(harness.rows('rush_candidate_tags')).toHaveLength(2);
    });

    it('setCandidateTags keeps a tag on both sides untouched', async () => {
      await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.setCandidateTags(CANDIDATE_B, CHAPTER_B, [TAG_B, NEW_TAG_B]),
      );
      const b = harness
        .rows('rush_candidate_tags')
        .filter((r) => r.chapter_id === CHAPTER_B);
      expect(b.map((r) => r.tag_id)).toEqual([TAG_B, NEW_TAG_B]);
      expect(b[0].created_at).toBe(AT);
    });
  });

  it('upsertRating replaces the caller chapter rating only', async () => {
    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.upsertRating(CANDIDATE_B, CHAPTER_B, USER_SHARED, 2),
    );
    const ratings = harness
      .rows('rush_candidate_ratings')
      .map((r) => [r.chapter_id, r.rating]);
    expect(ratings).toEqual([
      [CHAPTER_A, 4],
      [CHAPTER_B, 2],
    ]);
  });

  describe('notes', () => {
    it('createNote stamps the caller chapter', async () => {
      const created = await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.createNote(CANDIDATE_B, CHAPTER_B, USER_SHARED, 'Second chat'),
      );
      expect(created.chapter_id).toBe(CHAPTER_B);
    });

    it('updateNote refuses an id belonging to another chapter', async () => {
      await expect(
        harness.expectTenantScoped(CHAPTER_B, () =>
          repo.updateNote(NOTE_A, CHAPTER_B, 'Hijacked'),
        ),
      ).rejects.toMatchObject({ code: 'PGRST116' });
      expect(row('rush_candidate_notes', NOTE_A)?.body).toBe(
        'Great conversation',
      );
    });

    it("deleteNote leaves another chapter's note in place", async () => {
      await harness.expectTenantScoped(CHAPTER_B, () =>
        repo.deleteNote(NOTE_A, CHAPTER_B),
      );
      expect(row('rush_candidate_notes', NOTE_A)).toBeDefined();
      expect(row('rush_candidate_notes', NOTE_B)).toBeDefined();
    });
  });
});
