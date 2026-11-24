import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { CouncilRecruitmentController } from './pnm.controller';
import { SystemPermissions } from '#domain/constants/permissions';

/**
 * Phone numbers need `council:recruitment_manage` (Paul, 2026-11-11, #4218
 * decision 9; `school-layer.md` § 3.3); the list and the seasons read with
 * `council:recruitment_view`. Pinned here so a refactor that loosens the
 * phone route fails a test, not only review (#5974).
 */
describe('CouncilRecruitmentController keys', () => {
  const keys = (method: keyof CouncilRecruitmentController) =>
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      CouncilRecruitmentController.prototype[method],
    ) as string[];

  it('the phone reveal requires council:recruitment_manage', () => {
    expect(keys('phone')).toEqual([
      SystemPermissions.COUNCIL_RECRUITMENT_MANAGE,
    ]);
  });

  it('the merge queue and merges require council:recruitment_manage', () => {
    for (const method of ['duplicates', 'dismiss', 'merge'] as const) {
      expect([method, keys(method)]).toEqual([
        method,
        [SystemPermissions.COUNCIL_RECRUITMENT_MANAGE],
      ]);
    }
  });

  it('the master list reads with council:recruitment_view', () => {
    expect(keys('masterList')).toEqual([
      SystemPermissions.COUNCIL_RECRUITMENT_VIEW,
    ]);
  });
});
