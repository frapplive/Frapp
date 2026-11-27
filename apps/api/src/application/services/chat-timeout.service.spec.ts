import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CHAT_TIMEOUT_NOTIFICATION_CATEGORY,
  CHAT_TIMEOUT_REFUSALS,
  ChatTimeoutService,
  stateOf,
  withoutChatTimeout,
} from './chat-timeout.service';
import type { IMemberRepository } from '#domain/repositories/member.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import type { Member } from '#domain/entities/member.entity';
import type { RbacService } from './rbac.service';
import type { ChapterAuditLogService } from './chapter-audit-log.service';
import type { NotificationService } from './notification.service';
import {
  CHAPTER_ID,
  MEMBER,
  USER,
  tieredChapterMembers,
  tieredRankContext,
} from '#test/helpers/tiered-chapter.fixture';

const NOW = Date.parse('2026-11-25T15:00:00.000Z');

/** Chat timeouts (#6006, spec/behavior/chat/README.md § Timeouts). */
describe('ChatTimeoutService', () => {
  let members: Member[];
  let memberRepo: {
    findById: jest.Mock;
    findByUserAndChapter: jest.Mock;
    update: jest.Mock;
    clearChatTimeout: jest.Mock;
  };
  let rbac: { getEffectivePermissions: jest.Mock; getRankContext: jest.Mock };
  let auditLog: { record: jest.Mock };
  let notifications: { notifyUser: jest.Mock };
  let service: ChatTimeoutService;

  const byId = (id: string) => members.find((m) => m.id === id) ?? null;

  beforeEach(() => {
    members = tieredChapterMembers();
    memberRepo = {
      findById: jest.fn(async (id: string) => byId(id)),
      findByUserAndChapter: jest.fn(
        async (userId: string) =>
          members.find((m) => m.user_id === userId) ?? null,
      ),
      update: jest.fn(async (id: string, data: Partial<Member>) => ({
        ...byId(id)!,
        ...data,
      })),
      clearChatTimeout: jest.fn(async (id: string) => ({
        ...byId(id)!,
        chat_timeout_until: null,
        chat_timeout_reason: null,
        chat_timeout_by: null,
      })),
    };
    rbac = {
      // Only the President holds `*` in the fixture.
      getEffectivePermissions: jest.fn(
        async (_chapter: string, userId: string) =>
          userId === USER.president ? ['*'] : ['members:view'],
      ),
      getRankContext: jest.fn(async (_chapter: string, userId: string) =>
        tieredRankContext(userId),
      ),
    };
    auditLog = { record: jest.fn() };
    notifications = { notifyUser: jest.fn() };
    const users = {
      findDisplayIdentitiesByIds: jest.fn(async () => [
        { id: USER.vicePresident, display_name: 'Moiz Steenhuis' },
      ]),
    } as unknown as IUserRepository;
    service = new ChatTimeoutService(
      memberRepo as unknown as IMemberRepository,
      users,
      rbac as unknown as RbacService,
      auditLog as unknown as ChapterAuditLogService,
      notifications as unknown as NotificationService,
    );
  });

  describe('the rank rule', () => {
    const refusal = (memberId: string, actor: string) =>
      service.refusalFor(byId(memberId)!, CHAPTER_ID, actor);

    it('lets an officer time out a member ranked below them', async () => {
      await expect(refusal(MEMBER.brother, USER.vicePresident)).resolves.toBe(
        null,
      );
    });

    it('refuses timing yourself out', async () => {
      await expect(
        refusal(MEMBER.vicePresident, USER.vicePresident),
      ).resolves.toBe(CHAT_TIMEOUT_REFUSALS.self);
    });

    it('refuses timing out the President, even for another `*` holder', async () => {
      await expect(refusal(MEMBER.president, USER.vicePresident)).resolves.toBe(
        CHAT_TIMEOUT_REFUSALS.wildcard,
      );
    });

    it('refuses a member at or above your rank', async () => {
      // The risk chair sits in the chairs tier, below the board.
      await expect(refusal(MEMBER.vicePresident, USER.riskChair)).resolves.toBe(
        CHAT_TIMEOUT_REFUSALS.outOfReach,
      );
    });

    it('lets the President time out anyone else', async () => {
      await expect(refusal(MEMBER.vicePresident, USER.president)).resolves.toBe(
        null,
      );
    });
  });

  describe('timeOut', () => {
    it('sets until when, records it and pushes the member', async () => {
      const result = await service.timeOut({
        chapterId: CHAPTER_ID,
        memberId: MEMBER.brother,
        actorUserId: USER.vicePresident,
        duration: '1h',
        reason: '  spamming #general ',
        now: NOW,
      });

      expect(memberRepo.update).toHaveBeenCalledWith(MEMBER.brother, {
        chat_timeout_until: '2026-11-25T16:00:00.000Z',
        chat_timeout_reason: 'spamming #general',
        chat_timeout_by: USER.vicePresident,
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'member_timed_out',
          targetId: MEMBER.brother,
          diff: expect.objectContaining({
            user_id: USER.brother,
            duration: '1 hour',
          }),
        }),
      );
      expect(notifications.notifyUser).toHaveBeenCalledWith(
        USER.brother,
        CHAPTER_ID,
        expect.objectContaining({
          title: 'Timed out for 1 hour',
          body: "Moiz Steenhuis timed you out of the chapter's channels. Reason: spamming #general",
          category: CHAT_TIMEOUT_NOTIFICATION_CATEGORY,
        }),
      );
      expect(result.member_id).toBe(MEMBER.brother);
    });

    it('keeps the reason out of the audit row, which Logs readers see', async () => {
      await service.timeOut({
        chapterId: CHAPTER_ID,
        memberId: MEMBER.brother,
        actorUserId: USER.vicePresident,
        duration: '1d',
        reason: 'spamming',
        now: NOW,
      });
      expect(auditLog.record.mock.calls[0][0].diff).not.toHaveProperty(
        'reason',
      );
    });

    it('counts the reason in code points, as the column does', async () => {
      // 200 "☺️" is 200 by the DTO's count and 400 by Postgres's.
      await expect(
        service.timeOut({
          chapterId: CHAPTER_ID,
          memberId: MEMBER.brother,
          actorUserId: USER.vicePresident,
          duration: '5m',
          reason: '\u263A\uFE0F'.repeat(200),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(memberRepo.update).not.toHaveBeenCalled();
    });

    it('writes nothing for a refused caller', async () => {
      await expect(
        service.timeOut({
          chapterId: CHAPTER_ID,
          memberId: MEMBER.vicePresident,
          actorUserId: USER.riskChair,
          duration: '5m',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(memberRepo.update).not.toHaveBeenCalled();
      expect(notifications.notifyUser).not.toHaveBeenCalled();
    });

    it('answers 404 for a member of another chapter', async () => {
      members = members.map((m) =>
        m.id === MEMBER.brother ? { ...m, chapter_id: 'elsewhere' } : m,
      );
      await expect(
        service.timeOut({
          chapterId: CHAPTER_ID,
          memberId: MEMBER.brother,
          actorUserId: USER.vicePresident,
          duration: '1d',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('keeps the timeout when the push fails', async () => {
      notifications.notifyUser.mockRejectedValue(new Error('push down'));
      await expect(
        service.timeOut({
          chapterId: CHAPTER_ID,
          memberId: MEMBER.brother,
          actorUserId: USER.vicePresident,
          duration: '1w',
          now: NOW,
        }),
      ).resolves.toMatchObject({ until: '2026-12-02T15:00:00.000Z' });
    });
  });

  describe('lift', () => {
    beforeEach(() => {
      members = members.map((m) =>
        m.id === MEMBER.brother
          ? { ...m, chat_timeout_until: '2026-11-25T15:40:00.000Z' }
          : m,
      );
    });

    it('clears a running timeout, records it and pushes the member', async () => {
      await expect(
        service.lift({
          chapterId: CHAPTER_ID,
          memberId: MEMBER.brother,
          actorUserId: USER.vicePresident,
          now: NOW,
        }),
      ).resolves.toEqual({
        member_id: MEMBER.brother,
        until: null,
        reason: null,
      });
      expect(memberRepo.clearChatTimeout).toHaveBeenCalledWith(
        MEMBER.brother,
        '2026-11-25T15:40:00.000Z',
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'member_timeout_lifted' }),
      );
      expect(notifications.notifyUser).toHaveBeenCalledWith(
        USER.brother,
        CHAPTER_ID,
        expect.objectContaining({ title: 'Timeout lifted' }),
      );
    });

    it('leaves one already over to the sweep', async () => {
      await service.lift({
        chapterId: CHAPTER_ID,
        memberId: MEMBER.brother,
        actorUserId: USER.vicePresident,
        now: Date.parse('2026-11-25T16:00:00.000Z'),
      });
      expect(memberRepo.clearChatTimeout).not.toHaveBeenCalled();
      expect(notifications.notifyUser).not.toHaveBeenCalled();
    });

    it('is under the same rank rule', async () => {
      members = members.map((m) =>
        m.id === MEMBER.vicePresident
          ? { ...m, chat_timeout_until: '2026-11-25T15:40:00.000Z' }
          : m,
      );
      await expect(
        service.lift({
          chapterId: CHAPTER_ID,
          memberId: MEMBER.vicePresident,
          actorUserId: USER.riskChair,
          now: NOW,
        }),
      ).rejects.toThrow(CHAT_TIMEOUT_REFUSALS.outOfReach);
    });
  });

  describe('stateOf', () => {
    it('reads a running timeout, and none once it has passed', () => {
      const row = {
        chat_timeout_until: '2026-11-25T15:40:00.000Z',
        chat_timeout_reason: 'spam',
      };
      expect(stateOf(row, NOW)).toEqual({
        until: '2026-11-25T15:40:00.000Z',
        reason: 'spam',
      });
      expect(stateOf(row, Date.parse('2026-11-25T15:40:00.000Z'))).toEqual({
        until: null,
        reason: null,
      });
      expect(stateOf(null, NOW)).toEqual({ until: null, reason: null });
    });
  });

  it('withoutChatTimeout keeps the rest of the row', () => {
    expect(
      withoutChatTimeout({
        id: 'm',
        chat_timeout_until: 'x',
        chat_timeout_reason: 'y',
        chat_timeout_by: 'z',
        // Nor whether they may ask for more time (#6096).
        extension_requests_blocked_at: 'b',
        extension_requests_restored_at: 'r',
      }),
    ).toEqual({ id: 'm' });
  });
});
