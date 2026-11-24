/**
 * The link that brings a Google or Apple sign-in back from the browser
 * (ADR-29 decision 5, #4841).
 *
 * Both providers refuse to sign in inside an embedded browser, so the web app
 * opens the provider page in the member's default browser. The provider
 * returns to the web app there (`/auth/desktop`, then the `/desktop-sign-in`
 * page), and that page opens `frapp-desktop://auth/callback?code=…&flow=…`,
 * which the operating system hands to this app. The shell then loads the web
 * app's own `/auth/callback` in its window, where the code is exchanged
 * against the verifier cookie the window has held since the member pressed
 * the button. The code is useless anywhere else, which is what PKCE is for.
 *
 * Any web page can open the scheme, so a link is taken only when it answers
 * the sign-in this app started: the web app puts a random `flow` value in the
 * address the provider returns to, the shell reads it as it opens the
 * browser, and only a link carrying the same value is accepted
 * (`createAuthLinkGate`).
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
/** `crypto.randomUUID()` on the web side; anything else is not ours. */
const FLOW_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
/** Where the provider returns to in the browser (`apps/web/app/auth/desktop`). */
const HANDOFF_PATH = "/auth/desktop";

export type AuthLink = {
  /** The page to load in the app window: the web app's own callback route. */
  readonly target: string;
  /** Which sign-in the link answers. */
  readonly flow: string;
};

/**
 * A returning sign-in link, or `null` for anything else. Only
 * `frapp-desktop://auth/callback` with a code and a flow is a sign-in: any
 * other host, path or shape is ignored, so a link on a web page can't steer
 * the window anywhere but the app's own callback route.
 */
export function parseAuthLink(link: unknown, appOrigin: string): AuthLink | null {
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

  const flow = url.searchParams.get("flow");
  if (!flow || !FLOW_PATTERN.test(flow)) return null;

  const target = new URL("/auth/callback", appOrigin);
  target.searchParams.set("code", code);
  // `/auth/callback` re-validates `next` itself.
  const next = url.searchParams.get("next");
  if (next) target.searchParams.set("next", next);
  return { target: target.toString(), flow };
}

/**
 * The flow value of a sign-in the shell is about to open in the browser, read
 * from where Supabase Auth's `authorize` address says the provider returns to
 * (`redirect_to`). `null` unless that is this app's own hand-off route, so the
 * bridge can't be used to start a sign-in that ends anywhere else.
 */
export function readAuthFlow(authorizeUrl: string, appOrigin: string): string | null {
  try {
    const redirectTo = new URL(authorizeUrl).searchParams.get("redirect_to");
    if (!redirectTo) return null;
    const back = new URL(redirectTo);
    if (back.origin !== appOrigin || back.pathname !== HANDOFF_PATH) return null;
    const flow = back.searchParams.get("flow");
    return flow && FLOW_PATTERN.test(flow) ? flow : null;
  } catch {
    return null;
  }
}

/**
 * Decides which returning links are taken. It remembers one sign-in, the
 * latest the member started, for ten minutes. A link for any other flow (an
 * older browser tab, a page guessing at the scheme) is ignored and leaves the
 * expected one in place; the expected link is taken once.
 */
export function createAuthLinkGate(now: () => number = Date.now): {
  /** Expect the sign-in this `authorize` address starts. False if it isn't ours. */
  arm(authorizeUrl: string, appOrigin: string): boolean;
  /** The page to load for this link, or `null` to ignore it. */
  accept(link: unknown, appOrigin: string): string | null;
} {
  let expected: { flow: string; until: number } | null = null;
  return {
    arm(authorizeUrl, appOrigin) {
      const flow = readAuthFlow(authorizeUrl, appOrigin);
      if (flow === null) return false;
      expected = { flow, until: now() + AUTH_LINK_WINDOW_MS };
      return true;
    },
    accept(link, appOrigin) {
      if (expected === null) return null;
      if (now() > expected.until) {
        expected = null;
        return null;
      }
      const parsed = parseAuthLink(link, appOrigin);
      if (parsed === null || parsed.flow !== expected.flow) return null;
      expected = null;
      return parsed.target;
    },
  };
}

/**
 * The sign-in link among a launch's arguments. Windows and Linux deliver a
 * link by starting the app again with it as an argument; the running app
 * receives those arguments through `second-instance`.
 */
export function findAuthLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${AUTH_LINK_SCHEME}://`)) ?? null;
}
