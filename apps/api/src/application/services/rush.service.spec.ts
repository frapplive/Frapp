import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RushService } from './rush.service';
import { RUSH_CANDIDATE_REPOSITORY } from '#domain/repositories/rush-candidate.repository.interface';
import type { IRushCandidateRepository } from '#domain/repositories/rush-candidate.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import type { RushCandidate } from '#domain/entities/rush-candidate.entity';
import { ChatService } from './chat.service';
import { PG_UNIQUE_VIOLATION } from '#domain/constants/postgres-error-codes';

const sees = (id: string) => ({ id, canViewResults: Promise.resolve(true) });
const blind = (id: string) => ({
  id,
  canViewResults: Promise.resolve(false),
});

describe('RushService', () => {
  let service: RushService;
  let mockRushRepo: jest.Mocked<IRushCandidateRepository>;
  let mockUserRepo: jest.Mocked<Pick<IUserRepository, 'findByIds'>>;
  let mockChatService: jest.Mocked<Pick<ChatService, 'sendMessage'>>;

  const baseCandidate: RushCandidate = {
    id: 'cand-1',
    chapter_id: 'ch-1',
    display_name: 'Jane Doe',
    name_key: 'jane doe',
    user_id: null,
    stage: 'new',
    bid_status: 'none',
    created_by: 'user-1',
    created_at: '2026-09-10T00:00:00.000Z',
  };

  beforeEach(async () => {
    mockRushRepo = {
      findById: jest.fn(),
      findByNameKey: jest.fn(),
      create: jest.fn(),
      setBidExtended: jest.fn(),
      insertVote: jest.fn(),
      countVotes: jest.fn().mockResolvedValue(0),
      viewerHasVoted: jest.fn().mockResolvedValue(false),
    };
    mockUserRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue([{ id: 'user-1', display_name: 'Alice Member' }]),
    };
    mockChatService = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RushService,
        { provide: RUSH_CANDIDATE_REPOSITORY, useValue: mockRushRepo },
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compile();

    service = module.get(RushService);
  });

  describe('create', () => {
    it('trims the display name and persists stage new / bid none', async () => {
      mockRushRepo.create.mockResolvedValue(baseCandidate);

      const result = await service.create({
        chapter_id: 'ch-1',
        display_name: '  Jane Doe  ',
        created_by: 'user-1',
      });

      expect(mockRushRepo.create).toHaveBeenCalledWith({
        chapter_id: 'ch-1',
        display_name: 'Jane Doe',
        user_id: null,
        stage: 'new',
        bid_status: 'none',
        created_by: 'user-1',
      });
      expect(result).toEqual(baseCandidate);
      expect('card_posted' in result).toBe(false);
    });

    it('rejects a blank name', async () => {
      await expect(
        service.create({
          chapter_id: 'ch-1',
          display_name: '   ',
          created_by: 'user-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRushRepo.create).not.toHaveBeenCalled();
    });

    it('maps a unique-name violation to ConflictException', async () => {
      mockRushRepo.create.mockRejectedValue({ code: PG_UNIQUE_VIOLATION });

      await expect(
        service.create({
          chapter_id: 'ch-1',
          display_name: 'Jane Doe',
          created_by: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    describe('card_posted', () => {
      const chatInput = {
        chapter_id: 'ch-1',
        display_name: 'Jane Doe',
        created_by: 'user-1',
        channel_id: 'channel-1',
        client_message_id: 'cmid-1',
      };

      it('reports card_posted: true when the card posts', async () => {
        mockRushRepo.create.mockResolvedValue(baseCandidate);

        const result = await service.create(chatInput);

        expect(result).toEqual({ ...baseCandidate, card_posted: true });
        expect(mockChatService.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'rush',
            system_originated: true,
            client_message_id: 'cmid-1',
            payload: expect.objectContaining({
              candidate_id: 'cand-1',
              display_name: 'Jane Doe',
              added_by_name: 'Alice Member',
            }),
          }),
        );
      });

      it('reports card_posted: false when the card post throws without rolling back', async () => {
        mockRushRepo.create.mockResolvedValue(baseCandidate);
        mockChatService.sendMessage.mockRejectedValue(new Error('chat down'));

        const result = await service.create(chatInput);

        expect(result).toEqual({ ...baseCandidate, card_posted: false });
        expect(mockRushRepo.create).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('vote', () => {
    it('is idempotent — a duplicate vote still returns the view, not a conflict', async () => {
      mockRushRepo.findById.mockResolvedValue(baseCandidate);
      mockRushRepo.insertVote.mockResolvedValue('duplicate');
      mockRushRepo.countVotes.mockResolvedValue(1);
      mockRushRepo.viewerHasVoted.mockResolvedValue(true);

      const result = await service.vote('cand-1', 'ch-1', sees('user-2'));

      expect(result.vote_count).toBe(1);
      expect(result.viewer_has_voted).toBe(true);
    });

    it('404s when the candidate is missing', async () => {
      mockRushRepo.findById.mockResolvedValue(null);
      await expect(
        service.vote('missing', 'ch-1', sees('user-2')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRushRepo.insertVote).not.toHaveBeenCalled();
    });
  });

  describe('bid', () => {
    it('extends none → extended', async () => {
      mockRushRepo.findById.mockResolvedValue(baseCandidate);
      mockRushRepo.setBidExtended.mockResolvedValue({
        ...baseCandidate,
        bid_status: 'extended',
      });

      const result = await service.bid('cand-1', 'ch-1', sees('user-1'));

      expect(mockRushRepo.setBidExtended).toHaveBeenCalledWith(
        'cand-1',
        'ch-1',
      );
      expect(result.bid_status).toBe('extended');
    });

    it('is a no-op when already extended', async () => {
      mockRushRepo.findById.mockResolvedValue({
        ...baseCandidate,
        bid_status: 'extended',
      });

      const result = await service.bid('cand-1', 'ch-1', sees('user-1'));

      expect(mockRushRepo.setBidExtended).not.toHaveBeenCalled();
      expect(result.bid_status).toBe('extended');
    });
  });

  describe('findView', () => {
    it('never includes voter identities on the view', async () => {
      mockRushRepo.findById.mockResolvedValue(baseCandidate);
      mockRushRepo.countVotes.mockResolvedValue(3);
      mockRushRepo.viewerHasVoted.mockResolvedValue(false);

      const result = await service.findView('cand-1', 'ch-1', sees('user-1'));

      expect(result).toEqual({
        ...baseCandidate,
        vote_count: 3,
        viewer_has_voted: false,
      });
      expect(result).not.toHaveProperty('voters');
    });

    // `rush:view_results` (#4084): the count is left out, not zeroed, and
    // never counted; whether the viewer voted still comes back.
    it('leaves vote_count out for a viewer without rush:view_results', async () => {
      mockRushRepo.findById.mockResolvedValue(baseCandidate);
      mockRushRepo.viewerHasVoted.mockResolvedValue(true);

      const result = await service.findView('cand-1', 'ch-1', blind('user-1'));

      expect(result).toEqual({ ...baseCandidate, viewer_has_voted: true });
      expect(result).not.toHaveProperty('vote_count');
      expect(mockRushRepo.countVotes).not.toHaveBeenCalled();
    });
  });

  describe('vote and bid without rush:view_results', () => {
    it('a vote answers without the count', async () => {
      mockRushRepo.findById.mockResolvedValue(baseCandidate);
      mockRushRepo.insertVote.mockResolvedValue('inserted');
      mockRushRepo.viewerHasVoted.mockResolvedValue(true);

      const result = await service.vote('cand-1', 'ch-1', blind('user-2'));

      expect(mockRushRepo.insertVote).toHaveBeenCalledWith(
        'cand-1',
        'ch-1',
        'user-2',
      );
      expect(result).not.toHaveProperty('vote_count');
      expect(result.viewer_has_voted).toBe(true);
    });

    it('a bid answers without the count', async () => {
      mockRushRepo.findById.mockResolvedValue({
        ...baseCandidate,
        bid_status: 'extended',
      });
      mockRushRepo.viewerHasVoted.mockResolvedValue(false);

      const result = await service.bid('cand-1', 'ch-1', blind('user-1'));

      expect(result).not.toHaveProperty('vote_count');
      expect(mockRushRepo.countVotes).not.toHaveBeenCalled();
    });
  });

  describe('findViewByName', () => {
    it('404s when the name is unknown', async () => {
      mockRushRepo.findByNameKey.mockResolvedValue(null);
      await expect(
        service.findViewByName('ch-1', sees('user-1'), 'Nobody'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a blank name', async () => {
      await expect(
        service.findViewByName('ch-1', sees('user-1'), '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRushRepo.findByNameKey).not.toHaveBeenCalled();
    });
  });
});
