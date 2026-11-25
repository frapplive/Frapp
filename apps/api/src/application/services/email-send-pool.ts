/**
 * Resend's default rate limit is low (2 requests/second on the standard
 * tier). Firing a batch of emails as one `Promise.all` turns a healthy
 * provider into a wall of spurious 429s, each reported back as a failed
 * address. A small worker pool keeps genuine delivery failures apart from
 * self-inflicted rate limiting. Shared by bulk invites and the interest
 * form's push-up emails (#5977).
 */
export const EMAIL_SEND_CONCURRENCY = 2;

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
