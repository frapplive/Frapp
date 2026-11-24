import { Agent, fetch as undiciFetch } from 'undici';

/**
 * How long an idle connection to Supabase stays open for the next call.
 *
 * Node's built-in `fetch` closes a connection 4 seconds after its last
 * response (undici's default `keepAliveTimeout`). The API talks to the
 * database only through Supabase's HTTP API, and a member's requests come in
 * bursts with longer gaps between them, so nearly every burst found no open
 * connection and opened a new TLS connection for each parallel call. One web
 * page load makes 60 or more of those calls at once, on one vCPU.
 *
 * Measured on staging, 2026-11-24 (Sentry trace
 * `0f3a3715108b488190fff5530b69a2cc`, `GET /v1/activity`): the first 14
 * parallel reads each took 420 to 575 ms from the API's side, while Supabase's
 * edge log has every read of that half second answered in 157 ms or less. The
 * reads that followed on the now-open connections took 25 to 90 ms.
 *
 * Two minutes spans the gaps inside a member's session and the scheduled
 * jobs' one-minute tick, so a pool stays open while anyone is using the app.
 * It is well under the idle limit of Supabase's edge (Cloudflare, 400
 * seconds), so the far side is not the one closing them.
 */
export const SUPABASE_KEEP_ALIVE_MS = 120_000;

/**
 * The connection pool every Supabase call goes through (PostgREST, Auth and
 * Storage share the project's one origin).
 */
export function createSupabaseDispatcher(
  keepAliveMs: number = SUPABASE_KEEP_ALIVE_MS,
): Agent {
  return new Agent({
    keepAliveTimeout: keepAliveMs,
    // What a `Keep-Alive: timeout=` response header may raise it to.
    keepAliveMaxTimeout: 600_000,
  });
}

/**
 * `fetch` bound to {@link createSupabaseDispatcher}'s pool.
 *
 * undici's own `fetch` rather than the global one handed a `dispatcher`:
 * Node bundles its own copy of undici behind the global `fetch`, and a
 * dispatcher from the installed package is only guaranteed to fit the `fetch`
 * of that same package. Sentry traces both through undici's diagnostics
 * channels, so each call is still its own `http.client` span.
 */
export function createSupabaseFetch(dispatcher: Agent): typeof fetch {
  const pooled = (input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
    );
  return pooled as unknown as typeof fetch;
}
