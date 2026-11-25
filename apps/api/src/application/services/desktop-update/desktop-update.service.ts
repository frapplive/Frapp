import { Inject, Injectable } from '@nestjs/common';
import { desktopReleaseObject } from '#domain/constants/desktop-updates';
import {
  DESKTOP_RELEASE_STORE,
  type IDesktopReleaseStore,
} from '#domain/adapters/desktop-release-store.interface';

/** A link is handed out again only while it still works for this long. */
export const LINK_REUSE_MARGIN_MS = 30 * 60 * 1000;
/**
 * Links remembered at once, per API instance. A release is about ten files
 * and four feeds, so this holds many versions; the cap is for names that
 * pass the shape check but were never published.
 */
export const REMEMBERED_LINKS = 200;

/**
 * Where the desktop app downloads a release file from (#4843): a
 * time-limited link to the private bucket, made on request. Links are
 * remembered, so an update going out to every install signs each file once
 * an hour, not once per install.
 */
@Injectable()
export class DesktopUpdateService {
  private readonly links = new Map<
    string,
    Promise<{ url: string; expiresAt: number }>
  >();

  constructor(
    @Inject(DESKTOP_RELEASE_STORE)
    private readonly store: IDesktopReleaseStore,
  ) {}

  /**
   * The link for a file name an installed app asked for, or null when the
   * name is not one a release publishes. Throws `DesktopReleaseStoreError`
   * when the store can't answer.
   */
  async linkFor(file: string, now = Date.now()): Promise<string | null> {
    const object = desktopReleaseObject(file);
    if (!object) return null;
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
    if (this.links.size > REMEMBERED_LINKS) {
      const [oldest] = this.links.keys();
      this.links.delete(oldest);
    }
    try {
      return (await pending).url;
    } catch (error) {
      if (this.links.get(object) === pending) this.links.delete(object);
      throw error;
    }
  }
}
