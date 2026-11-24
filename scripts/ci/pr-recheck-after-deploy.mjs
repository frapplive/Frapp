#!/usr/bin/env node
// Re-runs the failed jobs of an open PR's Migration drift gate run when the
// database state that turned it red has since been fixed by a deploy
// (.github/workflows/pr-recheck-after-deploy.yml; docs/ci-cd/pr-babysitting.md
// § Recheck after a deploy). Paul, 2026-11-24: "have the base sync bot rerun
// failing CI gates after staging deploys". He chose this scope over also merging
// main into red PRs or re-running failed CI jobs.
//
// Why only that workflow. A re-run keeps the original run's commit, which for a
// pull request is GitHub's test merge with `main` as `main` stood then, so a
// re-run of CI cannot pick up a fix that has since landed on `main`. The gate's
// three jobs read state that is fresh at run time: the published migration
// snapshot (staging's and production's applied migrations), and for
// `migration-drift` also live `origin/main`. `migration-order` and
// `migration-replay` still measure the PR against its frozen base, so a gate red
// because that base is stale needs `npm run merge:main`, not a re-run. When a
// deploy is stuck (a migration-order race, #4795, #5958), the gate goes red on
// every PR and stays red after the deploy recovers, until each PR pushes again.
//
// The rule, per PR. Its newest `pull_request` gate run on its head (from this
// repo, never a fork's run at the same SHA) is re-run, failed jobs only, when:
//
//   - it concluded `failure` and is below MAX_RUN_ATTEMPTS;
//   - when its attempt started, the newest deploy of staging or production had
//     FAILED (its `deploy` job, not the run: a red prune or alert job after a
//     good deploy says nothing about the database), so it read a stuck state;
//   - a deploy of that same environment has SUCCEEDED since, and finished
//     before the snapshot that fired this sweep started, so the snapshot holds
//     the recovered state;
//   - the PR's head is still the run's head (a re-run joins the gate's per-PR
//     concurrency group and would cancel a newer head's run).
//
// A run red for the PR's own reason with every deploy green is never re-run, and
// one re-run per recovery is all a run gets: its new attempt starts after the
// recovery. Skipped Deploy staging runs (CI on main red) changed no database and
// count for nothing. Merge queue runs are never touched (`event=pull_request`).
//
// Env inputs:
//   GITHUB_TOKEN             — required, `actions: write` (the re-run) and
//                              `pull-requests: read`
//   GITHUB_REPOSITORY        — required, owner/repo
//   SNAPSHOT_RUN_ID          — required, the Migration snapshot run that fired this
//   SNAPSHOT_RUN_STARTED_AT  — required, when it started reading state
//                              (its `run_started_at`)
//
// Exits 0 on every handled outcome, like the other watchdogs (a red watchdog is
// noise); 1 only on an unexpected error or a missing input.

import { appendFileSync } from "node:fs";

import { ghRequest } from "./lib/github.mjs";
import { requireEnv } from "./lib/env.mjs";
import { isInvokedDirectly } from "./lib/invoked-directly.mjs";

export const GATE_WORKFLOW = "migration-drift-gate.yml";
/**
 * The deploys whose database state the gate reads, and their deploy job as the
 * jobs API names it, `<caller job name> / <called job>`: both callers' `deploy`
 * job calls `_deploy.yml`'s job `deploy`; production's caller has a `name:`.
 * Pinned against the workflows by pr-recheck-after-deploy.test.mjs.
 */
export const DEPLOYS = [
  { env: "staging", workflow: "deploy-staging.yml", job: "deploy / deploy" },
  { env: "production", workflow: "deploy-production.yml", job: "Migrate, then ship Render + Vercel / deploy" },
];
// Total attempts on one run: the PR's own, then at most two bot re-runs.
export const MAX_RUN_ATTEMPTS = 3;
// The newest-updated PRs first; the rest are logged, not dropped silently.
export const MAX_PRS = 30;
// Deploy runs read per environment, newest first.
export const DEPLOY_RUNS_READ = 20;
// The job's timeout-minutes is 15. Past this, no new PR is started, so the
// summary is always written and the run never ends cancelled midway.
export const SWEEP_BUDGET_MS = 9 * 60 * 1000;

function timeMs(value) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

/** Open PRs worth a look: this repo's heads (a fork's runs are its own), not drafts. */
export function selectPrs(prs, repo) {
  return (Array.isArray(prs) ? prs : []).filter(
    (pr) => !pr?.draft && pr?.head?.repo?.full_name === repo && typeof pr?.head?.sha === "string",
  );
}

/** The newest of this repo's runs on a head, by creation (a re-run keeps its creation time). */
export function newestRun(runs, repo) {
  return (
    (Array.isArray(runs) ? runs : [])
      .filter((run) => run?.head_repository?.full_name === repo)
      .sort((a, b) => (timeMs(b.created_at) ?? 0) - (timeMs(a.created_at) ?? 0) || (b.id ?? 0) - (a.id ?? 0))[0] ??
    null
  );
}

/**
 * A deploy run's outcome for the database: its deploy job's conclusion and
 * finish. `null` when the job didn't decide anything (missing, skipped,
 * cancelled, a dry run).
 */
export function deployOutcome(jobs, jobName) {
  const job = (Array.isArray(jobs) ? jobs : []).find((j) => j?.name === jobName);
  const finishedMs = timeMs(job?.completed_at);
  if (!job || finishedMs === null || !["success", "failure"].includes(job.conclusion)) return null;
  return { ok: job.conclusion === "success", finishedMs };
}

/**
 * Whether one failed gate attempt read a stuck environment that has recovered
 * since. `timelines` is `{ env: [{ ok, finishedMs }] }`; `snapshotStartedMs` is
 * when the state the re-run will read was captured.
 */
export function recoveredSince({ startedMs, timelines, snapshotStartedMs }) {
  for (const [env, events] of Object.entries(timelines)) {
    const before = events.filter((e) => e.finishedMs < startedMs).sort((a, b) => b.finishedMs - a.finishedMs)[0];
    if (!before || before.ok) continue;
    const recovery = events.find((e) => e.ok && e.finishedMs >= startedMs && e.finishedMs <= snapshotStartedMs);
    if (recovery) return env;
  }
  return null;
}

/** The cheap part of the decision, from the run alone. `{ candidate, reason }`. */
export function screenRun(run, maxAttempts = MAX_RUN_ATTEMPTS) {
  if (!run) return { candidate: false, reason: "no Migration drift gate run on its head" };
  if (run.status !== "completed") return { candidate: false, reason: "its gate run is still going" };
  if (run.conclusion !== "failure") return { candidate: false, reason: `its gate run is ${run.conclusion}` };
  const attempt = Number(run.run_attempt) || 1;
  if (attempt >= maxAttempts) {
    return { candidate: false, reason: `attempt ${attempt} of ${maxAttempts} already ran` };
  }
  if (timeMs(run.run_started_at) === null) return { candidate: false, reason: "its start time is unreadable" };
  return { candidate: true, reason: `attempt ${attempt} failed` };
}

async function readTimelines({ get, repo, oldestStartMs, logger }) {
  const timelines = {};
  for (const { env, workflow, job } of DEPLOYS) {
    const runs = await get(
      `/repos/${repo}/actions/workflows/${workflow}/runs?branch=main&status=completed&per_page=${DEPLOY_RUNS_READ}`,
    );
    if (!runs.ok) {
      logger.log(`Could not read ${workflow} runs (HTTP ${runs.status}); ${env} counts as never stuck.`);
      timelines[env] = [];
      continue;
    }
    const events = [];
    // Newest first. Stop once a decided deploy finished before the oldest
    // candidate started: older ones can't change any verdict.
    const ordered = (runs.data?.workflow_runs ?? [])
      .filter((r) => r?.conclusion !== "skipped")
      .sort((a, b) => (timeMs(b.created_at) ?? 0) - (timeMs(a.created_at) ?? 0));
    for (const run of ordered) {
      const jobs = await get(`/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
      if (!jobs.ok) continue;
      const outcome = deployOutcome(jobs.data?.jobs, job);
      if (!outcome) continue;
      events.push(outcome);
      if (outcome.finishedMs < oldestStartMs) break;
    }
    timelines[env] = events;
  }
  return timelines;
}

/**
 * One sweep. Never throws for an API failure: a read that fails skips that PR,
 * and a failed re-run is logged. Returns the per-PR outcomes.
 */
export async function sweep({ token, repo, snapshotStartedMs, fetchImpl = fetch, logger = console, now = Date.now }) {
  const started = now();
  // Reads retry (bounded); the re-run POST stays a single attempt.
  const get = (path) => ghRequest({ token, fetchImpl, path, retry: true });

  const pulls = await get(`/repos/${repo}/pulls?state=open&base=main&sort=updated&direction=desc&per_page=100`);
  if (!pulls.ok) {
    logger.log(`Could not list open PRs (HTTP ${pulls.status}); nothing re-run.`);
    return { skipped: "pulls-unreadable", results: [] };
  }
  const prs = selectPrs(pulls.data, repo);
  if (prs.length > MAX_PRS) {
    logger.log(
      `${prs.length} open PRs; checking the ${MAX_PRS} updated most recently. Not checked: ${prs
        .slice(MAX_PRS)
        .map((pr) => `#${pr.number}`)
        .join(", ")}.`,
    );
  }

  const results = [];
  const candidates = [];
  for (const pr of prs.slice(0, MAX_PRS)) {
    if (now() - started > SWEEP_BUDGET_MS) {
      results.push({ number: pr.number, rerun: false, reason: "out of time this sweep" });
      continue;
    }
    const runs = await get(
      `/repos/${repo}/actions/workflows/${GATE_WORKFLOW}/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=10`,
    );
    if (!runs.ok) {
      results.push({ number: pr.number, rerun: false, reason: `couldn't read its gate runs (HTTP ${runs.status})` });
      continue;
    }
    const run = newestRun(runs.data?.workflow_runs, repo);
    const screen = screenRun(run);
    if (!screen.candidate) results.push({ number: pr.number, runId: run?.id ?? null, rerun: false, reason: screen.reason });
    else candidates.push({ pr, run });
  }

  if (candidates.length > 0) {
    const oldestStartMs = Math.min(...candidates.map(({ run }) => timeMs(run.run_started_at)));
    const timelines = await readTimelines({ get, repo, oldestStartMs, logger });
    for (const { pr, run } of candidates) {
      const env = recoveredSince({ startedMs: timeMs(run.run_started_at), timelines, snapshotStartedMs });
      if (!env) {
        results.push({
          number: pr.number,
          runId: run.id,
          rerun: false,
          reason: "no deploy was stuck when it ran and has recovered since, so it's red for its own reason",
        });
        continue;
      }
      const current = await get(`/repos/${repo}/pulls/${pr.number}`);
      if (!current.ok || current.data?.state !== "open" || current.data?.head?.sha !== run.head_sha) {
        results.push({ number: pr.number, runId: run.id, rerun: false, reason: "its head moved; the new head's run reads fresh state" });
        continue;
      }
      const posted = await ghRequest({
        token,
        fetchImpl,
        method: "POST",
        path: `/repos/${repo}/actions/runs/${run.id}/rerun-failed-jobs`,
      });
      results.push({
        number: pr.number,
        runId: run.id,
        rerun: posted.ok,
        reason: posted.ok
          ? `it ran while ${env} was stuck, and ${env} has deployed since`
          : `re-run refused (HTTP ${posted.status}${posted.data?.message ? `: ${posted.data.message}` : ""})`,
      });
    }
  }

  results.sort((a, b) => a.number - b.number);
  for (const r of results) {
    logger.log(`#${r.number}: ${r.rerun ? "re-ran the failed jobs" : "left alone"}. ${r.reason}.`);
  }
  return { skipped: null, results };
}

export function summaryMarkdown({ skipped, results }) {
  if (skipped) return `### PR recheck after deploy\n\nNothing re-run (${skipped}).\n`;
  const rows = results.map(
    (r) => `| #${r.number} | ${r.rerun ? "re-ran failed jobs" : "left alone"} | ${String(r.reason).replace(/\|/g, "\\|")} |`,
  );
  return [
    "### PR recheck after deploy",
    "",
    `${results.filter((r) => r.rerun).length} of ${results.length} open PRs had their Migration drift gate re-run.`,
    "",
    "| PR | Action | Why |",
    "| -- | ------ | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repo = requireEnv("GITHUB_REPOSITORY");
  const snapshotRunId = requireEnv("SNAPSHOT_RUN_ID");
  const snapshotStartedMs = timeMs(requireEnv("SNAPSHOT_RUN_STARTED_AT"));
  if (snapshotStartedMs === null) {
    console.error("SNAPSHOT_RUN_STARTED_AT is not a date.");
    process.exit(1);
  }
  console.log(`Migration snapshot run ${snapshotRunId} read state at ${new Date(snapshotStartedMs).toISOString()}.`);
  const outcome = await sweep({ token, repo, snapshotStartedMs });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(outcome));
}

if (isInvokedDirectly(import.meta.url)) {
  main().catch((error) => {
    console.error(`Unhandled error: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
