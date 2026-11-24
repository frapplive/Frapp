import { SupabaseRushBidRepository } from './supabase-rush-bid.repository';
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

const CANDIDATE_A = '0a000000-0000-4000-8000-000000005973';
const CANDIDATE_B = '0b000000-0000-4000-8000-000000005973';
const AT = '2026-11-24T12:00:00.000Z';
const LATER = '2026-12-01T12:00:00.000Z';

const candidate = (id: string) => ({
  id,
  display_name: 'Jane Doe',
  stage: 'new',
  closed_reason: null,
  bid_status: 'extended',
  bid_state: 'extended',
  bid_expires_at: LATER,
  bid_acceptance_recorded_at: AT,
  bid_invite_sent: null,
  created_by: USER_SHARED,
  created_at: AT,
});
// `rush_bid_confirmations` is keyed by `candidate_id`; each seeded row carries
// a synthetic `id` the repository never reads, because the harness tracks
// rows by `id`. Each twin's token is its own, so they differ by design.
const confirmation = (id: string, candidate_id: string, token: string) => ({
  id,
  candidate_id,
  email: 'pnm@example.com',
  token_hash: token,
  emailed_at: null,
  created_at: AT,
});

const seed = () => ({
  rush_candidates: [inA(candidate(CANDIDATE_A)), inB(candidate(CANDIDATE_B))],
  rush_bid_confirmations: [
    inA(confirmation('conf-a', CANDIDATE_A, 'hash-a')),
    inB(confirmation('conf-b', CANDIDATE_B, 'hash-b')),
  ],
});

const collisionExempt = {
  rush_bid_confirmations: ['candidate_id', 'token_hash'],
};

/**
 * The bid writes (#5973) stay inside the caller's chapter: a candidate id from
 * another chapter matches nothing. The one lookup that isn't chapter-keyed is
 * the PNM's token, which carries no chapter until it resolves one.
 */
describe('SupabaseRushBidRepository — tenant scope', () => {
  let harness: TenantHarness;
  let repo: SupabaseRushBidRepository;

  beforeEach(() => {
    harness = createTenantHarness({ tables: seed(), collisionExempt });
    repo = new SupabaseRushBidRepository(harness.client);
  });

  const row = (table: string, match: (r: Row) => boolean): Row | undefined =>
    harness.rows(table).find(match);

  it("transition moves the caller's bid and misses another chapter's", async () => {
    const transition = {
      from: ['extended'] as const,
      set: { bid_state: 'accepted' as const, bid_answered_at: AT },
      now: AT,
      open: true,
      recorded: true,
    };
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.transition(CANDIDATE_A, CHAPTER_B, transition),
      ),
    ).resolves.toBeNull();
    expect(row('rush_candidates', (r) => r.id === CANDIDATE_A)).toMatchObject({
      bid_state: 'extended',
    });

    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.transition(CANDIDATE_B, CHAPTER_B, transition),
      ),
    ).resolves.toMatchObject({ id: CANDIDATE_B, bid_state: 'accepted' });
  });

  it("finds, marks and deletes only the caller's confirmation", async () => {
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.findConfirmation(CANDIDATE_A, CHAPTER_B),
      ),
    ).resolves.toBeNull();
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.findConfirmation(CANDIDATE_B, CHAPTER_B),
      ),
    ).resolves.toMatchObject({ candidate_id: CANDIDATE_B });

    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.markConfirmationEmailed(CANDIDATE_A, CHAPTER_B, AT),
    );
    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.deleteConfirmation(CANDIDATE_A, CHAPTER_B),
    );
    expect(
      row('rush_bid_confirmations', (r) => r.id === 'conf-a'),
    ).toMatchObject({ emailed_at: null });

    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.markConfirmationEmailed(CANDIDATE_B, CHAPTER_B, AT),
    );
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.candidatesWithConfirmationEmail(CHAPTER_B),
      ),
    ).resolves.toEqual(new Set([CANDIDATE_B]));
    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.deleteConfirmation(CANDIDATE_B, CHAPTER_B),
    );
    expect(
      harness.rows('rush_bid_confirmations').map((r) => r.candidate_id),
    ).toEqual([CANDIDATE_A]);
  });

  it("setInviteSent touches only the caller's accepted bid", async () => {
    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.transition(CANDIDATE_B, CHAPTER_B, {
        from: ['extended'],
        set: { bid_state: 'accepted' },
        now: AT,
      }),
    );
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.setInviteSent(CANDIDATE_A, CHAPTER_B, true),
      ),
    ).resolves.toBeNull();
    await expect(
      harness.expectTenantScoped(CHAPTER_B, () =>
        repo.setInviteSent(CANDIDATE_B, CHAPTER_B, true),
      ),
    ).resolves.toMatchObject({ id: CANDIDATE_B, bid_invite_sent: true });
    expect(row('rush_candidates', (r) => r.id === CANDIDATE_A)).toMatchObject({
      bid_invite_sent: null,
    });
  });

  it('saveConfirmation writes the row in the caller chapter', async () => {
    await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.saveConfirmation({
        candidateId: CANDIDATE_B,
        chapterId: CHAPTER_B,
        email: 'new@example.com',
        tokenHash: 'hash-new',
      }),
    );
    expect(
      row('rush_bid_confirmations', (r) => r.candidate_id === CANDIDATE_B),
    ).toMatchObject({ chapter_id: CHAPTER_B, token_hash: 'hash-new' });
  });

  it('the token lookup resolves the one row its hash names, whichever chapter', async () => {
    await expect(
      repo.findConfirmationByTokenHash('hash-a'),
    ).resolves.toMatchObject({
      candidate_id: CANDIDATE_A,
      chapter_id: CHAPTER_A,
    });
    await expect(
      repo.findConfirmationByTokenHash('unknown'),
    ).resolves.toBeNull();
  });
});
