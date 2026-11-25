import { ascendingNullsLast } from './nulls-last';

describe('ascendingNullsLast (#5761)', () => {
  it('orders dates ascending and puts a missing one last', () => {
    const days = ['2026-11-20', null, '2026-01-01', undefined, '2026-03-05'];
    expect([...days].sort(ascendingNullsLast)).toEqual([
      '2026-01-01',
      '2026-03-05',
      '2026-11-20',
      null,
      undefined,
    ]);
  });

  it('calls two missing values equal', () => {
    expect(ascendingNullsLast(null, undefined)).toBe(0);
  });
});
