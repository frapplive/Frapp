import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { InterestFormService } from './interest-form.service';
import { PnmService } from './pnm.service';
import type { IPnmRepository } from '#domain/repositories/pnm.repository.interface';
import type { IAffiliationRepository } from '#domain/repositories/affiliation.repository.interface';
import type { IChapterRepository } from '#domain/repositories/chapter.repository.interface';
import type {
  CouncilRecruitmentSeason,
  Pnm,
} from '#domain/entities/pnm.entity';

const COUNCIL = 'council-1';
const SCHOOL = 'school-1';
const ACTOR = 'officer-1';
const TERM = 'Spring 2027';
const CH_A = 'chapter-a';
const CH_B = 'chapter-b';

function pnm(over: Partial<Pnm> = {}): Pnm {
  return {
    id: 'pnm-1',
    school_id: SCHOOL,
    user_id: null,
    school_email: 'pat@rpi.edu',
    email_verified_at: '2026-11-24T00:00:00Z',
    first_name: 'Pat',
    last_name: 'Tier',
    preferred_name: null,
    class_year: 2030,
    phone: '5550001111',
    phone_shared: false,
    merged_into_id: null,
    created_via: 'interest_form',
    created_at: '2026-11-24T00:00:00Z',
    updated_at: '2026-11-24T00:00:00Z',
    ...over,
  };
}

function season(
  status: CouncilRecruitmentSeason['status'],
): CouncilRecruitmentSeason {
  return {
    council_id: COUNCIL,
    term: TERM,
    opens_at: '2027-01-10T00:00:00Z',
    closes_at: '2027-02-10T00:00:00Z',
    bid_window_opens_at: null,
    bid_window_closes_at: null,
    status,
    pnm_retention_days: 180,
    created_at: '2026-11-24T00:00:00Z',
    updated_at: '2026-11-24T00:00:00Z',
  };
}

const council = (over: Record<string, unknown> = {}) => ({
  id: COUNCIL,
  kind: 'council',
  council_type: 'ifc',
  council_school_id: SCHOOL,
  council_verified_at: '2026-11-24T00:00:00Z',
  recruitment_model: 'open_bidding',
  ...over,
});

function setup() {
  const pnms = {
    findSeasons: jest.fn().mockResolvedValue([]),
    findSeason: jest.fn().mockResolvedValue(season('open')),
    createSeason: jest.fn(),
    updateSeason: jest.fn(),
    findRegistrations: jest.fn().mockResolvedValue([
      {
        id: 'r1',
        pnm_id: 'pnm-1',
        council_id: COUNCIL,
        term: TERM,
        status: 'registered',
        created_at: '2027-01-11T00:00:00Z',
      },
      {
        id: 'r2',
        pnm_id: 'pnm-2',
        council_id: COUNCIL,
        term: TERM,
        status: 'registered',
        created_at: '2027-01-12T00:00:00Z',
      },
    ]),
    findRegistrantIds: jest.fn().mockResolvedValue(['pnm-1']),
    findAllRegistrantIds: jest.fn().mockResolvedValue(['pnm-1', 'pnm-2']),
    findLivePnmsAtSchool: jest.fn().mockResolvedValue([
      pnm(),
      pnm({
        id: 'pnm-2',
        first_name: 'Sam',
        school_email: 'sam@rpi.edu',
        phone: null,
      }),
    ]),
    findInterests: jest.fn().mockResolvedValue([
      { id: 'i1', pnm_id: 'pnm-1', chapter_id: CH_A },
      { id: 'i2', pnm_id: 'pnm-1', chapter_id: CH_B },
      { id: 'i3', pnm_id: 'pnm-2', chapter_id: CH_A },
    ]),
    logCouncilAccess: jest.fn().mockResolvedValue(undefined),
    findDismissals: jest.fn().mockResolvedValue([]),
    dismissDuplicate: jest.fn().mockResolvedValue(undefined),
    merge: jest.fn(),
    findLivePnm: jest.fn().mockResolvedValue(pnm()),
    isLinkedToChapter: jest.fn().mockResolvedValue(true),
    purgeExpired: jest.fn(),
  };
  const affiliations = {
    findLiveLinksForCouncil: jest.fn().mockResolvedValue([
      { id: 'l1', council_id: COUNCIL, chapter_id: CH_A, status: 'accepted' },
      { id: 'l2', council_id: COUNCIL, chapter_id: CH_B, status: 'accepted' },
      {
        id: 'l3',
        council_id: COUNCIL,
        chapter_id: 'chapter-c',
        status: 'proposed',
      },
    ]),
    findListings: jest.fn().mockResolvedValue([
      { id: CH_A, name: 'Alpha' },
      { id: CH_B, name: 'Beta' },
    ]),
  };
  const chapters = { findById: jest.fn().mockResolvedValue(council()) };
  const interestForms = { pushUpChapter: jest.fn().mockResolvedValue(0) };
  const service = new PnmService(
    pnms,
    affiliations as unknown as IAffiliationRepository,
    chapters as unknown as IChapterRepository,
    interestForms as unknown as InterestFormService,
  );
  return { service, pnms, affiliations, chapters, interestForms };
}

describe('PnmService — the master list', () => {
  it('in season shows counts, never which chapters, and never a phone number', async () => {
    const { service, pnms } = setup();

    const list = await service.masterList(COUNCIL, ACTOR, TERM);

    expect(list.counts_only).toBe(true);
    expect(list.pnms).toHaveLength(2);
    for (const row of list.pnms) {
      expect(row.interested_chapter_ids).toBeNull();
      expect(row).not.toHaveProperty('phone');
    }
    const pat = list.pnms.find((r) => r.id === 'pnm-1')!;
    expect(pat.interest_count).toBe(2);
    expect(pat.has_phone).toBe(true);
    // No per-chapter totals in season: beside the counts they could tell
    // where a PNM signed up (Winston, 2026-11-24).
    expect(list.chapter_totals).toEqual([]);
    expect(JSON.stringify(list)).not.toContain('5550001111');
    // Interests only in the council's accepted chapters, never a proposed one.
    expect(pnms.findInterests).toHaveBeenCalledWith(
      ['pnm-1', 'pnm-2'],
      [CH_A, CH_B],
      '2027-02-10T00:00:00Z',
    );
    // PNMs only at the council's own school.
    expect(pnms.findLivePnmsAtSchool).toHaveBeenCalledWith(SCHOOL, [
      'pnm-1',
      'pnm-2',
    ]);
  });

  it('a planned season is counts only too', async () => {
    const { service, pnms } = setup();
    pnms.findSeason.mockResolvedValue(season('planned'));

    const list = await service.masterList(COUNCIL, ACTOR, TERM);

    expect(list.counts_only).toBe(true);
    expect(list.pnms.every((r) => r.interested_chapter_ids === null)).toBe(
      true,
    );
    expect(list.chapter_totals).toEqual([]);
  });

  it('after the season closes, shows which member chapters', async () => {
    const { service, pnms } = setup();
    pnms.findSeason.mockResolvedValue(season('closed'));

    const list = await service.masterList(COUNCIL, ACTOR, TERM);

    expect(list.counts_only).toBe(false);
    expect(
      list.pnms.find((r) => r.id === 'pnm-1')!.interested_chapter_ids,
    ).toEqual([CH_A, CH_B]);
    expect(list.chapter_totals).toEqual([
      { chapter_id: CH_A, name: 'Alpha', interested: 2 },
      { chapter_id: CH_B, name: 'Beta', interested: 1 },
    ]);
  });

  it('logs one row per PNM shown before returning them', async () => {
    const { service, pnms } = setup();

    await service.masterList(COUNCIL, ACTOR, TERM);

    expect(pnms.logCouncilAccess).toHaveBeenCalledWith(COUNCIL, ACTOR, [
      { pnmId: 'pnm-1', fields: ['name', 'school_email', 'class_year'] },
      { pnmId: 'pnm-2', fields: ['name', 'school_email', 'class_year'] },
    ]);
  });

  it('returns nothing when the log write fails', async () => {
    const { service, pnms } = setup();
    pnms.logCouncilAccess.mockRejectedValue(new Error('log down'));

    await expect(service.masterList(COUNCIL, ACTOR, TERM)).rejects.toThrow(
      'log down',
    );
  });

  it('an unverified council gets an empty list and reads no record', async () => {
    const { service, chapters, pnms } = setup();
    chapters.findById.mockResolvedValue(council({ council_verified_at: null }));

    const list = await service.masterList(COUNCIL, ACTOR, TERM);

    expect(list.pnms).toEqual([]);
    expect(pnms.findRegistrations).not.toHaveBeenCalled();
    expect(pnms.logCouncilAccess).not.toHaveBeenCalled();
  });

  it('a council with only proposed links gets an empty list', async () => {
    const { service, affiliations, pnms } = setup();
    affiliations.findLiveLinksForCouncil.mockResolvedValue([
      {
        id: 'l3',
        council_id: COUNCIL,
        chapter_id: 'chapter-c',
        status: 'proposed',
      },
    ]);
    affiliations.findListings.mockResolvedValue([]);

    const list = await service.masterList(COUNCIL, ACTOR, TERM);

    expect(list.pnms).toEqual([]);
    expect(pnms.findRegistrations).not.toHaveBeenCalled();
  });

  it('refuses a council whose recruitment model is none', async () => {
    const { service, chapters } = setup();
    chapters.findById.mockResolvedValue(council({ recruitment_model: 'none' }));

    const error = await service
      .masterList(COUNCIL, ACTOR, TERM)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'council.recruitment_off',
    });
  });

  it('a season the council lacks is 404', async () => {
    const { service, pnms } = setup();
    pnms.findSeason.mockResolvedValue(null);

    await expect(service.masterList(COUNCIL, ACTOR, TERM)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PnmService — phone numbers', () => {
  it('logs the phone read before reading it', async () => {
    const { service, pnms } = setup();
    const order: string[] = [];
    pnms.logCouncilAccess.mockImplementation(async () => {
      order.push('log');
    });
    pnms.findLivePnmsAtSchool.mockImplementation(async () => {
      order.push('read');
      return [pnm()];
    });

    const result = await service.revealPhone(COUNCIL, ACTOR, 'pnm-1');

    expect(result).toEqual({ phone: '5550001111' });
    expect(pnms.logCouncilAccess).toHaveBeenCalledWith(COUNCIL, ACTOR, [
      { pnmId: 'pnm-1', fields: ['phone'] },
    ]);
    // The record is read to find it, but the number goes out only after the log.
    expect(order).toEqual(['read', 'log']);
  });

  it('gives no number when the log write fails', async () => {
    const { service, pnms } = setup();
    pnms.logCouncilAccess.mockRejectedValue(new Error('log down'));

    await expect(service.revealPhone(COUNCIL, ACTOR, 'pnm-1')).rejects.toThrow(
      'log down',
    );
  });

  it("a PNM not on this council's list is 404, and nothing is logged", async () => {
    const { service, pnms } = setup();
    pnms.findRegistrantIds.mockResolvedValue([]);

    await expect(service.revealPhone(COUNCIL, ACTOR, 'pnm-9')).rejects.toThrow(
      NotFoundException,
    );
    expect(pnms.logCouncilAccess).not.toHaveBeenCalled();
  });
});

describe('PnmService — the merge queue', () => {
  it('suggests the same name with the same phone or class year, without the number', async () => {
    const { service, pnms } = setup();
    pnms.findLivePnmsAtSchool.mockResolvedValue([
      pnm({ id: 'a', phone: '(518) 555-0142' }),
      pnm({ id: 'b', school_email: 'pat.t@rpi.edu', phone: '5185550142' }),
      pnm({ id: 'c', first_name: 'Someone', last_name: 'Else' }),
    ]);

    const pairs = await service.duplicates(COUNCIL, ACTOR);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].reasons).toEqual([
      'same_name_and_phone',
      'same_name_and_class_year',
    ]);
    expect(JSON.stringify(pairs)).not.toContain('555');
  });

  it('logs every PNM a suggested pair shows', async () => {
    const { service, pnms } = setup();
    pnms.findLivePnmsAtSchool.mockResolvedValue([
      pnm({ id: 'a' }),
      pnm({ id: 'b', school_email: 'pat.t@rpi.edu' }),
    ]);

    await service.duplicates(COUNCIL, ACTOR);

    expect(pnms.logCouncilAccess).toHaveBeenCalledWith(COUNCIL, ACTOR, [
      { pnmId: 'a', fields: ['name', 'school_email', 'class_year'] },
      { pnmId: 'b', fields: ['name', 'school_email', 'class_year'] },
    ]);
  });

  it('matches one number written with and without its country code', async () => {
    const { service, pnms } = setup();
    pnms.findLivePnmsAtSchool.mockResolvedValue([
      pnm({ id: 'a', class_year: null, phone: '+1 518 555 0142' }),
      pnm({
        id: 'b',
        class_year: 2031,
        school_email: 'b@rpi.edu',
        phone: '(518) 555-0142',
      }),
    ]);

    const pairs = await service.duplicates(COUNCIL, ACTOR);

    expect(pairs.map((p) => p.reasons)).toEqual([['same_name_and_phone']]);
  });

  it('leaves out a pair an officer dismissed', async () => {
    const { service, pnms } = setup();
    pnms.findLivePnmsAtSchool.mockResolvedValue([
      pnm({ id: 'a' }),
      pnm({ id: 'b', school_email: 'pat.t@rpi.edu' }),
    ]);
    pnms.findDismissals.mockResolvedValue([
      { council_id: COUNCIL, pnm_a: 'a', pnm_b: 'b' },
    ]);

    await expect(service.duplicates(COUNCIL, ACTOR)).resolves.toEqual([]);
  });

  it('dismisses only two of its own registrants, in order', async () => {
    const { service, pnms } = setup();
    pnms.findRegistrantIds.mockResolvedValue(['pnm-2', 'pnm-1']);

    await service.dismissDuplicate(COUNCIL, ACTOR, 'pnm-2', 'pnm-1');

    expect(pnms.dismissDuplicate).toHaveBeenCalledWith(
      COUNCIL,
      'pnm-1',
      'pnm-2',
      ACTOR,
    );

    pnms.findRegistrantIds.mockResolvedValue(['pnm-1']);
    await expect(
      service.dismissDuplicate(COUNCIL, ACTOR, 'pnm-1', 'pnm-9'),
    ).rejects.toThrow(NotFoundException);
  });

  it('orders mixed-case ids the way Postgres compares uuids', async () => {
    const { service, pnms } = setup();
    const upper = 'B1000000-0000-4000-8000-000000000000';
    const lower = 'a2000000-0000-4000-8000-000000000000';
    pnms.findRegistrantIds.mockResolvedValue([upper.toLowerCase(), lower]);

    await service.dismissDuplicate(COUNCIL, ACTOR, upper, lower);

    expect(pnms.dismissDuplicate).toHaveBeenCalledWith(
      COUNCIL,
      lower,
      upper.toLowerCase(),
      ACTOR,
    );
  });

  it.each([
    ['already_merged', ConflictException, 'pnm.already_merged'],
    ['two_accounts', ConflictException, 'pnm.two_accounts'],
    ['not_found', NotFoundException, 'pnm.not_found'],
  ])('maps a %s merge refusal', async (reason, Exception, code) => {
    const { service, pnms } = setup();
    pnms.merge.mockResolvedValue({ ok: false, reason });

    const error = await service
      .merge(COUNCIL, ACTOR, 'pnm-1', 'pnm-2')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Exception);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
  });

  it('merges through the database function with the acting council', async () => {
    const { service, pnms } = setup();
    pnms.merge.mockResolvedValue({
      ok: true,
      survivor_id: 'pnm-1',
      candidate_conflicts: 0,
    });

    await expect(
      service.merge(COUNCIL, ACTOR, 'pnm-1', 'pnm-2'),
    ).resolves.toEqual({ survivor_id: 'pnm-1', candidate_conflicts: 0 });
    expect(pnms.merge).toHaveBeenCalledWith(COUNCIL, 'pnm-1', 'pnm-2', ACTOR);
  });

  it('an unverified council merges nothing', async () => {
    const { service, chapters, pnms } = setup();
    chapters.findById.mockResolvedValue(council({ council_verified_at: null }));

    await expect(
      service.merge(COUNCIL, ACTOR, 'pnm-1', 'pnm-2'),
    ).rejects.toThrow(NotFoundException);
    expect(pnms.merge).not.toHaveBeenCalled();
  });
});

describe('PnmService — seasons', () => {
  it('creates a season with the 180-day default, and refuses a duplicate term', async () => {
    const { service, pnms } = setup();
    pnms.createSeason.mockResolvedValueOnce(season('planned'));

    await service.createSeason(COUNCIL, {
      term: '  Spring   2027 ',
      opens_at: '2027-01-10T00:00:00Z',
      closes_at: '2027-02-10T00:00:00Z',
    });

    expect(pnms.createSeason).toHaveBeenCalledWith(
      expect.objectContaining({
        council_id: COUNCIL,
        term: TERM,
        pnm_retention_days: 180,
        status: 'planned',
      }),
    );

    pnms.createSeason.mockResolvedValueOnce(null);
    await expect(
      service.createSeason(COUNCIL, {
        term: TERM,
        opens_at: '2027-01-10T00:00:00Z',
        closes_at: '2027-02-10T00:00:00Z',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("opening a season pushes each accepted chapter's form PNMs up, once (#5977)", async () => {
    const { service, pnms, interestForms } = setup();
    pnms.findSeason.mockResolvedValueOnce(season('planned'));
    pnms.updateSeason.mockResolvedValueOnce(season('open'));
    await service.updateSeason(COUNCIL, TERM, { status: 'open' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(interestForms.pushUpChapter.mock.calls.map(([id]) => id)).toEqual([
      CH_A,
      CH_B,
    ]);

    // Saving an already-open season again pushes nothing.
    interestForms.pushUpChapter.mockClear();
    pnms.findSeason.mockResolvedValueOnce(season('open'));
    pnms.updateSeason.mockResolvedValueOnce(season('open'));
    await service.updateSeason(COUNCIL, TERM, { status: 'open' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(interestForms.pushUpChapter).not.toHaveBeenCalled();
  });

  it('refuses a season that closes before it opens', async () => {
    const { service } = setup();

    await expect(
      service.createSeason(COUNCIL, {
        term: TERM,
        opens_at: '2027-02-10T00:00:00Z',
        closes_at: '2027-01-10T00:00:00Z',
      }),
    ).rejects.toThrow('ends after it opens');
  });
});

describe('PnmService — a chapter reading a PNM', () => {
  it('serves a linked PNM, with the phone only when shared', async () => {
    const { service, pnms } = setup();

    const hidden = await service.getForChapter(CH_A, 'pnm-1');
    expect(hidden.phone).toBeNull();
    expect(pnms.isLinkedToChapter).toHaveBeenCalledWith(CH_A, 'pnm-1');

    pnms.findLivePnm.mockResolvedValue(pnm({ phone_shared: true }));
    const shared = await service.getForChapter(CH_A, 'pnm-1');
    expect(shared.phone).toBe('5550001111');
  });

  it('a PNM not linked to the chapter is 404, not 403 (§ 4.2 rule 4)', async () => {
    const { service, pnms } = setup();
    pnms.isLinkedToChapter.mockResolvedValue(false);

    await expect(service.getForChapter(CH_A, 'pnm-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
