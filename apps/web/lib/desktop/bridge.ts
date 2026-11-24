/**
 * The web app's side of the desktop shell (ADR-29, `apps/desktop`).
 *
 * Inside the desktop app the shell's preload sets `window.frappDesktop`; in a
 * browser it is absent, and that is how this app tells the two apart. The
 * whole contract lives in `apps/desktop/src/shared/bridge.ts`. This file names
 * only the parts the web app calls, because one app can't import another.
 */

export type DesktopBridge = {
  /**
   * Open Supabase Auth's sign-in page in the member's default browser.
   * Resolves to whether it opened: the shell refuses any address that isn't a
   * sign-in returning to this app.
   */
  openExternal(url: string): Promise<boolean>;
};

/** The shell's bridge, or `null` in a browser and on the server. */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as { frappDesktop?: Partial<DesktopBridge> }).frappDesktop;
  return typeof bridge?.openExternal === "function" ? (bridge as DesktopBridge) : null;
}

/**
 * Where a provider returns to in the member's browser when the sign-in was
 * started in the desktop app: a route that moves the code off `?code=`
 * (`app/auth/desktop/route.ts`) and sends the browser on to the page that
 * hands it back to the app (`app/(auth)/desktop-sign-in/page.tsx`). The shell
 * only opens a sign-in that returns to the first
 * (`apps/desktop/src/shared/auth-link.ts`).
 */
export const DESKTOP_HANDOFF_PATH = "/auth/desktop";
export const DESKTOP_SIGN_IN_PATH = "/desktop-sign-in";

/**
 * The page's name for the code. Not `code`: the Supabase browser client reads
 * that name from any page's address and tries to exchange it.
 */
export const DESKTOP_CODE_PARAM = "handoff";
/**
 * Which sign-in this is: a random value the web app sets when the member
 * presses the button. The shell takes a returning link only when it carries
 * the value of the sign-in it opened.
 */
export const DESKTOP_FLOW_PARAM = "flow";
export const DESKTOP_AUTH_ERROR_PARAM = "authError";

/**
 * The link that opens the desktop app to finish a sign-in, or `null` when the
 * page was reached without a code. Only the code, where to land and the flow
 * cross into the app; the shell accepts exactly this shape.
 */
export function desktopAuthLink(params: URLSearchParams): string | null {
  const code = params.get(DESKTOP_CODE_PARAM);
  if (!code) return null;
  const handedBack = new URLSearchParams({ code });
  for (const name of ["next", DESKTOP_FLOW_PARAM]) {
    const value = params.get(name);
    if (value) handedBack.set(name, value);
  }
  return `frapp-desktop://auth/callback?${handedBack.toString()}`;
}
