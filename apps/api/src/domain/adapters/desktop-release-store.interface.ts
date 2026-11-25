export const DESKTOP_RELEASE_STORE = 'DESKTOP_RELEASE_STORE';

/**
 * The store could not answer: this API has no access to the bucket (staging,
 * a laptop, CI), or Google refused or timed out. `reason` is short and
 * low-cardinality, for the log; it never carries a token or a URL.
 */
export class DesktopReleaseStoreError extends Error {
  constructor(readonly reason: string) {
    super(`Desktop release store unavailable: ${reason}`);
    this.name = 'DesktopReleaseStoreError';
  }
}

/**
 * The private bucket the desktop app's releases live in (#4843,
 * `domain/constants/desktop-updates.ts`).
 */
export interface IDesktopReleaseStore {
  /**
   * A link that reads one object for a limited time, with the moment it
   * stops working. It is made without looking at the bucket, so a link for
   * an object that does not exist answers 404 when followed.
   */
  signedReadUrl(object: string): Promise<{ url: string; expiresAt: number }>;

  /**
   * The names of the objects a release has published, feeds included: what
   * sits directly under the releases prefix, and nothing kept deeper.
   */
  publishedObjects(): Promise<Set<string>>;
}
