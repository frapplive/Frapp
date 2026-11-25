import { Inject, Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ReportedCron } from './reported-cron.decorator';
import {
  PNM_REPOSITORY,
  type IPnmRepository,
} from '#domain/repositories/pnm.repository.interface';

/**
 * The PNM retention sweep (#5974, `school-layer.md` § 3.5,
 * `ifc-recruitment.md` § Retention and deletion; Paul, #4218: 180 days).
 * Hourly, the pattern of the report-retention sweep: `purge_expired_pnms`
 * deletes every PNM record past its season's close plus the council's N
 * days (default and ceiling 180), or 180 days after the last activity of a
 * PNM on no master list. Each chapter keeps its own candidate row, unlinked.
 *
 * Safe on every replica: a delete of a row another replica already deleted
 * deletes nothing. Chapter-private pipeline data's 30-day clock belongs to
 * the pipeline's own tables (notes, ratings, contact logs), which the
 * recruitment pipeline (#5972 and up) owns, not this sweep.
 */
@Injectable()
export class PnmRetentionWorkerService {
  private readonly logger = new Logger(PnmRetentionWorkerService.name);

  constructor(@Inject(PNM_REPOSITORY) private readonly pnms: IPnmRepository) {}

  @ReportedCron(CronExpression.EVERY_HOUR)
  async handlePnmRetentionSweep(): Promise<void> {
    await this.sweep(new Date());
  }

  async sweep(now: Date): Promise<number> {
    const deleted = await this.pnms.purgeExpired(now);
    if (deleted > 0) {
      this.logger.log(`pnm retention sweep: deleted ${deleted} PNM records`);
    }
    return deleted;
  }
}
