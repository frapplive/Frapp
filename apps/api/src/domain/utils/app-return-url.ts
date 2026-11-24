import { isProductionSupabaseUrl } from '@repo/validation';

/**
 * Whether the app builds that exist only outside production (the staging app,
 * Expo Go) may receive a sign-in's answer: every server but the production
 * one. A staging app must not finish a production member's sign-in.
 */
export function devAppsAllowed(supabaseUrl: string | undefined): boolean {
  return !(supabaseUrl && isProductionSupabaseUrl(supabaseUrl));
}

/**
 * Whether a sign-in may send its answer back to this address in the phone app
 * (#3322 Google Calendar, #5414 Discord link).
 *
 * The app's own `frapp://` scheme always. With `allowDevApps` (outside
 * production, `devAppsAllowed`), also the staging variant's
 * `frapp-staging://` (Frapp Staging, `apps/mobile/app.config.js`) and, unless
 * `allowExpoGo` is false, Expo Go's `exp://` on this computer or the local
 * network. Expo Go runs whatever server an `exp://` address names, so a
 * public one would hand the answer to a page the member's own app doesn't
 * control; a flow that a caller can point at someone else (Discord's link,
 * which a member can send to another person to approve) refuses Expo Go
 * outright, since a local network is shared too.
 *
 * `routes`, when given, is the closed list of app screens the address may
 * name (`preferences` for Settings), compared without the scheme, Expo Go's
 * host and `/--/` prefix, slashes or a query. A sign-in that only one screen
 * starts names that screen, so the return can't be pointed anywhere else in
 * the app either.
 *
 * Refused outright: a fragment, because the caller appends its own query to
 * the address and a query after `#` is part of the fragment; and whitespace
 * and control characters, which a URL parser can delete mid-parse, so the
 * address followed would not be the one checked.
 *
 * A custom scheme is not verified: another app on the phone can claim
 * `frapp://` too, so whatever rides this address must be useless to anyone
 * but the member who started the sign-in, from their own session.
 */
export function isAppReturnUrl(
  url: string,
  opts: {
    allowDevApps: boolean;
    allowExpoGo?: boolean;
    routes?: readonly string[];
  },
): boolean {
  if (
    url.length > 512 ||
    url.includes('#') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001F\u007F\s]/.test(url)
  ) {
    return false;
  }
  const expoGo =
    opts.allowDevApps && (opts.allowExpoGo ?? true) && isLocalExpoGoUrl(url);
  const allowedScheme =
    url.startsWith('frapp://') ||
    (opts.allowDevApps && url.startsWith('frapp-staging://')) ||
    expoGo;
  if (!allowedScheme) return false;
  if (!opts.routes) return true;
  const route = appRoute(url, expoGo);
  return route !== null && opts.routes.includes(route);
}

/**
 * The screen an app address names: `frapp://preferences`,
 * `frapp:///preferences` and `exp://10.0.0.5:8081/--/preferences` all name
 * `preferences`. Null for an Expo Go address with no `/--/` route.
 */
function appRoute(url: string, expoGo: boolean): string | null {
  let rest: string;
  if (expoGo) {
    const marker = url.indexOf('/--/');
    if (marker < 0) return null;
    rest = url.slice(marker + '/--/'.length);
  } else {
    rest = url.slice(url.indexOf('://') + '://'.length);
  }
  const end = rest.indexOf('?');
  return (end < 0 ? rest : rest.slice(0, end))
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function isLocalExpoGoUrl(url: string): boolean {
  if (!url.startsWith('exp://') && !url.startsWith('exps://')) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    /^127\.\d+\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)
  );
}

/** `url` with `params` added to its query, kept if it already has one. */
export function withQueryParams(
  url: string,
  params: Record<string, string>,
): string {
  const query = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}
