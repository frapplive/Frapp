/**
 * Whether a sign-in may send its answer back to this address in the phone app
 * (#3322 Google Calendar, #5414 Discord link).
 *
 * The app's own `frapp://` scheme always. Outside production, also the
 * staging variant's `frapp-staging://` (Frapp Staging,
 * `apps/mobile/app.config.js`) and Expo Go's `exp://` on this computer or the
 * local network. Production takes neither: a staging app must not finish a
 * production member's sign-in, and Expo Go runs whatever server an `exp://`
 * address names, so a public one would hand the answer to a page the member's
 * own app doesn't control.
 *
 * `routes`, when given, is the closed list of app screens the address may
 * name (`preferences` for Settings), compared without the scheme, Expo Go's
 * host and `/--/` prefix, slashes or a query. A sign-in that only one screen
 * starts names that screen, so the return can't be pointed anywhere else in
 * the app either. A fragment is refused, because the caller appends its own
 * query to the address.
 *
 * Whitespace and control characters are refused outright: a URL parser can
 * delete them mid-parse, so the address followed would not be the one checked.
 */
export function isAppReturnUrl(
  url: string,
  opts: { allowDevApps: boolean; routes?: readonly string[] },
): boolean {
  // eslint-disable-next-line no-control-regex
  if (url.length > 512 || /[\u0000-\u001F\u007F\s]/.test(url)) return false;
  const expoGo = isLocalExpoGoUrl(url);
  const allowedScheme =
    url.startsWith('frapp://') ||
    (opts.allowDevApps && (url.startsWith('frapp-staging://') || expoGo));
  if (!allowedScheme) return false;
  if (!opts.routes) return true;
  if (url.includes('#')) return false;
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
