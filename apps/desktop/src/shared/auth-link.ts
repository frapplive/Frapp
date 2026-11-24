/**
 * The link that brings a Google or Apple sign-in back from the browser
 * (ADR-29 decision 5, #4841).
 *
 * Both providers refuse to sign in inside an embedded browser, so the web app
 * opens the provider page in the member's default browser. The provider
 * returns to the web app's `/desktop-sign-in` page there, and that page opens
 * `frapp-desktop://auth/callback?code=…`, which the operating system hands to
 * this app. The shell then loads the web app's own `/auth/callback` in its
 * window, where the code is exchanged against the verifier cookie the window
 * has held since the member pressed the button. The code is useless anywhere
 * else, which is what PKCE is for.
 *
 * The scheme is `frapp-desktop`, not the phone's `frapp`, so the two apps
 * never claim each other's links. The web app builds the same link in
 * `apps/web/lib/desktop/bridge.ts`; a spec on each side pins its shape.
 */

export const AUTH_LINK_SCHEME = "frapp-desktop";

/** How long after the browser opens a returning link is still accepted. */
export const AUTH_LINK_WINDOW_MS = 10 * 60 * 1000;

const MAX_LINK_LENGTH = 4096;
/** GoTrue's PKCE code is a UUID; anything URL-unsafe is not one. */
const CODE_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/;
/** What `/auth/callback` reads besides the code. It re-validates `next` itself. */
const PASSED_PARAMS = ["next", "intent"] as const;

/**
 * The page to load in the app window for a returning sign-in link, or `null`
 * for anything else. Only `frapp-desktop://auth/callback` with a code is a
 * sign-in: any other host, path or shape is ignored, so a link on a web page
 * can't steer the window anywhere but the app's own callback route.
 */
export function parseAuthLink(link: unknown, appOrigin: string): string | null {
  if (typeof link !== "string" || link.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${AUTH_LINK_SCHEME}:`) return null;
  if (url.hostname !== "auth" || url.pathname !== "/callback") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  const code = url.searchParams.get("code");
  if (!code || !CODE_PATTERN.test(code)) return null;

  const target = new URL("/auth/callback", appOrigin);
  target.searchParams.set("code", code);
  for (const name of PASSED_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) target.searchParams.set(name, value);
  }
  return target.toString();
}

/**
 * The sign-in link among a launch's arguments. Windows and Linux deliver a
 * link by starting the app again with it as an argument; the running app
 * receives those arguments through `second-instance`.
 */
export function findAuthLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${AUTH_LINK_SCHEME}://`)) ?? null;
}
