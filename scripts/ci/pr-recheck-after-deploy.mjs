#!/usr/bin/env node
// Re-runs the failed jobs of each open PR's Migration drift gate run once a
// deploy has published fresh database state (.github/workflows/pr-recheck-after-deploy.yml;
// docs/ci-cd/pr-babysitting.md § Recheck after a deploy). Paul, 2026-11-24:
// "have the base sync bot rerun failing CI gates after staging deploys".
//
// Why only that workflow. A re-run keeps the original run's commit, which for a
// pull request is GitHub's test merge with `main` as `main` stood then, so a
// re-run of CI cannot pick up a fix that has since landed on `main`. Its three
// jobs (`migration-drift`, `migration-order`, `migration-replay`) are the PR
// checks that read live state at run time instead: they fetch `origin/main` and
// download the newest published migration snapshot. When staging is stuck (a
// migration-order race, #4795, #5958), they go red on every PR and stay red
// after staging recovers, until each PR happens to push again. A re-run after
// the snapshot that follows a deploy reads the recovered state.
//
// Per sweep, triggered by a successful Migration snapshot run that a deploy
// started:
//
//   1. The newest finished Deploy staging run must have succeeded. If it
//      failed, staging still holds the state that made the gates red, and a
//      re-run would only fail again.
//   2. For each open, non-draft PR from this repo (newest-updated first, up to
//      MAX_PRS), the newest Migration drift gate run on its head is re-run
//      (failed jobs only) when it concluded `failure`, finished before this
//      snapshot was published, and has not used MAX_RUN_ATTEMPTS attempts.
//
// The finished-before rule is the dedup: a run that ended after the publish
// may already have read this state, and the next sweep only comes with the
// next publish. The attempt cap bounds a PR whose gate is red for its own
// reason (its migration fails replay) to two bot re-runs per head. A re-run
// fires nothing that starts this workflow again, and merge queue runs are never
// touched (`event=pull_request` only); a queued PR is green already.
//
// Env inputs:
//   GITHUB_TOKEN               — required, `actions: write` (the re-run) and
//                                `pull-requests: read`
//   GITHUB_REPOSITORY          — required, owner/repo
//   SNAPSHOT_RUN_ID            — required, the Migration snapshot run that fired this
//   SNAPSHOT_RUN_COMPLETED_AT  — required, when it finished (its `updated_at`)
//
// Exits 0 on every handled outcome, like the other watchdogs (a red watchdog is
// noise); 1 only on an unexpected error or a missing input.

import { appendFileSync } from "node:fs";

import { ghRequest } from "./lib/github.mjs";
import { requireEnv } from "./lib/env.mjs";
import { isInvokedDirectly } from "./lib/invoked-directly.mjs";

export const GATE_WORKFLOW = "migration-drift-gate.yml";
export const STAGING_DEPLOY_WORKFLOW = "deploy-staging.yml";
// Total attempts on one run: the PR's own, then at most two bot re-runs.
export const MAX_RUN_ATTEMPTS = 3;
// A sweep makes at most two calls per PR, so 30 PRs stay far inside the
// GITHUB_TOKEN budget and the job's timeout. The rest are logged, not dropped
// silently; newest-updated first, because a PR nobody touched in weeks is the
// least likely to be waiting on its gates.
export const MAX_PRS = 30;

function timeMs(value) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The newest deploy that actually ran. `skipped` is a Deploy staging run whose
 * CI failed or came from a fork (its jobs skip by design), and `cancelled` is
 * one a newer deploy superseded; neither says anything about staging.
 */
export function newestRealDeploy(runs) {
  return (
    (Array.isArray(runs) ? runs : [])
      .filter((run) => run?.status === "completed" && !["skipped", "cancelled"].includes(run?.conclusion))
      .sort((a, b) => (timeMs(b.created_at) ?? 0) - (timeMs(a.created_at) ?? 0))[0] ?? null
  );
}

/** Open PRs worth a look: this repo's heads (a fork's runs are its own), not drafts. */
export function selectPrs(prs, repo) {
  return (Array.isArray(prs) ? prs : []).filter(
    (pr) => !pr?.draft && pr?.head?.repo?.full_name === repo && typeof pr?.head?.sha === "string",
  );
}

/** The newest run, by creation (a re-run keeps its run's id and creation time). */
export function newestRun(runs) {
  return (
    (Array.isArray(runs) ? runs : []).sort(
      (a, b) => (timeMs(b.created_at) ?? 0) - (timeMs(a.created_at) ?? 0) || (b.id ?? 0) - (a.id ?? 0),
    )[0] ?? null
  );
}

/**
 * Whether to re-run one PR's gate run against a snapshot published at
 * `publishedAtMs`. Returns `{ rerun: boolean, reason: string }`.
 */
export function planRecheck({ run, publishedAtMs, maxAttempts = MAX_RUN_ATTEMPTS }) {
  if (!run) return { rerun: false, reason: "no Migration drift gate run on its head" };
  if (run.status !== "completed") return { rerun: false, reason: "its gate run is still going" };
  if (run.conclusion !== "failure") return { rerun: false, reason: `its gate run is ${run.conclusion}` };
  const attempt = Number(run.run_attempt) || 1;
  if (attempt >= maxAttempts) {
    return { rerun: false, reason: `attempt ${attempt} of ${maxAttempts} already ran; red for its own reason, or needs a look` };
  }
  // A completed run's updated_at is when it finished (a re-run resets it).
  const finishedMs = timeMs(run.updated_at);
  if (finishedMs === null || publishedAtMs === null || finishedMs >= publishedAtMs) {
    return { rerun: false, reason: "it finished after this snapshot was published, so it may have read it" };
  }
  return { rerun: true, reason: `attempt ${attempt} failed before this snapshot was published` };
}

/**
 * One sweep. Never throws for an API failure: a read that fails skips that PR
 * (or, for the two sweep-wide reads, the sweep), and a failed re-run is logged.
 * Returns the per-PR outcomes for the summary and the tests.
 */
export async function sweep({ token, repo, publishedAtMs, fetchImpl = fetch, logger = console }) {
  const get = (path) => ghRequest({ token, fetchImpl, path });

  const deploys = await get(
    `/repos/${repo}/actions/workflows/${STAGING_DEPLOY_WORKFLOW}/runs?branch=main&status=completed&per_page=10`,
  );
  if (!deploys.ok) {
    logger.log(`Could not read Deploy staging runs (HTTP ${deploys.status}); nothing re-run.`);
    return { skipped: "deploys-unreadable", results: [] };
  }
  const deploy = newestRealDeploy(deploys.data?.workflow_runs);
  if (deploy?.conclusion !== "success") {
    logger.log(
      deploy
        ? `The newest Deploy staging run (${deploy.html_url ?? deploy.id}) is ${deploy.conclusion}; staging hasn't recovered, so nothing re-run.`
        : "No finished Deploy staging run found; nothing re-run.",
    );
    return { skipped: "staging-not-green", results: [] };
  }

  const pulls = await get(`/repos/${repo}/pulls?state=open&base=main&sort=updated&direction=desc&per_page=100`);
  if (!pulls.ok) {
    logger.log(`Could not list open PRs (HTTP ${pulls.status}); nothing re-run.`);
    return { skipped: "pulls-unreadable", results: [] };
  }
  const prs = selectPrs(pulls.data, repo);
  if (prs.length > MAX_PRS) {
    logger.log(
      `${prs.length} open PRs; checking the ${MAX_PRS} updated most recently. Not checked this sweep: ${prs
        .slice(MAX_PRS)
        .map((pr) => `#${pr.number}`)
        .join(", ")}.`,
    );
  }

  const results = [];
  for (const pr of prs.slice(0, MAX_PRS)) {
    const runs = await get(
      `/repos/${repo}/actions/workflows/${GATE_WORKFLOW}/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=10`,
    );
    if (!runs.ok) {
      results.push({ number: pr.number, rerun: false, reason: `couldn't read its gate runs (HTTP ${runs.status})` });
      continue;
    }
    const run = newestRun(runs.data?.workflow_runs);
    const plan = planRecheck({ run, publishedAtMs });
    if (!plan.rerun) {
      results.push({ number: pr.number, runId: run?.id ?? null, ...plan });
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
        ? plan.reason
        : `re-run refused (HTTP ${posted.status}${posted.data?.message ? `: ${posted.data.message}` : ""})`,
    });
  }

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
  const publishedAtMs = timeMs(requireEnv("SNAPSHOT_RUN_COMPLETED_AT"));
  if (publishedAtMs === null) {
    console.error("SNAPSHOT_RUN_COMPLETED_AT is not a date.");
    process.exit(1);
  }
  console.log(`Migration snapshot run ${snapshotRunId} published at ${new Date(publishedAtMs).toISOString()}.`);
  const outcome = await sweep({ token, repo, publishedAtMs });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(outcome));
}

if (isInvokedDirectly(import.meta.url)) {
  main().catch((error) => {
    console.error(`Unhandled error: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
