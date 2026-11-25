import { Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ReportedCron } from './reported-cron.decorator';
import { MinutesDocumentService } from '../services/minutes-document.service';

/** Posted minutes filed per tick: a chapter posts about one set a week. */
const SWEEP_LIMIT = 500;

/**
 * Files posted minutes that have no Documents row yet (#5949), every five
 * minutes, in every chapter. Two jobs:
 *
 * - **The backfill.** Minutes posted before #5949 are filed here, by the API
 *   that knows who may see their rows, not by the migration: production
 *   migrates before it ships the API, and the API before #5949 would have
 *   listed a filed row to every member who can open Documents.
 * - **What a save missed.** Filing at Post never fails the post, so a failure
 *   there leaves posted minutes with no row until this finds them.
 *
 * Filing is idempotent and serialised per chapter in the database, so two
 * instances ticking at once file each set once. A failure is reported by
 * `@ReportedCron` and the next tick tries again.
 */
@Injectable()
export class MinutesDocumentSweepService {
  private readonly logger = new Logger(MinutesDocumentSweepService.name);
  private running = false;

  constructor(private readonly minutesDocuments: MinutesDocumentService) {}

  @ReportedCron(CronExpression.EVERY_5_MINUTES)
  async handleMinutesDocumentSweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const filed = await this.minutesDocuments.fileUnfiled(SWEEP_LIMIT);
      if (filed > 0) {
        this.logger.log(`Filed ${filed} posted minutes as documents`);
      }
    } finally {
      this.running = false;
    }
  }
}
