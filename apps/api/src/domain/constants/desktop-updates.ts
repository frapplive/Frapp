/**
 * Where the desktop app's releases are kept (#4843, ADR-29 decision 8): one
 * private Google Cloud Storage bucket in the production project, written by
 * the `Desktop release` workflow (`scripts/ci/desktop-publish.mjs`, which
 * names the same bucket and prefix) and read only through
 * `GET /v1/desktop/updates/:file`.
 */
export const DESKTOP_RELEASES_BUCKET = 'frapp-live-downloads';
export const DESKTOP_RELEASES_PREFIX = 'desktop';

/** What an installed app reads to learn the newest version, per channel and OS. */
const FEED = /^(latest|beta)(-mac)?\.yml$/;
/**
 * A release's own files, as `apps/desktop/electron-builder.yml` names them:
 * `Frapp-Setup-0.2.0.exe`, `Frapp-0.2.0-universal.dmg` and
 * `Frapp-0.2.0-universal-mac.zip`. A release whose files are named otherwise
 * is refused before it uploads (`SERVED_FILE` in
 * `scripts/ci/desktop-publish.mjs`, which a test holds equal to this).
 */
const RELEASE_FILE = /^Frapp-[A-Za-z0-9.-]{1,60}\.(exe|dmg|zip)$/;

/**
 * The bucket object a requested file name stands for, or null when the name
 * is not one a release publishes. Only a bare file name passes, so nothing
 * outside the releases prefix (the kept per-version feeds included) can be
 * asked for.
 */
export function desktopReleaseObject(file: string): string | null {
  if (!FEED.test(file) && !RELEASE_FILE.test(file)) return null;
  if (file.includes('..')) return null;
  return `${DESKTOP_RELEASES_PREFIX}/${file}`;
}
