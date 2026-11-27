import { SupabaseInterestFormRepository } from './supabase-interest-form.repository';
import {
  CHAPTER_A,
  CHAPTER_B,
  createTenantHarness,
} from '#test/helpers/tenant-scope.harness';

/**
 * Tenant scope for interest forms (#5977): the colliding twins are two
 * chapters, each with a live form and a submission from the same address
 * for a candidate of the same id. Every chapter-keyed read and write must
 * filter on the chapter it was handed, so a form never reveals another
 * chapter's data (#5977's acceptance criteria). The public page's reads are
 * keyed by the form its slug found, and the database functions own codes
 * and submissions (the PGlite tier `interest-forms.mjs`).
 */
const STAMP = '2026-11-24T00:00:00Z';
const CANDIDATE = '00000000-0000-4000-8000-0000000000c1';

const form = (chapterId: string) => ({
  id: `f-${chapterId.slice(-4)}`,
  chapter_id: chapterId,
  slug: 'k3mz8qpt2a',
  is_open: true,
  blurb: null,
  questions: [],
  ask_referrer: true,
  replaced_at: null,
  created_by: null,
  created_at: STAMP,
  updated_at: STAMP,
});

const submission = (chapterId: string) => ({
  id: `s-${chapterId.slice(-4)}`,
  form_id: 'f-shared',
  chapter_id: chapterId,
  pnm_id: null,
  candidate_id: CANDIDATE,
  email: 'pat@example.edu',
  first_name: 'Pat',
  last_name: 'Tier',
  preferred_name: null,
  class_year: 2030,
  phone: null,
  answers: {},
  referrer_text: null,
  referrer_user_id: null,
  link_candidate_id: null,
  source_label: null,
  consent_version: '2026-11-24',
  consent_boxes: ['agree_18'],
  consented_at: STAMP,
  created_at: STAMP,
});

function setup() {
  const harness = createTenantHarness({
    tables: {
      chapter_interest_forms: [form(CHAPTER_A), form(CHAPTER_B)],
      interest_form_submissions: [submission(CHAPTER_A), submission(CHAPTER_B)],
    },
  });
  return { harness, repo: new SupabaseInterestFormRepository(harness.client) };
}

describe('SupabaseInterestFormRepository — two chapters', () => {
  it("findLiveForm reads only the chapter's own form", async () => {
    const { harness, repo } = setup();
    const row = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.findLiveForm(CHAPTER_B),
    );
    expect(row?.chapter_id).toBe(CHAPTER_B);
  });

  it("updateForm can't reach another chapter's form by its id", async () => {
    const { harness, repo } = setup();
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.updateForm(`f-${CHAPTER_A.slice(-4)}`, CHAPTER_B, {
          is_open: false,
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("findLatestSubmission reads only the chapter's own submission for a candidate", async () => {
    const { harness, repo } = setup();
    const row = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findLatestSubmission(CHAPTER_A, CANDIDATE),
    );
    expect(row?.chapter_id).toBe(CHAPTER_A);
  });

  it("findPrefill reads the address's details at this chapter only", async () => {
    const { harness, repo } = setup();
    const row = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.findPrefill(CHAPTER_B, [], 'Pat@Example.edu'),
    );
    expect(row?.first_name).toBe('Pat');
  });
});
