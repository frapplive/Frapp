import { PnmRetentionWorkerService } from './pnm-retention-worker.service';
import type { IPnmRepository } from '#domain/repositories/pnm.repository.interface';

describe('PnmRetentionWorkerService', () => {
  it('runs purge_expired_pnms with the tick time and returns its count', async () => {
    const pnms = { purgeExpired: jest.fn().mockResolvedValue(3) };
    const worker = new PnmRetentionWorkerService(
      pnms as unknown as IPnmRepository,
    );
    const now = new Date('2027-08-10T00:00:00Z');

    await expect(worker.sweep(now)).resolves.toBe(3);
    expect(pnms.purgeExpired).toHaveBeenCalledWith(now);
  });

  it('the hourly handler sweeps at the current time', async () => {
    const pnms = { purgeExpired: jest.fn().mockResolvedValue(0) };
    const worker = new PnmRetentionWorkerService(
      pnms as unknown as IPnmRepository,
    );

    await worker.handlePnmRetentionSweep();

    expect(pnms.purgeExpired).toHaveBeenCalledWith(expect.any(Date));
  });
});
