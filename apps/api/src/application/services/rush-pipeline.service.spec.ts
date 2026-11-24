import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DEFAULT_RUSH_STAGES, RUSH_NOTE_MAX } from '@repo/validation';
import type { RushStageCategory } from '@repo/validation';
import {
  RushPipelineService,
  type RushStageInput,
} from './rush-pipeline.service';
import { RUSH_PIPELINE_REPOSITORY } from '#domain/repositories/rush-pipeline.repository.interface';
import type { IRushPipelineRepository } from '#domain/repositories/rush-pipeline.repository.interface';
import { RUSH_CANDIDATE_REPOSITORY } from '#domain/repositories/rush-candidate.repository.interface';
import type { IRushCandidateRepository } from '#domain/repositories/rush-candidate.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import type {
  RushCandidate,
  RushCandidateRow,
} from '#domain/entities/rush-candidate.entity';
import { RbacService } from './rbac.service';
import { RUSH_BID_REPOSITORY } from '#domain/repositories/rush-bid.repository.interface';
import type {
  RushCandidateNote,
  RushStage,
  RushTag,
} from '#domain/entities/rush-pipeline.entity';
import { PG_UNIQUE_VIOLATION } from '#domain/constants/postgres-error-codes';

const CHAPTER = 'ch-1';
const VIEWER = 'viewer-1';

const stageRow = (
  key: string,
  label: string,
  category: RushStageCategory,
  position: number,
  hidden = false,
): RushStage => ({
  id: `st-${key}`,
  chapter_id: CHAPTER,
  key,
  label,
  category,
  position,
  hidden,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
});

/** The six defaults as stored rows, ids `st-<key>`. */
const defaultRows = (): RushStage[] =>
  DEFAULT_RUSH_STAGES.map((s, i) => stageRow(s.key, s.label, s.category, i));

/** The stored rows as the editor sends them back. */
const asInput = (rows: readonly RushStage[]): RushStageInput[] =>
  rows.map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category,
    hidden: row.hidden,
  }));

const tag = (id: string, label: string): RushTag => ({
  id,
  chapter_id: CHAPTER,
  label,
  created_at: '2026-09-01T00:00:00.000Z',
});

const note = (
  overrides: Partial<RushCandidateNote> = {},
): RushCandidateNote => ({
  id: 'note-1',
  candidate_id: 'cand-1',
  chapter_id: CHAPTER,
  author_id: 'author-1',
  body: 'Great conversation',
  created_at: '2026-09-02T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  ...overrides,
});

describe('RushPipelineService', () => {
  let service: RushPipelineService;
  let pipelineRepo: jest.Mocked<IRushPipelineRepository>;
  let candidateRepo: jest.Mocked<Pick<IRushCandidateRepository, 'findById'>>;
  let userRepo: jest.Mocked<Pick<IUserRepository, 'findByIds'>>;
  let rbac: jest.Mocked<Pick<RbacService, 'memberHasAnyPermission'>>;

  const baseCandidate: RushCandidate = {
    id: 'cand-1',
    chapter_id: CHAPTER,
    display_name: 'Jane Doe',
    name_key: 'jane doe',
    user_id: null,
    stage: 'new',
    closed_reason: null,
    bid_status: 'none',
    bid_state: 'none',
    created_by: 'user-1',
    created_at: '2026-09-10T00:00:00.000Z',
  };

  /** The same candidate as the pipeline's own reads return it. */
  const baseRow: RushCandidateRow = {
    ...baseCandidate,
    owner_id: null,
    last_contact_on: null,
    last_contact_by: null,
    follow_up_on: null,
    follow_up_note: null,
    follow_up_user_id: null,
    bid_extended_at: null,
    bid_extended_by: null,
    bid_expires_at: null,
    bid_acceptance_recorded_at: null,
    bid_acceptance_recorded_by: null,
    bid_answered_at: null,
    bid_answered_by: null,
    bid_answered_via: null,
    bid_rescind_reason: null,
  };

  beforeEach(async () => {
    pipelineRepo = {
      listStages: jest.fn().mockResolvedValue(defaultRows()),
      insertStagesIfMissing: jest.fn().mockResolvedValue(undefined),
      saveStages: jest.fn(),
      listCandidates: jest.fn().mockResolvedValue([]),
      setCandidateStage: jest
        .fn()
        .mockImplementation((id, _ch, stage, closed_reason) =>
          Promise.resolve({ ...baseCandidate, id, stage, closed_reason }),
        ),
      listTags: jest.fn().mockResolvedValue([]),
      findTag: jest.fn().mockResolvedValue(null),
      createTag: jest.fn(),
      renameTag: jest.fn(),
      deleteTag: jest.fn().mockResolvedValue(undefined),
      listCandidateTags: jest.fn().mockResolvedValue([]),
      setCandidateTags: jest.fn().mockResolvedValue(undefined),
      listRatings: jest.fn().mockResolvedValue([]),
      upsertRating: jest.fn().mockResolvedValue(undefined),
      listVotes: jest.fn().mockResolvedValue([]),
      listNotes: jest.fn().mockResolvedValue([]),
      findNote: jest.fn().mockResolvedValue(null),
      createNote: jest
        .fn()
        .mockImplementation((candidate_id, chapter_id, author_id, body) =>
          Promise.resolve(note({ candidate_id, chapter_id, author_id, body })),
        ),
      updateNote: jest
        .fn()
        .mockImplementation((id, _ch, body) =>
          Promise.resolve(note({ id, body })),
        ),
      deleteNote: jest.fn().mockResolvedValue(undefined),
      findCandidate: jest.fn().mockResolvedValue(baseRow),
      listContacts: jest.fn().mockResolvedValue([]),
      createContact: jest.fn().mockImplementation((input) =>
        Promise.resolve({
          id: 'contact-1',
          candidate_id: input.candidateId,
          chapter_id: input.chapterId,
          logged_by: input.loggedBy,
          kind: input.kind,
          contacted_on: input.contactedOn,
          note: input.note,
          created_at: '2026-11-24T15:00:00.000Z',
        }),
      ),
      advanceLastContact: jest.fn().mockResolvedValue(undefined),
      setOwner: jest
        .fn()
        .mockImplementation((id, _ch, owner_id) =>
          Promise.resolve({ ...baseRow, id, owner_id }),
        ),
      setFollowUp: jest.fn().mockImplementation((id, _ch, followUp) =>
        Promise.resolve({
          ...baseRow,
          id,
          follow_up_on: followUp?.on ?? null,
          follow_up_note: followUp?.note ?? null,
          follow_up_user_id: followUp?.userId ?? null,
        }),
      ),
      findSettings: jest.fn().mockResolvedValue(null),
      saveSettings: jest.fn(),
    };
    rbac = { memberHasAnyPermission: jest.fn().mockResolvedValue(true) };
    candidateRepo = {
      findById: jest.fn().mockResolvedValue(baseCandidate),
    };
    userRepo = {
      findByIds: jest.fn().mockResolvedValue([
        { id: 'user-1', display_name: 'Alice Member' },
        { id: 'author-1', display_name: 'Ana Author' },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RushPipelineService,
        { provide: RUSH_PIPELINE_REPOSITORY, useValue: pipelineRepo },
        { provide: RUSH_CANDIDATE_REPOSITORY, useValue: candidateRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: RbacService, useValue: rbac },
        {
          provide: RUSH_BID_REPOSITORY,
          useValue: {
            candidatesWithConfirmationEmail: jest
              .fn()
              .mockResolvedValue(new Set()),
          },
        },
      ],
    }).compile();

    service = module.get(RushPipelineService);
  });

  describe('listStages', () => {
    it('writes the six defaults when the chapter has none', async () => {
      pipelineRepo.listStages
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(defaultRows().reverse());

      const stages = await service.listStages(CHAPTER);

      expect(pipelineRepo.insertStagesIfMissing).toHaveBeenCalledWith(
        CHAPTER,
        [
          { key: 'new', label: 'New', category: 'new', position: 0 },
          {
            key: 'contacted',
            label: 'Contacted',
            category: 'contacted',
            position: 1,
          },
          { key: 'met', label: 'Met', category: 'met', position: 2 },
          {
            key: 'engaged',
            label: 'Engaged',
            category: 'engaged',
            position: 3,
          },
          {
            key: 'bid_ready',
            label: 'Bid ready',
            category: 'bid_ready',
            position: 4,
          },
          { key: 'closed', label: 'Closed', category: 'closed', position: 5 },
        ].map((stage) => ({ ...stage, hidden: false })),
      );
      expect(stages.map((s) => s.key)).toEqual([
        'new',
        'contacted',
        'met',
        'engaged',
        'bid_ready',
        'closed',
      ]);
    });

    it('writes nothing when stages exist, and sorts by category then position', async () => {
      pipelineRepo.listStages.mockResolvedValue([
        stageRow('closed', 'Closed', 'closed', 0),
        stageRow('s_lead', 'Lead', 'new', 7),
        stageRow('met', 'Met', 'met', 1),
        stageRow('new', 'New', 'new', 3),
      ]);

      const stages = await service.listStages(CHAPTER);

      expect(pipelineRepo.insertStagesIfMissing).not.toHaveBeenCalled();
      expect(stages.map((s) => s.key)).toEqual([
        'new',
        's_lead',
        'met',
        'closed',
      ]);
    });
  });

  describe('stageForNewCandidate', () => {
    it('picks the first visible New-category stage', async () => {
      pipelineRepo.listStages.mockResolvedValue([
        stageRow('new', 'New', 'new', 0, true),
        stageRow('s_lead', 'Lead', 'new', 1),
        stageRow('contacted', 'Contacted', 'contacted', 2),
        stageRow('closed', 'Closed', 'closed', 3),
      ]);

      await expect(service.stageForNewCandidate(CHAPTER)).resolves.toBe(
        's_lead',
      );
    });
  });

  describe('saveStages', () => {
    const rejectsWith = async (input: RushStageInput[], message: RegExp) => {
      await expect(service.saveStages(CHAPTER, input)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.saveStages(CHAPTER, input)).rejects.toThrow(message);
      expect(pipelineRepo.saveStages).not.toHaveBeenCalled();
    };

    it('refuses a list that leaves an existing stage out', async () => {
      const input = asInput(defaultRows()).filter((s) => s.id !== 'st-met');
      await rejectsWith(input, /hidden but not removed/);
    });

    it('refuses to move an existing stage to another category', async () => {
      const input = asInput(defaultRows()).map((s) =>
        s.id === 'st-contacted' ? { ...s, category: 'met' as const } : s,
      );
      await rejectsWith(input, /can't move to another category/);
    });

    it("refuses an id that isn't this chapter's", async () => {
      const input = [
        ...asInput(defaultRows()),
        {
          id: 'st-other-chapter',
          label: 'Theirs',
          category: 'met' as const,
          hidden: false,
        },
      ];
      await rejectsWith(input, /not this chapter/);
    });

    it('refuses the same stage twice', async () => {
      const input = [
        ...asInput(defaultRows()),
        {
          id: 'st-met',
          label: 'Met again',
          category: 'met' as const,
          hidden: false,
        },
      ];
      await rejectsWith(input, /in the list twice/);
    });

    it.each(['new', 'closed'] as const)(
      'refuses %s with no visible stage',
      async (category) => {
        const input = asInput(defaultRows()).map((s) =>
          s.category === category ? { ...s, hidden: true } : s,
        );
        await rejectsWith(input, /at least one stage that isn't hidden/);
      },
    );

    it('refuses two stages with the same name', async () => {
      const input = [
        ...asInput(defaultRows()),
        { label: 'met', category: 'engaged' as const, hidden: false },
      ];
      await rejectsWith(input, /Two stages are named/);
    });

    it('renames, reorders, hides and adds, keeping existing keys', async () => {
      const saved = [stageRow('new', 'New', 'new', 0)];
      pipelineRepo.saveStages.mockResolvedValue(saved);
      const rows = defaultRows();
      const input: RushStageInput[] = [
        { label: '  Lead  ', category: 'new', hidden: false },
        ...asInput(rows).map((s) => {
          if (s.id === 'st-met') return { ...s, label: 'Coffee chat' };
          if (s.id === 'st-engaged') return { ...s, hidden: true };
          return s;
        }),
      ];
      // Swap contacted and met.
      [input[2], input[3]] = [input[3], input[2]];

      const result = await service.saveStages(CHAPTER, input);

      expect(result).toEqual(saved);
      const [chapterId, writes] = pipelineRepo.saveStages.mock.calls[0];
      expect(chapterId).toBe(CHAPTER);
      expect(writes).toHaveLength(7);
      expect(writes[0]).toEqual({
        id: undefined,
        key: expect.stringMatching(/^s_[0-9a-f]{12}$/),
        label: 'Lead',
        category: 'new',
        position: 0,
        hidden: false,
      });
      expect(writes.slice(1)).toEqual([
        {
          id: 'st-new',
          key: 'new',
          label: 'New',
          category: 'new',
          position: 1,
          hidden: false,
        },
        {
          id: 'st-met',
          key: 'met',
          label: 'Coffee chat',
          category: 'met',
          position: 2,
          hidden: false,
        },
        {
          id: 'st-contacted',
          key: 'contacted',
          label: 'Contacted',
          category: 'contacted',
          position: 3,
          hidden: false,
        },
        {
          id: 'st-engaged',
          key: 'engaged',
          label: 'Engaged',
          category: 'engaged',
          position: 4,
          hidden: true,
        },
        {
          id: 'st-bid_ready',
          key: 'bid_ready',
          label: 'Bid ready',
          category: 'bid_ready',
          position: 5,
          hidden: false,
        },
        {
          id: 'st-closed',
          key: 'closed',
          label: 'Closed',
          category: 'closed',
          position: 6,
          hidden: false,
        },
      ]);
    });

    it('gives each new stage its own key', async () => {
      pipelineRepo.saveStages.mockResolvedValue([]);
      await service.saveStages(CHAPTER, [
        ...asInput(defaultRows()),
        { label: 'Lunch', category: 'met', hidden: false },
        { label: 'Dinner', category: 'met', hidden: false },
      ]);
      const writes = pipelineRepo.saveStages.mock.calls[0][1];
      const added = writes.filter((w) => !w.id).map((w) => w.key);
      expect(added).toHaveLength(2);
      expect(new Set(added).size).toBe(2);
    });
  });

  describe('getPipeline', () => {
    const OTHER = 'other-rater';
    const VOTER = 'other-voter';

    beforeEach(() => {
      pipelineRepo.listCandidates.mockResolvedValue([
        baseRow,
        { ...baseRow, id: 'cand-2', display_name: 'Sam Roe' },
      ]);
      pipelineRepo.listTags.mockResolvedValue([tag('t1', 'Legacy')]);
      pipelineRepo.listCandidateTags.mockResolvedValue([
        {
          candidate_id: 'cand-1',
          tag_id: 't1',
          chapter_id: CHAPTER,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ]);
      pipelineRepo.listRatings.mockResolvedValue(
        [
          [VIEWER, 4],
          [OTHER, 3],
        ].map(([rater_id, rating]) => ({
          candidate_id: 'cand-1',
          chapter_id: CHAPTER,
          rater_id: rater_id as string,
          rating: rating as number,
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        })),
      );
      pipelineRepo.listVotes.mockResolvedValue([
        { candidate_id: 'cand-1', voter_id: VIEWER },
        { candidate_id: 'cand-1', voter_id: VOTER },
      ]);
    });

    it('leaves results out for a viewer without rush:view_results', async () => {
      const pipeline = await service.getPipeline(CHAPTER, {
        id: VIEWER,
        canViewResults: Promise.resolve(false),
      });

      expect(pipeline.tags).toEqual([tag('t1', 'Legacy')]);
      const [first, second] = pipeline.candidates;
      for (const candidate of pipeline.candidates) {
        expect(candidate).not.toHaveProperty('rating_average');
        expect(candidate).not.toHaveProperty('rating_count');
        expect(candidate).not.toHaveProperty('vote_count');
      }
      expect(first).toMatchObject({
        id: 'cand-1',
        tag_ids: ['t1'],
        created_by_name: 'Alice Member',
        viewer_rating: 4,
        viewer_has_voted: true,
      });
      expect(second).toMatchObject({
        id: 'cand-2',
        tag_ids: [],
        viewer_rating: null,
        viewer_has_voted: false,
      });
    });

    it('includes results for a viewer with rush:view_results', async () => {
      const pipeline = await service.getPipeline(CHAPTER, {
        id: VIEWER,
        canViewResults: Promise.resolve(true),
      });

      const [first, second] = pipeline.candidates;
      expect(first).toMatchObject({
        rating_average: 3.5,
        rating_count: 2,
        vote_count: 2,
        viewer_rating: 4,
        viewer_has_voted: true,
      });
      expect(second).toMatchObject({
        rating_average: null,
        rating_count: 0,
        vote_count: 0,
        viewer_rating: null,
        viewer_has_voted: false,
      });
    });

    it.each([true, false])(
      'never exposes rater or voter ids (results=%s)',
      async (canViewResults) => {
        const pipeline = await service.getPipeline(CHAPTER, {
          id: VIEWER,
          canViewResults: Promise.resolve(canViewResults),
        });
        const wire = JSON.stringify(pipeline);
        expect(wire).not.toContain(OTHER);
        expect(wire).not.toContain(VOTER);
        expect(wire).not.toContain(VIEWER);
        expect(wire).not.toContain('rater_id');
        expect(wire).not.toContain('voter_id');
      },
    );
  });

  describe('moveStage', () => {
    beforeEach(() => {
      pipelineRepo.listStages.mockResolvedValue([
        stageRow('new', 'New', 'new', 0),
        stageRow('contacted', 'Contacted', 'contacted', 1),
        stageRow('met', 'Met', 'met', 2, true),
        stageRow('closed', 'Closed', 'closed', 3),
      ]);
    });

    it('404s for an unknown candidate', async () => {
      pipelineRepo.findCandidate.mockResolvedValue(null);
      await expect(
        service.moveStage('cand-x', CHAPTER, 'contacted', undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pipelineRepo.setCandidateStage).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown stage', 's_nope', undefined],
      ['a hidden stage', 'met', undefined],
      ['Closed without a reason', 'closed', undefined],
      ['Closed with an automatic reason', 'closed', 'withdrew'],
      ['Closed with a made-up reason', 'closed', 'bored'],
      ['a reason on a working stage', 'contacted', 'not_interested'],
    ])('refuses %s', async (_case, stage, reason) => {
      await expect(
        service.moveStage('cand-1', CHAPTER, stage, reason),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pipelineRepo.setCandidateStage).not.toHaveBeenCalled();
    });

    it('stores the reason on a move to Closed', async () => {
      const moved = await service.moveStage(
        'cand-1',
        CHAPTER,
        'closed',
        'chapter_passed',
      );
      expect(pipelineRepo.setCandidateStage).toHaveBeenCalledWith(
        'cand-1',
        CHAPTER,
        'closed',
        'chapter_passed',
      );
      expect(moved).toMatchObject({
        stage: 'closed',
        closed_reason: 'chapter_passed',
      });
    });

    it('clears the reason on a move out of Closed', async () => {
      pipelineRepo.findCandidate.mockResolvedValue({
        ...baseRow,
        stage: 'closed',
        closed_reason: 'no_response',
      });
      await service.moveStage('cand-1', CHAPTER, 'contacted', undefined);
      expect(pipelineRepo.setCandidateStage).toHaveBeenCalledWith(
        'cand-1',
        CHAPTER,
        'contacted',
        null,
      );
    });

    it('takes an explicit null reason on a working stage as none', async () => {
      await service.moveStage('cand-1', CHAPTER, 'contacted', null);
      expect(pipelineRepo.setCandidateStage).toHaveBeenCalledWith(
        'cand-1',
        CHAPTER,
        'contacted',
        null,
      );
    });
  });

  describe('tags', () => {
    it('creates a trimmed tag', async () => {
      pipelineRepo.createTag.mockResolvedValue(tag('t1', 'Legacy'));
      await service.createTag(CHAPTER, '  Legacy ');
      expect(pipelineRepo.createTag).toHaveBeenCalledWith(CHAPTER, 'Legacy');
    });

    it('refuses a blank tag name', async () => {
      await expect(service.createTag(CHAPTER, '   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(pipelineRepo.createTag).not.toHaveBeenCalled();
    });

    it('maps a unique violation on create to 409', async () => {
      pipelineRepo.createTag.mockRejectedValue({ code: PG_UNIQUE_VIOLATION });
      await expect(service.createTag(CHAPTER, 'Legacy')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('maps a unique violation on rename to 409', async () => {
      pipelineRepo.findTag.mockResolvedValue(tag('t1', 'Legacy'));
      pipelineRepo.renameTag.mockRejectedValue({ code: PG_UNIQUE_VIOLATION });
      await expect(
        service.renameTag('t1', CHAPTER, 'Athlete'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s renaming or deleting an unknown tag', async () => {
      await expect(
        service.renameTag('t-x', CHAPTER, 'Athlete'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteTag('t-x', CHAPTER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(pipelineRepo.findTag).toHaveBeenCalledWith('t-x', CHAPTER);
      expect(pipelineRepo.renameTag).not.toHaveBeenCalled();
      expect(pipelineRepo.deleteTag).not.toHaveBeenCalled();
    });

    it('deletes a known tag', async () => {
      pipelineRepo.findTag.mockResolvedValue(tag('t1', 'Legacy'));
      await service.deleteTag('t1', CHAPTER);
      expect(pipelineRepo.deleteTag).toHaveBeenCalledWith('t1', CHAPTER);
    });

    it("refuses a candidate tag that isn't the chapter's", async () => {
      pipelineRepo.listTags.mockResolvedValue([tag('t1', 'Legacy')]);
      await expect(
        service.setCandidateTags('cand-1', CHAPTER, ['t1', 't-foreign']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pipelineRepo.setCandidateTags).not.toHaveBeenCalled();
    });

    it("de-duplicates a candidate's tags", async () => {
      pipelineRepo.listTags.mockResolvedValue([
        tag('t1', 'Legacy'),
        tag('t2', 'Athlete'),
      ]);
      await expect(
        service.setCandidateTags('cand-1', CHAPTER, ['t1', 't2', 't1']),
      ).resolves.toEqual(['t1', 't2']);
      expect(pipelineRepo.setCandidateTags).toHaveBeenCalledWith(
        'cand-1',
        CHAPTER,
        ['t1', 't2'],
      );
    });

    it('404s tagging an unknown candidate', async () => {
      candidateRepo.findById.mockResolvedValue(null);
      await expect(
        service.setCandidateTags('cand-x', CHAPTER, []),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rate', () => {
    it.each([0, 6, 2.5])('refuses %s', async (rating) => {
      await expect(
        service.rate('cand-1', CHAPTER, VIEWER, rating),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pipelineRepo.upsertRating).not.toHaveBeenCalled();
    });

    it.each([1, 5])('stores %s', async (rating) => {
      await service.rate('cand-1', CHAPTER, VIEWER, rating);
      expect(pipelineRepo.upsertRating).toHaveBeenCalledWith(
        'cand-1',
        CHAPTER,
        VIEWER,
        rating,
      );
    });

    it('404s for an unknown candidate', async () => {
      candidateRepo.findById.mockResolvedValue(null);
      await expect(
        service.rate('cand-x', CHAPTER, VIEWER, 3),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('notes', () => {
    const own = () =>
      candidateRepo.findById.mockResolvedValue({
        ...baseCandidate,
        user_id: VIEWER,
      });

    it("lists notes with their authors' names", async () => {
      pipelineRepo.listNotes.mockResolvedValue([note()]);
      const notes = await service.listNotes('cand-1', CHAPTER, VIEWER);
      expect(pipelineRepo.listNotes).toHaveBeenCalledWith('cand-1', CHAPTER);
      expect(notes).toEqual([
        {
          id: 'note-1',
          candidate_id: 'cand-1',
          author_id: 'author-1',
          author_name: 'Ana Author',
          body: 'Great conversation',
          created_at: '2026-09-02T00:00:00.000Z',
          updated_at: '2026-09-02T00:00:00.000Z',
        },
      ]);
    });

    it("returns no notes on the viewer's own candidate, without reading them", async () => {
      own();
      await expect(
        service.listNotes('cand-1', CHAPTER, VIEWER),
      ).resolves.toEqual([]);
      expect(pipelineRepo.listNotes).not.toHaveBeenCalled();
    });

    it("refuses to add, edit or delete a note on the viewer's own candidate", async () => {
      own();
      pipelineRepo.findNote.mockResolvedValue(note({ author_id: VIEWER }));
      await expect(
        service.addNote('cand-1', CHAPTER, VIEWER, 'hi'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.editNote('note-1', 'cand-1', CHAPTER, VIEWER, 'hi'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.deleteNote('note-1', 'cand-1', CHAPTER, VIEWER, true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(pipelineRepo.createNote).not.toHaveBeenCalled();
      expect(pipelineRepo.updateNote).not.toHaveBeenCalled();
      expect(pipelineRepo.deleteNote).not.toHaveBeenCalled();
    });

    it('trims a note body', async () => {
      const view = await service.addNote(
        'cand-1',
        CHAPTER,
        'author-1',
        '  Great conversation \n',
      );
      expect(pipelineRepo.createNote).toHaveBeenCalledWith(
        'cand-1',
        CHAPTER,
        'author-1',
        'Great conversation',
      );
      expect(view).toMatchObject({
        body: 'Great conversation',
        author_name: 'Ana Author',
      });
    });

    it.each([
      ['blank', '   '],
      ['too long', 'x'.repeat(RUSH_NOTE_MAX + 1)],
    ])('refuses a %s note', async (_case, body) => {
      await expect(
        service.addNote('cand-1', CHAPTER, 'author-1', body),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pipelineRepo.createNote).not.toHaveBeenCalled();
    });

    it('accepts a note at the length cap', async () => {
      await service.addNote(
        'cand-1',
        CHAPTER,
        'author-1',
        `  ${'x'.repeat(RUSH_NOTE_MAX)}  `,
      );
      expect(pipelineRepo.createNote).toHaveBeenCalled();
    });

    it('lets the author edit their note, trimmed', async () => {
      pipelineRepo.findNote.mockResolvedValue(note());
      await service.editNote('note-1', 'cand-1', CHAPTER, 'author-1', ' New ');
      expect(pipelineRepo.findNote).toHaveBeenCalledWith(
        'note-1',
        'cand-1',
        CHAPTER,
      );
      expect(pipelineRepo.updateNote).toHaveBeenCalledWith(
        'note-1',
        CHAPTER,
        'New',
      );
    });

    it("refuses an edit from someone who isn't the author", async () => {
      pipelineRepo.findNote.mockResolvedValue(note());
      await expect(
        service.editNote('note-1', 'cand-1', CHAPTER, 'someone-else', 'x'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(pipelineRepo.updateNote).not.toHaveBeenCalled();
    });

    it('404s editing or deleting an unknown note', async () => {
      await expect(
        service.editNote('note-x', 'cand-1', CHAPTER, 'author-1', 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.deleteNote('note-x', 'cand-1', CHAPTER, 'author-1', true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['its author', 'author-1', false],
      ['a manager', 'manager-1', true],
    ])('lets %s delete a note', async (_case, viewerId, canManage) => {
      pipelineRepo.findNote.mockResolvedValue(note());
      await service.deleteNote(
        'note-1',
        'cand-1',
        CHAPTER,
        viewerId,
        canManage,
      );
      expect(pipelineRepo.deleteNote).toHaveBeenCalledWith('note-1', CHAPTER);
    });

    it('refuses a delete from a non-author without rush:manage', async () => {
      pipelineRepo.findNote.mockResolvedValue(note());
      await expect(
        service.deleteNote('note-1', 'cand-1', CHAPTER, 'someone-else', false),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(pipelineRepo.deleteNote).not.toHaveBeenCalled();
    });

    it('404s every note route for an unknown candidate', async () => {
      candidateRepo.findById.mockResolvedValue(null);
      await expect(
        service.listNotes('cand-x', CHAPTER, VIEWER),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.addNote('cand-x', CHAPTER, VIEWER, 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.editNote('note-1', 'cand-x', CHAPTER, VIEWER, 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.deleteNote('note-1', 'cand-x', CHAPTER, VIEWER, true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('contacts, owner, follow-ups and settings (#5934)', () => {
    const NOW = new Date('2026-11-24T15:00:00Z');

    it('puts the owner, last contact and follow-up on the pipeline, by name', async () => {
      pipelineRepo.listCandidates.mockResolvedValue([
        {
          ...baseRow,
          owner_id: 'author-1',
          last_contact_on: '2026-11-22',
          last_contact_by: 'user-1',
          follow_up_on: '2026-11-26',
          follow_up_note: 'Invite to house dinner',
          follow_up_user_id: 'author-1',
        },
      ]);
      pipelineRepo.findSettings.mockResolvedValue({
        chapter_id: CHAPTER,
        stale_days: 5,
        bid_expiry_days: 7,
        new_member_role_id: null,
        contacts_group_id: null,
        card_channel_id: null,
        updated_at: 'x',
      });

      const pipeline = await service.getPipeline(CHAPTER, {
        id: VIEWER,
        canViewResults: Promise.resolve(false),
      });

      expect(pipeline.stale_days).toBe(5);
      expect(pipeline.candidates[0]).toMatchObject({
        owner_id: 'author-1',
        owner_name: 'Ana Author',
        last_contact_on: '2026-11-22',
        last_contact_by_name: 'Alice Member',
        follow_up_on: '2026-11-26',
        follow_up_note: 'Invite to house dinner',
        follow_up_user_name: 'Ana Author',
      });
    });

    describe('logContact', () => {
      it('logs it, moves the last contact forward and clears the follow-up', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          stage: 'contacted',
          last_contact_on: '2026-11-20',
          follow_up_on: '2026-11-24',
          follow_up_user_id: 'user-1',
        });

        const contact = await service.logContact(
          'cand-1',
          CHAPTER,
          'user-1',
          { kind: 'text', contacted_on: '2026-11-24', note: '  ' },
          NOW,
        );

        expect(contact).toMatchObject({
          kind: 'text',
          contacted_on: '2026-11-24',
          note: null,
          logged_by_name: 'Alice Member',
        });
        expect(pipelineRepo.advanceLastContact).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          '2026-11-24',
          'user-1',
        );
        expect(pipelineRepo.setFollowUp).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          null,
        );
        // Not the first contact: no automatic move.
        expect(pipelineRepo.setCandidateStage).not.toHaveBeenCalled();
      });

      it('moves a New prospect to the first visible Contacted stage on the first contact', async () => {
        pipelineRepo.listStages.mockResolvedValue([
          stageRow('new', 'New', 'new', 0),
          stageRow('contacted', 'Contacted', 'contacted', 1, true),
          stageRow('s_reached', 'Reached out', 'contacted', 2),
          stageRow('closed', 'Closed', 'closed', 3),
        ]);

        await service.logContact(
          'cand-1',
          CHAPTER,
          'user-1',
          { kind: 'call', contacted_on: '2026-11-23' },
          NOW,
        );

        expect(pipelineRepo.setCandidateStage).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          's_reached',
          null,
        );
      });

      it('leaves a prospect past New where they are on the first contact', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          stage: 'met',
        });
        await service.logContact(
          'cand-1',
          CHAPTER,
          'user-1',
          { kind: 'in_person', contacted_on: '2026-11-24' },
          NOW,
        );
        expect(pipelineRepo.setCandidateStage).not.toHaveBeenCalled();
      });

      it.each([
        ['an unknown kind', { kind: 'pigeon', contacted_on: '2026-11-24' }],
        ['a future day', { kind: 'text', contacted_on: '2026-11-26' }],
        [
          'a day that does not exist',
          { kind: 'text', contacted_on: '2026-02-30' },
        ],
        ['a day long past', { kind: 'text', contacted_on: '2025-01-01' }],
        [
          'a long note',
          { kind: 'text', contacted_on: '2026-11-24', note: 'x'.repeat(501) },
        ],
      ])('refuses %s', async (_label, input) => {
        await expect(
          service.logContact('cand-1', CHAPTER, 'user-1', input, NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(pipelineRepo.createContact).not.toHaveBeenCalled();
      });

      it('refuses a contact with yourself', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          user_id: 'user-1',
        });
        await expect(
          service.logContact(
            'cand-1',
            CHAPTER,
            'user-1',
            { kind: 'text', contacted_on: '2026-11-24' },
            NOW,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('listContacts', () => {
      beforeEach(() => {
        pipelineRepo.listContacts.mockResolvedValue([
          {
            id: 'c1',
            candidate_id: 'cand-1',
            chapter_id: CHAPTER,
            logged_by: 'user-1',
            kind: 'text',
            contacted_on: '2026-11-22',
            note: 'Asked about the house',
            created_at: 'x',
          },
        ]);
      });

      it('shows the note only to a reader of notes', async () => {
        const [withNotes] = await service.listContacts('cand-1', CHAPTER, {
          id: VIEWER,
          canReadNotes: true,
        });
        expect(withNotes).toMatchObject({
          logged_by_name: 'Alice Member',
          note: 'Asked about the house',
        });

        const [without] = await service.listContacts('cand-1', CHAPTER, {
          id: VIEWER,
          canReadNotes: false,
        });
        expect(without).not.toHaveProperty('note');
      });

      it('never shows the note on a prospect linked to the reader', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          user_id: VIEWER,
        });
        const [row] = await service.listContacts('cand-1', CHAPTER, {
          id: VIEWER,
          canReadNotes: true,
        });
        expect(row).not.toHaveProperty('note');
      });
    });

    describe('setOwner', () => {
      it('lets a worker claim an unowned prospect, only while unowned', async () => {
        const result = await service.setOwner(
          'cand-1',
          CHAPTER,
          'author-1',
          'author-1',
          false,
        );
        expect(result).toEqual({
          id: 'cand-1',
          owner_id: 'author-1',
          owner_name: 'Ana Author',
        });
        expect(pipelineRepo.setOwner).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          'author-1',
          null,
        );
      });

      it('409s when someone claimed it first', async () => {
        pipelineRepo.setOwner.mockResolvedValue(null);
        await expect(
          service.setOwner('cand-1', CHAPTER, 'author-1', 'author-1', false),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('lets an owner let go, and refuses taking over without rush:manage', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          owner_id: 'author-1',
        });
        await service.setOwner('cand-1', CHAPTER, 'author-1', null, false);
        expect(pipelineRepo.setOwner).toHaveBeenLastCalledWith(
          'cand-1',
          CHAPTER,
          null,
          'author-1',
        );

        await expect(
          service.setOwner('cand-1', CHAPTER, 'user-1', 'user-1', false),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.setOwner('cand-1', CHAPTER, 'user-1', null, false),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('lets rush:manage assign anyone who can work prospects', async () => {
        await service.setOwner('cand-1', CHAPTER, 'chair', 'user-1', true);
        expect(pipelineRepo.setOwner).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          'user-1',
        );

        rbac.memberHasAnyPermission.mockResolvedValue(false);
        await expect(
          service.setOwner('cand-1', CHAPTER, 'chair', 'outsider', true),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(rbac.memberHasAnyPermission).toHaveBeenLastCalledWith(
          CHAPTER,
          'outsider',
          ['rush:add'],
        );
      });
    });

    describe('setFollowUp', () => {
      it('is for the owner by default', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          owner_id: 'author-1',
        });
        const result = await service.setFollowUp(
          'cand-1',
          CHAPTER,
          'user-1',
          { due_on: '2026-11-26', note: ' Invite to house dinner ' },
          NOW,
        );
        expect(result).toEqual({
          id: 'cand-1',
          follow_up_on: '2026-11-26',
          follow_up_note: 'Invite to house dinner',
          follow_up_user_id: 'author-1',
          follow_up_user_name: 'Ana Author',
        });
      });

      it('is for the caller on an unowned prospect', async () => {
        const result = await service.setFollowUp(
          'cand-1',
          CHAPTER,
          'user-1',
          { due_on: '2026-11-24' },
          NOW,
        );
        expect(result.follow_up_user_id).toBe('user-1');
        expect(result.follow_up_note).toBeNull();
      });

      it.each([
        ['a passed day', '2026-11-20'],
        ['a day too far ahead', '2027-11-24'],
        ['a malformed day', '11/26/2026'],
      ])('refuses %s', async (_label, due_on) => {
        await expect(
          service.setFollowUp('cand-1', CHAPTER, 'user-1', { due_on }, NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('refuses a closed prospect and a member who cannot work prospects', async () => {
        pipelineRepo.findCandidate.mockResolvedValueOnce({
          ...baseRow,
          stage: 'closed',
          closed_reason: 'no_response',
        });
        await expect(
          service.setFollowUp(
            'cand-1',
            CHAPTER,
            'user-1',
            { due_on: '2026-11-26' },
            NOW,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);

        rbac.memberHasAnyPermission.mockResolvedValue(false);
        await expect(
          service.setFollowUp(
            'cand-1',
            CHAPTER,
            'user-1',
            { due_on: '2026-11-26', for_user_id: 'outsider' },
            NOW,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(pipelineRepo.setFollowUp).not.toHaveBeenCalled();
      });

      it('clears it', async () => {
        const result = await service.clearFollowUp('cand-1', CHAPTER, 'user-1');
        expect(result.follow_up_on).toBeNull();
        expect(pipelineRepo.setFollowUp).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          null,
        );
      });
    });

    describe('review fixes', () => {
      it('refuses making a prospect their own owner', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          user_id: 'user-1',
        });
        await expect(
          service.setOwner('cand-1', CHAPTER, 'user-1', 'user-1', true),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(pipelineRepo.setOwner).not.toHaveBeenCalled();
      });

      it("moves the old owner's follow-up to the new owner, and leaves one for someone else", async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          owner_id: 'author-1',
          follow_up_on: '2026-11-26',
          follow_up_note: 'Dinner',
          follow_up_user_id: 'author-1',
        });
        await service.setOwner('cand-1', CHAPTER, 'chair', 'user-1', true);
        expect(pipelineRepo.setFollowUp).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          { on: '2026-11-26', note: 'Dinner', userId: 'user-1' },
        );

        pipelineRepo.setFollowUp.mockClear();
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          owner_id: 'author-1',
          follow_up_on: '2026-11-26',
          follow_up_user_id: 'someone-else',
        });
        await service.setOwner('cand-1', CHAPTER, 'chair', 'user-1', true);
        expect(pipelineRepo.setFollowUp).not.toHaveBeenCalled();
      });

      it('refuses a member setting or clearing a follow-up about themself', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          user_id: 'user-1',
        });
        await expect(
          service.setFollowUp(
            'cand-1',
            CHAPTER,
            'user-1',
            { due_on: '2026-11-26', for_user_id: 'author-1' },
            NOW,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.clearFollowUp('cand-1', CHAPTER, 'user-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(pipelineRepo.setFollowUp).not.toHaveBeenCalled();
      });

      it('refuses a follow-up for the prospect themself', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          user_id: 'linked',
        });
        await expect(
          service.setFollowUp(
            'cand-1',
            CHAPTER,
            'user-1',
            { due_on: '2026-11-26', for_user_id: 'linked' },
            NOW,
          ),
        ).rejects.toThrow("A follow-up can't be for the prospect themself");
      });

      it('falls back to whoever sets it when the owner can no longer work prospects', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          owner_id: 'gone',
        });
        rbac.memberHasAnyPermission.mockImplementation(
          async (_chapter: string, userId: string) => userId !== 'gone',
        );
        const result = await service.setFollowUp(
          'cand-1',
          CHAPTER,
          'user-1',
          { due_on: '2026-11-26' },
          NOW,
        );
        expect(result.follow_up_user_id).toBe('user-1');
      });

      it('moves a re-saved follow-up off a member who left', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          owner_id: 'author-1',
          follow_up_on: '2026-11-25',
          follow_up_user_id: 'gone',
        });
        rbac.memberHasAnyPermission.mockImplementation(
          async (_chapter: string, userId: string) => userId !== 'gone',
        );
        const result = await service.setFollowUp(
          'cand-1',
          CHAPTER,
          'user-1',
          { due_on: '2026-11-26', for_user_id: 'gone' },
          NOW,
        );
        expect(result.follow_up_user_id).toBe('author-1');
      });

      it('takes the edge days a member a calendar day off UTC can pick', async () => {
        // 9 PM Eastern on Nov 23 is Nov 24 UTC; the device offers Nov 23 − 120.
        await expect(
          service.logContact(
            'cand-1',
            CHAPTER,
            'user-1',
            { kind: 'text', contacted_on: '2026-07-26' },
            NOW,
          ),
        ).resolves.toBeDefined();
        // Morning in UTC+10 is a day ahead; the device offers its today + 180.
        await expect(
          service.setFollowUp(
            'cand-1',
            CHAPTER,
            'user-1',
            { due_on: '2027-05-24' },
            NOW,
          ),
        ).resolves.toBeDefined();
      });

      it('drops the follow-up when a prospect is closed', async () => {
        pipelineRepo.findCandidate.mockResolvedValue({
          ...baseRow,
          follow_up_on: '2026-11-26',
          follow_up_user_id: 'user-1',
        });
        await service.moveStage('cand-1', CHAPTER, 'closed', 'no_response');
        expect(pipelineRepo.setFollowUp).toHaveBeenCalledWith(
          'cand-1',
          CHAPTER,
          null,
        );
      });

      it('hides what to do on a prospect linked to the viewer', async () => {
        pipelineRepo.listCandidates.mockResolvedValue([
          { ...baseRow, user_id: VIEWER, follow_up_note: 'Ask about grades' },
          { ...baseRow, id: 'cand-2', follow_up_note: 'Dinner' },
        ]);
        const pipeline = await service.getPipeline(CHAPTER, {
          id: VIEWER,
          canViewResults: Promise.resolve(false),
        });
        expect(pipeline.candidates[0].follow_up_note).toBeNull();
        expect(pipeline.candidates[1].follow_up_note).toBe('Dinner');
      });
    });
  });
});
