import { codeOf, statusOf } from "@repo/api-sdk";

/**
 * A 403 for a request whose chapter disagrees with the session's. `ChapterGuard`
 * threw it for a header that disagreed with the token's claim until ADR-27
 * (#5918) made the header authoritative; the chapter-config routes still throw
 * it for a URL chapter id that disagrees with the request's.
 */
const CHAPTER_CONTEXT_MISMATCH = "chapter.context.mismatch";

/**
 * Whether a chat card's read of its live record was answered rather than
 * failed, so the read hook resolves it to `null`: a 404 (the record is gone),
 * or a 403 that won't change on a retry (a permission the viewer lacks, a
 * module that is off, or `ChapterGuard`'s `chapter.context.invalid` for a
 * viewer no longer in the chapter). The card then drops its live line instead
 * of keeping the last read, and an expected miss is neither retried nor
 * reported. `useRushCandidate` and `useServiceEntry` read through it.
 *
 * The one 403 that is not an answer is `chapter.context.mismatch`: the
 * request's chapter and the session's disagree, which clears once the client
 * catches up with a chapter switch. It throws, and keeps the query's
 * retry and its error line.
 */
export function isCardReadMiss(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 404) return true;
  if (status !== 403) return false;
  return codeOf(error) !== CHAPTER_CONTEXT_MISMATCH;
}
