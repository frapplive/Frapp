// scripts/ci/pr-recheck-after-deploy.mjs and the workflow that runs it. The
// workflow runs only from `main` (workflow_run), so a PR that breaks it passes
// its own CI and fails silently after merge; the workflow half pins what it
// depends on.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeFetchMock, quiet } from "./helpers.mjs";
import { workflowJobs } from "./helpers/workflow-yaml.mjs";
import {
  MAX_PRS,
  MAX_RUN_ATTEMPTS,
  newestRealDeploy,
  newestRun,
  planRecheck,
  selectPrs,
  summaryMarkdown,
  sweep,
} from "../pr-recheck-after-deploy.mjs";

const REPO = "frapplive/Frapp";
const PUBLISHED = Date.parse("2026-11-24T12:00:00Z");
const BEFORE = "2026-11-24T11:00:00Z";
const AFTER = "2026-11-24T12:05:00Z";

const failedRun = (over = {}) => ({
  id: 101,
  status: "completed",
  conclusion: "failure",
  run_attempt: 1,
  created_at: "2026-11-24T10:00:00Z",
  updated_at: BEFORE,
  ...over,
});

const pr = (number, sha, over = {}) => ({
  number,
  draft: false,
  head: { sha, repo: { full_name: REPO } },
  ...over,
});

describe("planRecheck", () => {
  it("re-runs a failed run that finished before the publish", () => {
    assert.equal(planRecheck({ run: failedRun(), publishedAtMs: PUBLISHED }).rerun, true);
  });

  it("leaves a run that finished after the publish: it may have read this state", () => {
    assert.equal(planRecheck({ run: failedRun({ updated_at: AFTER }), publishedAtMs: PUBLISHED }).rerun, false);
  });

  it("leaves green, cancelled, running and missing runs alone", () => {
    for (const run of [
      failedRun({ conclusion: "success" }),
      failedRun({ conclusion: "cancelled" }),
      failedRun({ status: "in_progress", conclusion: null }),
      null,
    ]) {
      assert.equal(planRecheck({ run, publishedAtMs: PUBLISHED }).rerun, false);
    }
  });

  it("stops at the attempt cap, so a gate red for its own reason gets two bot re-runs per head", () => {
    assert.equal(MAX_RUN_ATTEMPTS, 3);
    assert.equal(planRecheck({ run: failedRun({ run_attempt: 2 }), publishedAtMs: PUBLISHED }).rerun, true);
    assert.equal(planRecheck({ run: failedRun({ run_attempt: 3 }), publishedAtMs: PUBLISHED }).rerun, false);
  });

  it("fails safe on an unreadable time", () => {
    assert.equal(planRecheck({ run: failedRun({ updated_at: null }), publishedAtMs: PUBLISHED }).rerun, false);
    assert.equal(planRecheck({ run: failedRun(), publishedAtMs: null }).rerun, false);
  });
});

describe("selection helpers", () => {
  it("judges staging on the newest deploy that ran, past skips and supersedes", () => {
    const runs = [
      { status: "completed", conclusion: "skipped", created_at: "2026-11-24T12:00:00Z" },
      { status: "completed", conclusion: "cancelled", created_at: "2026-11-24T11:30:00Z" },
      { status: "completed", conclusion: "failure", created_at: "2026-11-24T11:00:00Z" },
      { status: "completed", conclusion: "success", created_at: "2026-11-24T10:00:00Z" },
    ];
    assert.equal(newestRealDeploy(runs).conclusion, "failure");
    assert.equal(newestRealDeploy([]), null);
  });

  it("skips drafts and fork heads", () => {
    const prs = [pr(1, "a"), pr(2, "b", { draft: true }), pr(3, "c", { head: { sha: "c", repo: { full_name: "x/fork" } } })];
    assert.deepEqual(selectPrs(prs, REPO).map((p) => p.number), [1]);
  });

  it("takes the newest gate run on a head", () => {
    const runs = [failedRun({ id: 1, created_at: "2026-11-24T09:00:00Z" }), failedRun({ id: 2, created_at: "2026-11-24T10:00:00Z" })];
    assert.equal(newestRun(runs).id, 2);
    assert.equal(newestRun([]), null);
  });
});

function routes({ deploys, pulls, runsBySha, rerunStatus = 201 }) {
  return [
    { method: "GET", path: "/actions/workflows/deploy-staging.yml/runs", body: { workflow_runs: deploys } },
    { method: "GET", path: "/pulls?", body: pulls },
    ...Object.entries(runsBySha).map(([sha, runs]) => ({
      method: "GET",
      path: `head_sha=${sha}&`,
      body: { workflow_runs: runs },
    })),
    { method: "POST", path: "/rerun-failed-jobs", status: rerunStatus, body: {} },
  ];
}

const GREEN_DEPLOY = [{ status: "completed", conclusion: "success", created_at: "2026-11-24T11:50:00Z" }];

describe("sweep", () => {
  it("re-runs only the stale failed gate runs, failed jobs only, on the pull_request event", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      routes({
        deploys: GREEN_DEPLOY,
        pulls: [pr(10, "aaa"), pr(11, "bbb"), pr(12, "ccc")],
        runsBySha: {
          aaa: [failedRun({ id: 501 })],
          bbb: [failedRun({ id: 502, conclusion: "success" })],
          ccc: [failedRun({ id: 503, updated_at: AFTER })],
        },
      }),
    );
    const { results } = await sweep({ token: "t", repo: REPO, publishedAtMs: PUBLISHED, fetchImpl, logger: quiet });
    const posts = calls.filter((c) => c.method === "POST");
    assert.deepEqual(posts.map((c) => c.url), [`https://api.github.com/repos/${REPO}/actions/runs/501/rerun-failed-jobs`]);
    assert.deepEqual(results.map((r) => [r.number, r.rerun]), [[10, true], [11, false], [12, false]]);
    const runReads = calls.filter((c) => c.url.includes("migration-drift-gate.yml/runs"));
    assert.ok(runReads.every((c) => c.url.includes("event=pull_request")), "never reads merge queue runs");
  });

  it("does nothing while the newest deploy is red", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      routes({
        deploys: [{ status: "completed", conclusion: "failure", created_at: "2026-11-24T11:50:00Z" }, ...GREEN_DEPLOY],
        pulls: [pr(10, "aaa")],
        runsBySha: { aaa: [failedRun()] },
      }),
    );
    const out = await sweep({ token: "t", repo: REPO, publishedAtMs: PUBLISHED, fetchImpl, logger: quiet });
    assert.equal(out.skipped, "staging-not-green");
    assert.equal(calls.length, 1, "one read: the deploy runs");
  });

  it("logs a refused re-run and carries on", async () => {
    const { fetchImpl } = makeFetchMock(
      routes({
        deploys: GREEN_DEPLOY,
        pulls: [pr(10, "aaa"), pr(11, "bbb")],
        runsBySha: { aaa: [failedRun({ id: 1 })], bbb: [failedRun({ id: 2 })] },
        rerunStatus: 403,
      }),
    );
    const { results } = await sweep({ token: "t", repo: REPO, publishedAtMs: PUBLISHED, fetchImpl, logger: quiet });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => !r.rerun && /HTTP 403/.test(r.reason)));
  });

  it("checks at most MAX_PRS PRs a sweep", async () => {
    const many = Array.from({ length: MAX_PRS + 5 }, (_, i) => pr(i + 1, `s${i}`));
    const { fetchImpl, calls } = makeFetchMock(routes({ deploys: GREEN_DEPLOY, pulls: many, runsBySha: {} }));
    await sweep({ token: "t", repo: REPO, publishedAtMs: PUBLISHED, fetchImpl, logger: quiet });
    assert.equal(calls.filter((c) => c.url.includes("migration-drift-gate.yml/runs")).length, MAX_PRS);
  });

  it("writes a summary either way", () => {
    assert.match(summaryMarkdown({ skipped: "staging-not-green", results: [] }), /Nothing re-run/);
    assert.match(
      summaryMarkdown({ skipped: null, results: [{ number: 7, rerun: true, reason: "a | b" }] }),
      /\| #7 \| re-ran failed jobs \| a \\\| b \|/,
    );
  });
});

const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".github", "workflows");
const WORKFLOW = join(WORKFLOWS, "pr-recheck-after-deploy.yml");

describe("pr-recheck-after-deploy.yml", () => {
  const text = readFileSync(WORKFLOW, "utf8");
  const uncommented = text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  const job = workflowJobs(WORKFLOW).find((j) => j.jobId === "recheck");

  it("fires on the snapshot publish, by that workflow's exact name", () => {
    // A renamed or mistyped name means workflow_run never fires, silently.
    assert.match(uncommented, /workflows: \["Migration snapshot"\]\n {4}types: \[completed\]/);
    assert.match(readFileSync(join(WORKFLOWS, "migration-snapshot.yml"), "utf8"), /^name: Migration snapshot$/m);
    // ...and the snapshot still follows each staging deploy.
    assert.match(readFileSync(join(WORKFLOWS, "migration-snapshot.yml"), "utf8"), /workflows: \["Deploy staging"/);
  });

  it("re-runs the gate workflow the script names, by its file", () => {
    assert.match(readFileSync(join(WORKFLOWS, "migration-drift-gate.yml"), "utf8"), /^name: Migration drift gate$/m);
    assert.ok(readFileSync(join(WORKFLOWS, "deploy-staging.yml"), "utf8").length > 0);
  });

  it("acts only on a successful, deploy-driven publish in this repo", () => {
    assert.ok(job, "no recheck job");
    const cond = job.if.replace(/\s+/g, " ");
    assert.match(cond, /github\.event\.workflow_run\.conclusion == 'success'/);
    assert.match(cond, /github\.event\.workflow_run\.event == 'workflow_run'/);
    assert.match(cond, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
    assert.doesNotMatch(cond, /\|\|/);
  });

  it("holds only what a re-run needs: no App token, no environment, no other secret", () => {
    assert.match(uncommented, /^ {2}actions: write/m);
    assert.doesNotMatch(uncommented, /environment:/);
    assert.deepEqual([...uncommented.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]), ["GITHUB_TOKEN"]);
  });
});
