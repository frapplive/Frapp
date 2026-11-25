import { Inject, Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ReportedCron } from './reported-cron.decorator';
import { MEMBER_REPOSITORY } from '#domain/repositories/member.repository.interface';
import type { IMemberRepository } from '#domain/repositories/member.repository.interface';
import { ChatTimeoutService } from '../services/chat-timeout.service';
import { reportCaughtFailure } from '../../infrastructure/observability/report-caught-failure';

/** Ended timeouts one tick reads. A crowd of them is rare; the next tick takes the rest. */
export const TIMEOUT_SWEEP_BATCH = 100;

/**
 * Clears chat timeouts whose time has passed and tells each member they can
 * post again (#6006, `spec/behavior/chat/README.md` § Timeouts).
 *
 * Enforcement doesn't wait for this: `ChannelAccessService` compares the
 * time with the clock, so a member can post the moment their timeout ends.
 * The sweep only tidies the row and sends the "it's over" push, up to a
 * minute late.
 *
 * Every replica runs this cron. Each row is cleared with a compare-and-set on
 * the time it read (`clearChatTimeout`), so only one replica sends the push,
 * and a timeout an officer just replaced is left alone.
 */
@Injectable()
export class ChatTimeoutSweepService {
  private readonly logger = new Logger(ChatTimeoutSweepService.name);
  private running = false;

  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly memberRepo: IMemberRepository,
    private readonly timeouts: ChatTimeoutService,
  ) {}

  @ReportedCron(CronExpression.EVERY_MINUTE)
  async handleTimeoutSweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweep(Date.now());
    } finally {
      this.running = false;
    }
  }

  async sweep(now: number): Promise<{ cleared: number }> {
    const ended = await this.memberRepo.findEndedChatTimeouts(
      new Date(now).toISOString(),
      TIMEOUT_SWEEP_BATCH,
    );
    let cleared = 0;
    for (const member of ended) {
      const until = member.chat_timeout_until;
      if (!until) continue;
      try {
        const claimed = await this.memberRepo.clearChatTimeout(
          member.id,
          until,
        );
        if (!claimed) continue;
        cleared += 1;
        await this.timeouts.notifyEnded(member);
      } catch (error) {
        reportCaughtFailure(this.logger, {
          level: 'warning',
          site: 'chat-timeout-sweep',
          message: `Could not clear the ended chat timeout of member ${member.id}`,
          error,
        });
      }
    }
    return { cleared };
  }
}
