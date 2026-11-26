import { PRODUCTION_APP_ORIGIN } from '@repo/validation';
import {
  BAGGAGE_HEADER,
  REQUEST_ID_HEADER,
  SENTRY_TRACE_HEADER,
} from './correlation-headers';
import type { DeploymentEnvironment } from './deployment-environment';

/**
 * The CORS contract the dashboard and Expo-web origins actually hit.
 *
 * Lives here rather than inline in `main.ts` so production and the test
 * harness share one list — the same reason `VALIDATION_PIPE_OPTIONS` and
 * `configureApp` exist. Leaving `exposedHeaders` only on the process that
 * `NestFactory.create`s would mean e2e never sees the headers a browser
 * is allowed to read, which is how a missing `x-request-id` expose (and
 * the report/search truncation flags before it) stays invisible.
 *
 * `allowedHeaders` is deliberately unset: the `cors` package then reflects
 * `Access-Control-Request-Headers`, so a new non-safelisted request header
 * does not need a second edit here to pass preflight. Response headers are
 * the opposite — only names in `exposedHeaders` reach browser JS.
 */
export const CORS_EXPOSED_HEADERS = [
  // Only CORS-safelisted response headers reach browser JS unless named here.
  // The dashboard is cross-origin (api.frapp.live vs app.frapp.live). See
  // spec/behavior/reports.md § Row limits.
  'X-Report-Truncated',
  'X-Report-Row-Limit',
  'X-Report-Truncation-Note',
  // spec/behavior/search.md: distinguish "no matches" from "we stopped looking".
  'X-Search-Timeout',
  'X-Search-Timeout-Sources',
  REQUEST_ID_HEADER,
  SENTRY_TRACE_HEADER,
  BAGGAGE_HEADER,
] as const;

/** The staging dashboard, the one browser origin that calls the staging API. */
export const STAGING_APP_ORIGIN = 'https://app.staging.frapp.live';

/** The dashboard's dev server (`npm run dev:web`). */
export const DASHBOARD_DEV_ORIGIN = 'http://localhost:3000';

/**
 * The dashboard's dev server, and Expo web on 3002, the port
 * `docs/guides/demo-data.md` and the store-screenshot runbook (`mobile.md`)
 * start it on because it is listed here. The landing's dev server also runs on
 * 3002 but never calls the API.
 */
const LOCAL_DEV_ORIGINS = [DASHBOARD_DEV_ORIGIN, 'http://localhost:3002'];

/**
 * Exact browser origins per deployment (#2507). No patterns.
 *
 * This used to be `localhost` plus `/^https:\/\/(?:[a-zA-Z0-9-]+\.)*frapp\.live$/`
 * in every environment, so production admitted the staging dashboard and any
 * other `*.frapp.live` host, including one left dangling after its service is
 * gone (`vercel.md` still carries a `docs.frapp.live` clean-up item). Every
 * deployed origin listed here is one a deployed client really calls from: the
 * `frapp-web` Vercel project serves exactly `app.frapp.live` and
 * `app.staging.frapp.live`, the landing never calls the API from the browser,
 * and the native apps send no `Origin` at all, which CORS lets through.
 *
 * Staging keeps the local dev ports. A dashboard on a laptop pointed at the
 * staging API is how staging gets exercised while its own web host sits behind
 * Vercel SSO (#1951), and staging holds test data only. Production doesn't.
 */
export const CORS_ALLOWED_ORIGINS: Readonly<
  Record<DeploymentEnvironment, readonly string[]>
> = {
  production: [PRODUCTION_APP_ORIGIN],
  staging: [STAGING_APP_ORIGIN, ...LOCAL_DEV_ORIGINS],
  local: LOCAL_DEV_ORIGINS,
};

/**
 * How long a browser may reuse a preflight answer, in seconds (#6121).
 *
 * Every dashboard read carries `authorization` and `x-chapter-id`, so the
 * browser asks `OPTIONS` before each URL it hasn't asked about lately. With no
 * `Access-Control-Max-Age` Chrome keeps that answer five seconds, so an open
 * more than five seconds after the last one sent a preflight ahead of the
 * bootstrap and every first-screen read. Measured on the local stack
 * (2026-11-26): 23 to 24 `OPTIONS` per dashboard reload, soft or hard, and 1
 * to 2 with this. Derived, not measured: over HTTP/2 each one is a round trip
 * before its read, which is what the shell waited on. Two hours is Chrome's
 * ceiling (Firefox allows 24, Safari about 10 minutes). A browser's first
 * open, or one after the two hours, still pays the preflights.
 *
 * What a cached preflight allows is the method and the header names, for up
 * to two hours. Taking an origin off the list above stops that page reading
 * any answer at once, since every real response must carry its origin in
 * `Access-Control-Allow-Origin`, but a tab already open there could still
 * send a request with its own bearer token until its cached preflight runs
 * out. The API authenticates every request by that token, so this reaches
 * nothing the token couldn't, but a removed origin is cut off from writing
 * only once its cached preflights expire, not at once.
 */
export const CORS_PREFLIGHT_MAX_AGE_SECONDS = 7200;

/** The options `configureApp` hands `enableCors` for one deployment. */
export function corsOptionsFor(environment: DeploymentEnvironment) {
  return {
    origin: [...CORS_ALLOWED_ORIGINS[environment]],
    credentials: true,
    exposedHeaders: [...CORS_EXPOSED_HEADERS],
    maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
  };
}
