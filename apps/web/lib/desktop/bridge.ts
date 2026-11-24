/**
 * The web app's side of the desktop shell (ADR-29, `apps/desktop`).
 *
 * Inside the desktop app the shell's preload sets `window.frappDesktop`; in a
 * browser it is absent, and that is how this app tells the two apart. The
 * whole contract lives in `apps/desktop/src/shared/bridge.ts`. This file names
 * only the parts the web app calls, because one app can't import another.
 */

type DesktopBridge = {
  /** Open Supabase Auth's sign-in page in the member's default browser. */
  openExternal(url: string): void;
};

/** The shell's bridge, or `null` in a browser and on the server. */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as { frappDesktop?: Partial<DesktopBridge> }).frappDesktop;
  return typeof bridge?.openExternal === "function" ? (bridge as DesktopBridge) : null;
}

/**
 * Where a provider returns to in the member's browser when the sign-in was
 * started in the desktop app: a page that hands the code back to the app
 * (`app/(auth)/desktop-sign-in/page.tsx`).
 */
export const DESKTOP_SIGN_IN_PATH = "/desktop-sign-in";

/** What the callback route reads; nothing else crosses into the app. */
const HANDED_BACK_PARAMS = ["code", "next", "intent"] as const;

/**
 * The link that opens the desktop app to finish a sign-in, or `null` when the
 * provider came back without a code (the member cancelled, or it failed).
 * The shell accepts exactly this shape (`apps/desktop/src/shared/auth-link.ts`).
 */
export function desktopAuthLink(params: URLSearchParams): string | null {
  if (!params.get("code")) return null;
  const handedBack = new URLSearchParams();
  for (const name of HANDED_BACK_PARAMS) {
    const value = params.get(name);
    if (value) handedBack.set(name, value);
  }
  return `frapp-desktop://auth/callback?${handedBack.toString()}`;
}
