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
import type { RushCandidate } from '#domain/entities/rush-candidate.entity';
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

  const baseCandidate: RushCandidate = {
    id: 'cand-1',
    chapter_id: CHAPTER,
    display_name: 'Jane Doe',
    name_key: 'jane doe',
    user_id: null,
    stage: 'new',
    closed_reason: null,
    bid_status: 'none',
    created_by: 'user-1',
    created_at: '2026-09-10T00:00:00.000Z',
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
    };
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
        baseCandidate,
        { ...baseCandidate, id: 'cand-2', display_name: 'Sam Roe' },
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
      candidateRepo.findById.mockResolvedValue(null);
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
      candidateRepo.findById.mockResolvedValue({
        ...baseCandidate,
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
});
