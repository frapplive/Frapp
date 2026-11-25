/**
 * Two ISO dates or instants in ascending order, a missing one last: how a
 * task with no due date (#5761), or a day's task with no time, sorts after
 * the rest. Plain `<`, never `localeCompare`: ICU collation puts a stand-in
 * like `~` before digits, which once sorted undated tasks first.
 */
export function ascendingNullsLast(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = a ?? null;
  const right = b ?? null;
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}
