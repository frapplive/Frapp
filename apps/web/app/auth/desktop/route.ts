import { NextResponse } from "next/server";
import { resolveRedirectPath } from "@/lib/auth/redirect";
import {
  DESKTOP_AUTH_ERROR_PARAM,
  DESKTOP_CODE_PARAM,
  DESKTOP_FLOW_PARAM,
  DESKTOP_SIGN_IN_PATH,
} from "@/lib/desktop/bridge";
import { reportServerAuthFailure } from "@/lib/sentry/auth-failures";

/**
 * Where Google or Apple returns, in the member's browser, when the sign-in
 * was started in the desktop app (ADR-29 decision 5, #4841).
 *
 * This browser must not exchange the code: the session belongs in the app,
 * which holds the PKCE verifier. So this route exchanges nothing and only
 * moves the code off the `code` parameter before any page loads. A page under
 * the root providers mounts the Supabase browser client, which would try to
 * exchange a `?code=` in its address against whatever stale verifier this
 * browser holds. `/desktop-sign-in` receives it under another name and opens
 * the app with it.
 *
 * A return with no code (the member cancelled, the provider refused, the
 * email already belongs to another sign-in method) is reported here like
 * `/auth/callback` reports its own, and the page says what happened.
 *
 * Outside `proxy.ts`'s matcher, like `/auth/callback`: the member is signed
 * out in this browser, and the proxy would bounce the code to `/sign-in`.
 */
export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const linkError = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  const page = new URL(DESKTOP_SIGN_IN_PATH, url.origin);

  if (!code || linkError) {
    const failure = linkError ?? "missing_code";
    reportServerAuthFailure({ flow: "auth_callback", screen: "/auth/desktop", code: failure });
    page.searchParams.set(DESKTOP_AUTH_ERROR_PARAM, failure);
    return NextResponse.redirect(page);
  }

  page.searchParams.set(DESKTOP_CODE_PARAM, code);
  page.searchParams.set("next", resolveRedirectPath(url.searchParams.get("next")));
  const flow = url.searchParams.get(DESKTOP_FLOW_PARAM);
  if (flow) page.searchParams.set(DESKTOP_FLOW_PARAM, flow);
  return NextResponse.redirect(page);
}
