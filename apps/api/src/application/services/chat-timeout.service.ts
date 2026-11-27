import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CHAT_TIMEOUT_REASON_MAX,
  chatTimeoutDuration,
  isChatTimeoutActive,
  type ChatTimeoutDurationKey,
} from '@repo/validation';
import { MEMBER_REPOSITORY } from '#domain/repositories/member.repository.interface';
import type { IMemberRepository } from '#domain/repositories/member.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import type { Member } from '#domain/entities/member.entity';
import { ChapterAuditLogService } from './chapter-audit-log.service';
import { NotificationService } from './notification.service';
import { RbacService } from './rbac.service';
import { chatTimeoutBlock, memberHoldsWildcard } from './member-rank';
import { reportCaughtFailure } from '../../infrastructure/observability/report-caught-failure';

/**
 * The category a timeout push goes under. Not one of the member's
 * notification switches (`isNotificationCategoryKey`), so no switch silences
 * it: a member is always told they can't post, and when they can again.
 * Quiet hours still hold it to a silent push.
 */
export const CHAT_TIMEOUT_NOTIFICATION_CATEGORY = 'moderation';

/** What a member's own timeout reads as (`GET /v1/chat/timeout`). */
export interface ChatTimeoutState {
  /** Until when, or null for no timeout. */
  until: string | null;
  reason: string | null;
}

/** A member's timeout as an officer who can time out reads it. */
export interface MemberChatTimeout extends ChatTimeoutState {
  member_id: string;
}

const NO_TIMEOUT: ChatTimeoutState = { until: null, reason: null };

/** The officer-facing refusals, in the rank rule's order. */
export const CHAT_TIMEOUT_REFUSALS = {
  self: "You can't time yourself out.",
  wildcard: "You can't time out the President.",
  outOfReach: 'You can only time out members ranked below you.',
} as const;

/**
 * Chat timeouts (#6006, `spec/behavior/chat/README.md` § Timeouts; Discord's
 * Timeout is the model). An officer holding `members:timeout` stops a member
 * ranked below them from posting or reacting in the chapter's channels for
 * 5 minutes, an hour, a day or a week, and can lift it early. DMs and group
 * DMs are unaffected, and the member still reads everything.
 *
 * This service sets, lifts and reads a timeout. `ChannelAccessService`
 * enforces it on every channel write; `ChatTimeoutSweepService` clears one
 * whose time has passed and tells the member.
 */
@Injectable()
export class ChatTimeoutService {
  private readonly logger = new Logger(ChatTimeoutService.name);

  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly memberRepo: IMemberRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly rbac: RbacService,
    private readonly auditLog: ChapterAuditLogService,
    private readonly notifications: NotificationService,
  ) {}

  /** The caller's own timeout in this chapter, or none. */
  async mine(chapterId: string, userId: string): Promise<ChatTimeoutState> {
    const member = await this.memberRepo.findByUserAndChapter(
      userId,
      chapterId,
    );
    return stateOf(member);
  }

  /**
   * Time `memberId` out for `durationKey`, replacing any timeout they already
   * have (a longer or shorter one, as Discord does). The rank rule
   * ({@link assertCanModerate}) decides who; the route's guard is
   * `members:timeout`.
   */
  async timeOut(input: {
    chapterId: string;
    memberId: string;
    actorUserId: string;
    duration: ChatTimeoutDurationKey;
    reason?: string | null;
    now?: number;
  }): Promise<MemberChatTimeout> {
    const duration = chatTimeoutDuration(input.duration);
    if (!duration) throw new BadRequestException('Pick how long');
    const member = await this.memberInChapter(input.memberId, input.chapterId);
    await this.assertCanModerate(member, input.chapterId, input.actorUserId);

    const reason = input.reason?.trim() || null;
    // Counted in code points, as the column's check (`char_length`) counts:
    // the DTO's `MaxLength` discounts emoji variation selectors, so a reason
    // it lets through could still break the check (a 500, not this 400).
    if (reason && [...reason].length > CHAT_TIMEOUT_REASON_MAX) {
      throw new BadRequestException(
        `A reason can be at most ${CHAT_TIMEOUT_REASON_MAX} characters`,
      );
    }
    const until = new Date(
      (input.now ?? Date.now()) + duration.minutes * 60_000,
    ).toISOString();
    const updated = await this.memberRepo.update(member.id, {
      chat_timeout_until: until,
      chat_timeout_reason: reason,
      chat_timeout_by: input.actorUserId,
    });

    await this.auditLog.record({
      chapterId: input.chapterId,
      actorUserId: input.actorUserId,
      action: 'member_timed_out',
      targetType: 'member',
      targetId: member.id,
      // No reason: Logs is read by `chapter-config:view` holders who may not
      // be able to time out, and the reason is the member's and the
      // moderators' (`spec/behavior/chat/README.md` § Timeouts).
      diff: {
        user_id: member.user_id,
        duration: duration.label,
        until,
      },
    });

    const actor = await this.nameOf(input.actorUserId);
    await this.push(member, input.chapterId, {
      title: `Timed out for ${duration.label}`,
      body: `${actor} timed you out of the chapter's channels.${
        reason ? ` Reason: ${reason}` : ''
      }`,
    });

    return { member_id: member.id, ...stateOf(updated) };
  }

  /**
   * End `memberId`'s timeout early. Under the same rank rule as setting one,
   * so a member can't be let out by someone who couldn't have put them there.
   * Lifting a timeout that has already ended changes nothing and says so to
   * nobody.
   */
  async lift(input: {
    chapterId: string;
    memberId: string;
    actorUserId: string;
    now?: number;
  }): Promise<MemberChatTimeout> {
    const member = await this.memberInChapter(input.memberId, input.chapterId);
    await this.assertCanModerate(member, input.chapterId, input.actorUserId);

    const until = member.chat_timeout_until ?? null;
    // None, or one already over, which the sweep clears and announces.
    if (!until || !isChatTimeoutActive(until, input.now ?? Date.now())) {
      return { member_id: member.id, ...NO_TIMEOUT };
    }
    const cleared = await this.memberRepo.clearChatTimeout(member.id, until);
    // Already cleared or replaced by another officer: nothing to tell.
    if (!cleared) {
      return {
        member_id: member.id,
        ...stateOf(await this.memberRepo.findById(member.id)),
      };
    }

    await this.auditLog.record({
      chapterId: input.chapterId,
      actorUserId: input.actorUserId,
      action: 'member_timeout_lifted',
      targetType: 'member',
      targetId: member.id,
      diff: { user_id: member.user_id, until },
    });

    const actor = await this.nameOf(input.actorUserId);
    await this.push(member, input.chapterId, {
      title: 'Timeout lifted',
      body: `${actor} lifted your timeout. You can post in the chapter's channels again.`,
    });

    return { member_id: member.id, ...NO_TIMEOUT };
  }

  /**
   * Tell a member their timeout ran out. The sweep calls this once per
   * cleared row (`ChatTimeoutSweepService`).
   */
  async notifyEnded(member: Member): Promise<void> {
    await this.push(member, member.chapter_id, {
      title: 'Timeout over',
      body: "You can post and react in the chapter's channels again.",
    });
  }

  /**
   * Who may time out or lift `member`'s timeout, past the route's
   * `members:timeout` (#6006): never themselves, never a `*` holder (the
   * President), and only a member ranked below the caller, the rule removal
   * uses (`spec/behavior/rbac.md` § Rank). A caller with `*` outranks
   * everyone else.
   */
  async refusalFor(
    member: Member,
    chapterId: string,
    actorUserId: string,
  ): Promise<string | null> {
    if (member.user_id === actorUserId) return CHAT_TIMEOUT_REFUSALS.self;
    // The rank context holds every role in the chapter, so it answers whether
    // the member holds `*` too, with no read of their permissions.
    const context = await this.rbac.getRankContext(chapterId, actorUserId);
    switch (
      chatTimeoutBlock(
        member,
        actorUserId,
        memberHoldsWildcard(context, member),
        context,
      )
    ) {
      case 'self':
        return CHAT_TIMEOUT_REFUSALS.self;
      case 'wildcard':
        return CHAT_TIMEOUT_REFUSALS.wildcard;
      case 'out-of-reach':
        return CHAT_TIMEOUT_REFUSALS.outOfReach;
    }
    return null;
  }

  private async assertCanModerate(
    member: Member,
    chapterId: string,
    actorUserId: string,
  ): Promise<void> {
    const refusal = await this.refusalFor(member, chapterId, actorUserId);
    if (refusal) throw new ForbiddenException(refusal);
  }

  private async memberInChapter(
    memberId: string,
    chapterId: string,
  ): Promise<Member> {
    const member = await this.memberRepo.findById(memberId);
    if (!member || member.chapter_id !== chapterId) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  private async nameOf(userId: string): Promise<string> {
    try {
      const [identity] = await this.userRepo.findDisplayIdentitiesByIds([
        userId,
      ]);
      const name = identity?.display_name?.trim();
      return name || 'An officer';
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'chat-timeout-actor-name',
        message: `Could not read the name of ${userId}; the push names no one`,
        error,
      });
      return 'An officer';
    }
  }

  /**
   * One push to the member. A failure is reported and swallowed: the timeout
   * is set (or lifted) either way, and the composer says so on its own.
   */
  private async push(
    member: Member,
    chapterId: string,
    copy: { title: string; body: string },
  ): Promise<void> {
    try {
      await this.notifications.notifyUser(member.user_id, chapterId, {
        ...copy,
        priority: 'NORMAL',
        category: CHAT_TIMEOUT_NOTIFICATION_CATEGORY,
        // No target: the push is about the member, not one channel, so a tap
        // opens their notifications (`resolveNotificationTarget`'s fallback).
        data: {},
      });
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'chat-timeout-push',
        message: `Could not tell member ${member.id} about their chat timeout`,
        error,
      });
    }
  }
}

/** A member row's timeout as the API serves it: none once it has passed. */
export function stateOf(
  member: Pick<Member, 'chat_timeout_until' | 'chat_timeout_reason'> | null,
  now: number = Date.now(),
): ChatTimeoutState {
  if (!member || !isChatTimeoutActive(member.chat_timeout_until, now)) {
    return NO_TIMEOUT;
  }
  return {
    until: member.chat_timeout_until ?? null,
    reason: member.chat_timeout_reason ?? null,
  };
}

/**
 * A member row without its timeout columns (#6006), nor whether they may ask
 * for more time on a task (#6096), for a response that hands rows to other
 * members: the Directory and a role save. Each is the member's and the
 * officers' business; the profile read serves the timeout to exactly them,
 * and the extension block is read through `GET
 * /v1/tasks/extension-requests/blocked` (`tasks:manage`).
 */
export function withoutChatTimeout<T extends Partial<Member>>(
  member: T,
): Omit<T, 'chat_timeout_until' | 'chat_timeout_reason' | 'chat_timeout_by'> {
  const rest: Partial<Member> = { ...member };
  delete rest.chat_timeout_until;
  delete rest.chat_timeout_reason;
  delete rest.chat_timeout_by;
  delete rest.extension_requests_blocked_at;
  delete rest.extension_requests_restored_at;
  return rest as Omit<
    T,
    'chat_timeout_until' | 'chat_timeout_reason' | 'chat_timeout_by'
  >;
}
