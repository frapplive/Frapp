import { Inject, Injectable } from '@nestjs/common';
import { desktopReleaseObject } from '#domain/constants/desktop-updates';
import {
  DESKTOP_RELEASE_STORE,
  type IDesktopReleaseStore,
} from '#domain/adapters/desktop-release-store.interface';

/** A link is handed out again only while it still works for this long. */
export const LINK_REUSE_MARGIN_MS = 30 * 60 * 1000;
/** How long the list of published files is trusted before it is read again. */
export const PUBLISHED_FRESH_MS = 60 * 1000;
/**
 * A name missing from the list re-reads it once the list is this old, so a
 * file uploaded a moment ago is found, while names nobody published cost one
 * read of the bucket per window however many are asked for.
 */
export const PUBLISHED_RECHECK_MS = 10 * 1000;

/**
 * Where the desktop app downloads a release file from (#4843): a
 * time-limited link to the private bucket, made on request. Links are
 * remembered, so an update going out to every install signs each file once
 * an hour, not once per install. Only a file the bucket actually holds gets
 * a link: the route is public, and a name that merely looks right must not
 * cost a signature or push a real link out of memory.
 */
@Injectable()
export class DesktopUpdateService {
  private readonly links = new Map<
    string,
    Promise<{ url: string; expiresAt: number }>
  >();
  private published: { names: Set<string>; readAt: number } | null = null;
  private listing: Promise<Set<string>> | null = null;

  constructor(
    @Inject(DESKTOP_RELEASE_STORE)
    private readonly store: IDesktopReleaseStore,
  ) {}

  /**
   * The link for a file name an installed app asked for, or null when no
   * release has published it. Throws `DesktopReleaseStoreError` when the
   * store can't answer.
   */
  async linkFor(file: string, now = Date.now()): Promise<string | null> {
    const object = desktopReleaseObject(file);
    if (!object) return null;
    if (!(await this.isPublished(object, now))) return null;
    const remembered = this.links.get(object);
    if (remembered) {
      const link = await remembered.catch(() => null);
      if (link && link.expiresAt - LINK_REUSE_MARGIN_MS > now) return link.url;
      // Only the caller that finds it stale drops it; one arriving after a
      // newer link replaced it leaves that one alone.
      if (this.links.get(object) === remembered) this.links.delete(object);
    }
    // The promise is what is remembered, so requests arriving while a link
    // is being signed share that one signature.
    const current = this.links.get(object);
    if (current) return (await current).url;
    const pending = this.store.signedReadUrl(object);
    this.links.set(object, pending);
    try {
      return (await pending).url;
    } catch (error) {
      if (this.links.get(object) === pending) this.links.delete(object);
      throw error;
    }
  }

  private async isPublished(object: string, now: number): Promise<boolean> {
    let known = this.published;
    if (!known || now - known.readAt >= PUBLISHED_FRESH_MS) {
      known = await this.readPublished(now);
    }
    if (known.names.has(object)) return true;
    if (now - known.readAt < PUBLISHED_RECHECK_MS) return false;
    return (await this.readPublished(now)).names.has(object);
  }

  /** Reads the list once for every request waiting on it. */
  private async readPublished(
    now: number,
  ): Promise<{ names: Set<string>; readAt: number }> {
    this.listing ??= this.store.publishedObjects().finally(() => {
      this.listing = null;
    });
    const names = await this.listing;
    this.published = { names, readAt: now };
    // A link to a file since removed from the bucket is forgotten with it.
    for (const object of this.links.keys()) {
      if (!names.has(object)) this.links.delete(object);
    }
    return this.published;
  }
}
