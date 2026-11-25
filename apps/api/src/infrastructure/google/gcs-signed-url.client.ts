import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  DESKTOP_RELEASES_BUCKET,
  DESKTOP_RELEASES_PREFIX,
} from '#domain/constants/desktop-updates';
import {
  DesktopReleaseStoreError,
  type IDesktopReleaseStore,
} from '#domain/adapters/desktop-release-store.interface';

const METADATA_ACCOUNT =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';
const IAM_CREDENTIALS_API = 'https://iamcredentials.googleapis.com/v1';
const STORAGE_HOST = 'storage.googleapis.com';
const STORAGE_API = `https://${STORAGE_HOST}/storage/v1`;
/** A listing is read at most this many pages deep (1,000 objects a page). */
const LIST_PAGES = 10;
const TIMEOUT_MS = 10_000;
/** How long a link works: long enough to start a download, never to share. */
export const SIGNED_URL_TTL_SECONDS = 3600;
/** A token is renewed this long before Google says it expires. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

/** RFC 3986 unreserved characters stay; everything else is percent-encoded. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The two halves of a Cloud Storage V4 signed URL for one GET
 * (https://cloud.google.com/storage/docs/authentication/signatures): the
 * link without its signature, and the text Google expects signed with the
 * account's key. Exported for its spec, which checks it against a link
 * Google's own client library signed.
 */
export function signedUrlParts(input: {
  bucket: string;
  object: string;
  account: string;
  at: Date;
  ttlSeconds: number;
}): { unsignedUrl: string; stringToSign: string } {
  const stamp = input.at.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const scope = `${stamp.slice(0, 8)}/auto/storage/goog4_request`;
  const path = `/${input.bucket}/${input.object.split('/').map(encode).join('/')}`;
  // Already in the byte order the signature requires.
  const query = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', `${input.account}/${scope}`],
    ['X-Goog-Date', stamp],
    ['X-Goog-Expires', String(input.ttlSeconds)],
    ['X-Goog-SignedHeaders', 'host'],
  ]
    .map(([name, value]) => `${name}=${encode(value)}`)
    .join('&');
  const canonical = [
    'GET',
    path,
    query,
    `host:${STORAGE_HOST}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  return {
    unsignedUrl: `https://${STORAGE_HOST}${path}?${query}`,
    stringToSign: [
      'GOOG4-RSA-SHA256',
      stamp,
      scope,
      createHash('sha256').update(canonical).digest('hex'),
    ].join('\n'),
  };
}

/**
 * Time-limited links to the desktop releases bucket (#4843), over `fetch`
 * with no Google SDK, as `GoogleDriveApiClient` does it. No key file: the
 * API's own identity on Cloud Run signs through IAM Credentials' `signBlob`,
 * which Google allows once that identity holds Service Account Token Creator
 * on itself (`scripts/gcp/desktop-downloads.sh`). Anywhere there is no
 * metadata server, or no such grant, every call throws
 * `DesktopReleaseStoreError`.
 */
@Injectable()
export class GcsSignedUrlClient implements IDesktopReleaseStore {
  private account: string | null = null;
  private token: { value: string; expiresAt: number } | null = null;
  /** The token request in flight, shared by every caller waiting on it. */
  private renewing: Promise<string> | null = null;

  async publishedObjects(): Promise<Set<string>> {
    const names = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < LIST_PAGES; page += 1) {
      // The delimiter keeps the listing to the prefix's own files: the kept
      // per-version feeds under `feeds/` are never served and never listed.
      const query = new URLSearchParams({
        prefix: `${DESKTOP_RELEASES_PREFIX}/`,
        delimiter: '/',
        fields: 'items(name),nextPageToken',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await this.send(
        `${STORAGE_API}/b/${DESKTOP_RELEASES_BUCKET}/o?${query.toString()}`,
        { headers: { Authorization: `Bearer ${await this.runtimeToken()}` } },
        'list',
      );
      if (!response.ok) {
        throw new DesktopReleaseStoreError(`list_${response.status}`);
      }
      const body = await this.json<{
        items?: { name?: unknown }[];
        nextPageToken?: unknown;
      }>(response, 'list_unreadable');
      for (const item of body.items ?? []) {
        if (typeof item.name === 'string') names.add(item.name);
      }
      if (typeof body.nextPageToken !== 'string') return names;
      pageToken = body.nextPageToken;
    }
    return names;
  }

  async signedReadUrl(
    object: string,
  ): Promise<{ url: string; expiresAt: number }> {
    const at = new Date();
    const account = await this.runtimeAccount();
    const { unsignedUrl, stringToSign } = signedUrlParts({
      bucket: DESKTOP_RELEASES_BUCKET,
      object,
      account,
      at,
      ttlSeconds: SIGNED_URL_TTL_SECONDS,
    });
    const response = await this.send(
      `${IAM_CREDENTIALS_API}/projects/-/serviceAccounts/${encodeURIComponent(account)}:signBlob`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.runtimeToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: Buffer.from(stringToSign).toString('base64'),
        }),
      },
      'sign',
    );
    if (!response.ok) {
      throw new DesktopReleaseStoreError(`sign_${response.status}`);
    }
    const body = await this.json<{ signedBlob?: unknown }>(
      response,
      'sign_unreadable',
    );
    if (typeof body.signedBlob !== 'string') {
      throw new DesktopReleaseStoreError('sign_no_signature');
    }
    const signature = Buffer.from(body.signedBlob, 'base64').toString('hex');
    return {
      url: `${unsignedUrl}&X-Goog-Signature=${signature}`,
      expiresAt: at.getTime() + SIGNED_URL_TTL_SECONDS * 1000,
    };
  }

  private async runtimeAccount(): Promise<string> {
    if (this.account) return this.account;
    const response = await this.send(
      `${METADATA_ACCOUNT}/email`,
      { headers: { 'Metadata-Flavor': 'Google' } },
      'no_runtime_identity',
    );
    if (!response.ok) throw new DesktopReleaseStoreError('no_runtime_identity');
    let account: string;
    try {
      account = (await response.text()).trim();
    } catch {
      throw new DesktopReleaseStoreError('no_runtime_identity');
    }
    if (!account) throw new DesktopReleaseStoreError('no_runtime_identity');
    this.account = account;
    return account;
  }

  private runtimeToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
      return Promise.resolve(this.token.value);
    }
    // Requests that arrive while a token is being fetched wait on that one
    // fetch instead of each asking the metadata server.
    this.renewing ??= this.fetchToken().finally(() => {
      this.renewing = null;
    });
    return this.renewing;
  }

  private async fetchToken(): Promise<string> {
    const response = await this.send(
      `${METADATA_ACCOUNT}/token`,
      { headers: { 'Metadata-Flavor': 'Google' } },
      'no_runtime_token',
    );
    if (!response.ok) throw new DesktopReleaseStoreError('no_runtime_token');
    const body = await this.json<{
      access_token?: unknown;
      expires_in?: unknown;
    }>(response, 'no_runtime_token');
    if (typeof body.access_token !== 'string') {
      throw new DesktopReleaseStoreError('no_runtime_token');
    }
    // A reply that doesn't say how long the token lasts is used once and
    // never kept: asking again is cheap, and a kept dead token fails every
    // request until the process restarts.
    const seconds = typeof body.expires_in === 'number' ? body.expires_in : 0;
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + seconds * 1000,
    };
    return this.token.value;
  }

  /** A reply's JSON, with a cut-off or malformed body turned into the store's error. */
  private async json<T>(response: Response, failure: string): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new DesktopReleaseStoreError(failure);
    }
  }

  /** One call, bounded, with a network failure turned into the store's error. */
  private async send(
    url: string,
    init: RequestInit,
    failure: string,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new DesktopReleaseStoreError(failure);
    }
  }
}
