import { Agent } from 'undici';

/**
 * How long an idle connection to Supabase stays open for the next call.
 *
 * Node's built-in `fetch` closes a connection 4 seconds after its last
 * response (undici's default `keepAliveTimeout`), and Supabase's edge sends no
 * `Keep-Alive: timeout=` header to raise that. The API talks to the database
 * only through Supabase's HTTP API, and a member's requests come in bursts
 * with longer gaps between them, so nearly every burst found no open
 * connection and opened a new TLS connection for each parallel call. One web
 * page load makes 60 or more of those calls at once, on one vCPU.
 *
 * Measured on staging, 2026-11-24 (Sentry trace
 * `0f3a3715108b488190fff5530b69a2cc`, `GET /v1/activity`): the first 14
 * parallel reads each took 420 to 575 ms from the API's side, while Supabase's
 * edge log has every read of that half second answered in 157 ms or less. The
 * reads that followed on the now-open connections took 25 to 90 ms.
 *
 * Two minutes spans the gaps inside one member's session (a tap, a read, the
 * next tap), so the connections a burst opened are still there for the next
 * burst. It does not keep a pool warm across a quiet spell: a connection
 * closes two minutes after its own last use, and the scheduled jobs' calls
 * each minute reuse only as many connections as they run in parallel. The
 * first burst after more than two quiet minutes still opens its connections.
 */
export const SUPABASE_KEEP_ALIVE_MS = 120_000;

/** The options of {@link createSupabaseDispatcher}'s pool. */
export function supabaseDispatcherOptions(
  keepAliveMs: number = SUPABASE_KEEP_ALIVE_MS,
): Agent.Options {
  return { keepAliveTimeout: keepAliveMs };
}

/**
 * The connection pool the Supabase client's HTTP calls go through (PostgREST,
 * Auth and Storage share the project's one origin). Realtime's socket and the
 * throttler's rare JWKS fetch are not on it.
 */
export function createSupabaseDispatcher(keepAliveMs?: number): Agent {
  return new Agent(supabaseDispatcherOptions(keepAliveMs));
}

/**
 * Node's own `fetch`, sent through {@link createSupabaseDispatcher}'s pool.
 *
 * The global `fetch` and not the `undici` package's: the package's `fetch`
 * does not recognise the global `FormData` that `storage-js` wraps a `Blob`
 * upload in, and sends it as the text `[object FormData]`. The global one
 * takes the package's `Agent` as its `dispatcher` (checked on Node 22 and 24),
 * and Sentry traces each call as an `http.client` span as before.
 */
export function createSupabaseFetch(dispatcher: Agent): typeof fetch {
  return (input, init) =>
    fetch(input, { ...init, dispatcher } as RequestInit & {
      dispatcher: Agent;
    });
}
