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
  DEPLOYS,
  MAX_PRS,
  MAX_RUN_ATTEMPTS,
  SWEEP_BUDGET_MS,
  deployOutcome,
  newestRun,
  recoveredSince,
  screenRun,
  selectPrs,
  summaryMarkdown,
  sweep,
} from "../pr-recheck-after-deploy.mjs";

const REPO = "frapplive/Frapp";
const t = (hhmm) => Date.parse(`2026-11-24T${hhmm}:00Z`);
const iso = (hhmm) => new Date(t(hhmm)).toISOString();
// The snapshot this sweep was fired by started reading state at 12:00.
const SNAPSHOT = t("12:00");

const failedRun = (over = {}) => ({
  id: 101,
  status: "completed",
  conclusion: "failure",
  run_attempt: 1,
  head_sha: "aaa",
  head_repository: { full_name: REPO },
  created_at: iso("10:00"),
  run_started_at: iso("10:00"),
  ...over,
});

const pr = (number, sha, over = {}) => ({
  number,
  draft: false,
  state: "open",
  head: { sha, repo: { full_name: REPO } },
  ...over,
});

describe("screenRun", () => {
  it("passes a failed run below the cap", () => {
    assert.equal(screenRun(failedRun()).candidate, true);
  });

  it("leaves green, cancelled, running and missing runs alone", () => {
    for (const run of [
      failedRun({ conclusion: "success" }),
      failedRun({ conclusion: "cancelled" }),
      failedRun({ status: "in_progress", conclusion: null }),
      failedRun({ run_started_at: null }),
      null,
    ]) {
      assert.equal(screenRun(run).candidate, false);
    }
  });

  it("stops at the attempt cap", () => {
    assert.equal(MAX_RUN_ATTEMPTS, 3);
    assert.equal(screenRun(failedRun({ run_attempt: 2 })).candidate, true);
    assert.equal(screenRun(failedRun({ run_attempt: 3 })).candidate, false);
  });
});

describe("recoveredSince", () => {
  const stuckThenFixed = { staging: [{ ok: false, finishedMs: t("09:30") }, { ok: true, finishedMs: t("11:00") }], production: [] };

  it("re-runs a run that read a stuck deploy which has recovered since", () => {
    assert.equal(recoveredSince({ startedMs: t("10:00"), timelines: stuckThenFixed, snapshotStartedMs: SNAPSHOT }), "staging");
  });

  it("leaves a run that started while every deploy was green: red for its own reason", () => {
    const green = { staging: [{ ok: true, finishedMs: t("09:30") }, { ok: true, finishedMs: t("11:00") }], production: [] };
    assert.equal(recoveredSince({ startedMs: t("10:00"), timelines: green, snapshotStartedMs: SNAPSHOT }), null);
  });

  it("leaves a run that already started after the recovery: one re-run per recovery", () => {
    assert.equal(recoveredSince({ startedMs: t("11:05"), timelines: stuckThenFixed, snapshotStartedMs: SNAPSHOT }), null);
  });

  it("waits for a recovery the snapshot doesn't hold yet", () => {
    const late = { staging: [{ ok: false, finishedMs: t("09:30") }, { ok: true, finishedMs: t("12:10") }], production: [] };
    assert.equal(recoveredSince({ startedMs: t("10:00"), timelines: late, snapshotStartedMs: SNAPSHOT }), null);
  });

  it("needs the same environment to recover: a staging deploy doesn't fix stuck production", () => {
    const prodStuck = { staging: [{ ok: true, finishedMs: t("11:00") }], production: [{ ok: false, finishedMs: t("09:00") }] };
    assert.equal(recoveredSince({ startedMs: t("10:00"), timelines: prodStuck, snapshotStartedMs: SNAPSHOT }), null);
    prodStuck.production.push({ ok: true, finishedMs: t("11:30") });
    assert.equal(recoveredSince({ startedMs: t("10:00"), timelines: prodStuck, snapshotStartedMs: SNAPSHOT }), "production");
  });
});

describe("selection helpers", () => {
  it("judges a deploy by its deploy job, not the run", () => {
    const jobs = [
      { name: "deploy / deploy", conclusion: "success", completed_at: iso("11:00") },
      { name: "prune-vercel-staging", conclusion: "failure", completed_at: iso("11:02") },
    ];
    assert.deepEqual(deployOutcome(jobs, "deploy / deploy"), { ok: true, finishedMs: t("11:00") });
    assert.equal(deployOutcome([{ name: "deploy / deploy", conclusion: "skipped", completed_at: iso("11:00") }], "deploy / deploy"), null);
    assert.equal(deployOutcome([], "deploy / deploy"), null);
  });

  it("skips drafts and fork heads", () => {
    const prs = [pr(1, "a"), pr(2, "b", { draft: true }), pr(3, "c", { head: { sha: "c", repo: { full_name: "x/fork" } } })];
    assert.deepEqual(selectPrs(prs, REPO).map((p) => p.number), [1]);
  });

  it("takes this repo's newest gate run on a head, never a fork's at the same SHA", () => {
    const runs = [
      failedRun({ id: 1, created_at: iso("09:00") }),
      failedRun({ id: 2, created_at: iso("10:00") }),
      failedRun({ id: 3, created_at: iso("10:30"), head_repository: { full_name: "x/fork" } }),
    ];
    assert.equal(newestRun(runs, REPO).id, 2);
    assert.equal(newestRun([], REPO), null);
  });
});

const STAGING_JOB = DEPLOYS.find((d) => d.env === "staging").job;

// Routes are matched in order by method and a substring of the URL, so the
// query strings the sweep depends on are part of each path.
function routes({ pulls, runsBySha, stagingJobs = [], prodJobs = [], heads = {}, rerunStatus = 201 }) {
  const deployRun = (id) => ({ id, status: "completed", conclusion: "success", created_at: iso("11:00") });
  return [
    { method: "GET", path: "/pulls?state=open&base=main&", body: pulls },
    ...Object.entries(heads).map(([number, sha]) => ({
      method: "GET",
      path: `/pulls/${number}`,
      body: { state: "open", head: { sha } },
    })),
    ...Object.entries(runsBySha).map(([sha, runs]) => ({
      method: "GET",
      path: `/actions/workflows/migration-drift-gate.yml/runs?event=pull_request&head_sha=${sha}&`,
      body: { workflow_runs: runs },
    })),
    {
      method: "GET",
      path: "/actions/workflows/deploy-staging.yml/runs?branch=main&status=completed&",
      body: { workflow_runs: stagingJobs.map((_, i) => deployRun(900 + i)) },
    },
    {
      method: "GET",
      path: "/actions/workflows/deploy-production.yml/runs?branch=main&status=completed&",
      body: { workflow_runs: prodJobs.map((_, i) => deployRun(800 + i)) },
    },
    ...stagingJobs.map((jobs, i) => ({ method: "GET", path: `/actions/runs/${900 + i}/jobs`, body: { jobs } })),
    ...prodJobs.map((jobs, i) => ({ method: "GET", path: `/actions/runs/${800 + i}/jobs`, body: { jobs } })),
    { method: "POST", path: "/rerun-failed-jobs", status: rerunStatus, body: {} },
  ];
}

const job = (conclusion, hhmm) => [{ name: STAGING_JOB, conclusion, completed_at: iso(hhmm) }];
// Newest first, as the API lists them: fixed at 11:00, stuck at 09:30.
const STUCK_THEN_FIXED = [job("success", "11:00"), job("failure", "09:30")];

describe("sweep", () => {
  it("re-runs only the runs that read the stuck state, failed jobs only, pull_request runs only", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      routes({
        pulls: [pr(10, "aaa"), pr(11, "bbb"), pr(12, "ccc")],
        heads: { 10: "aaa", 12: "ccc" },
        runsBySha: {
          aaa: [failedRun({ id: 501, head_sha: "aaa" })],
          bbb: [failedRun({ id: 502, head_sha: "bbb", conclusion: "success" })],
          ccc: [failedRun({ id: 503, head_sha: "ccc", run_started_at: iso("11:10") })],
        },
        stagingJobs: STUCK_THEN_FIXED,
      }),
    );
    const { results } = await sweep({ token: "t", repo: REPO, snapshotStartedMs: SNAPSHOT, fetchImpl, logger: quiet });
    const posts = calls.filter((c) => c.method === "POST");
    assert.deepEqual(posts.map((c) => c.url), [`https://api.github.com/repos/${REPO}/actions/runs/501/rerun-failed-jobs`]);
    assert.deepEqual(results.map((r) => [r.number, r.rerun]), [[10, true], [11, false], [12, false]]);
  });

  it("re-runs nothing when no deploy was stuck", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      routes({
        pulls: [pr(10, "aaa")],
        heads: { 10: "aaa" },
        runsBySha: { aaa: [failedRun({ id: 501 })] },
        stagingJobs: [job("success", "11:00"), job("success", "09:30")],
      }),
    );
    await sweep({ token: "t", repo: REPO, snapshotStartedMs: SNAPSHOT, fetchImpl, logger: quiet });
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  });

  it("reads no deploys when no PR has a failed gate", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      routes({ pulls: [pr(10, "aaa")], runsBySha: { aaa: [failedRun({ conclusion: "success" })] } }),
    );
    await sweep({ token: "t", repo: REPO, snapshotStartedMs: SNAPSHOT, fetchImpl, logger: quiet });
    assert.ok(!calls.some((c) => c.url.includes("deploy-")));
  });

  it("leaves a PR whose head moved since the list: re-running would cancel the new head's run", async () => {
    const { fetchImpl, calls } = makeFetchMock(
      routes({
        pulls: [pr(10, "aaa")],
        heads: { 10: "zzz" },
        runsBySha: { aaa: [failedRun({ id: 501 })] },
        stagingJobs: STUCK_THEN_FIXED,
      }),
    );
    const { results } = await sweep({ token: "t", repo: REPO, snapshotStartedMs: SNAPSHOT, fetchImpl, logger: quiet });
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);
    assert.match(results[0].reason, /head moved/);
  });

  it("logs a refused re-run and carries on", async () => {
    const { fetchImpl } = makeFetchMock(
      routes({
        pulls: [pr(10, "aaa"), pr(11, "bbb")],
        heads: { 10: "aaa", 11: "bbb" },
        runsBySha: { aaa: [failedRun({ id: 1, head_sha: "aaa" })], bbb: [failedRun({ id: 2, head_sha: "bbb" })] },
        stagingJobs: STUCK_THEN_FIXED,
        rerunStatus: 403,
      }),
    );
    const { results } = await sweep({ token: "t", repo: REPO, snapshotStartedMs: SNAPSHOT, fetchImpl, logger: quiet });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => !r.rerun && /HTTP 403/.test(r.reason)));
  });

  it("checks at most MAX_PRS PRs a sweep", async () => {
    const many = Array.from({ length: MAX_PRS + 5 }, (_, i) => pr(i + 1, `s${i}`));
    const { fetchImpl, calls } = makeFetchMock(routes({ pulls: many, runsBySha: {} }));
    await sweep({ token: "t", repo: REPO, snapshotStartedMs: SNAPSHOT, fetchImpl, logger: quiet });
    assert.equal(calls.filter((c) => c.url.includes("migration-drift-gate.yml/runs")).length, MAX_PRS);
  });

  it("starts no new PR past its time budget, so it ends before the job's timeout", async () => {
    let clock = 0;
    const now = () => clock;
    const { fetchImpl, calls } = makeFetchMock(routes({ pulls: [pr(1, "a"), pr(2, "b")], runsBySha: {} }));
    const slow = async (url, init) => {
      if (url.includes("migration-drift-gate.yml/runs")) clock += SWEEP_BUDGET_MS + 1;
      return fetchImpl(url, init);
    };
    const { results } = await sweep({ token: "t", repo: REPO, snapshotStartedMs: SNAPSHOT, fetchImpl: slow, logger: quiet, now });
    assert.equal(calls.filter((c) => c.url.includes("migration-drift-gate.yml/runs")).length, 1);
    assert.match(results.find((r) => r.number === 2).reason, /out of time/);
  });

  it("writes a summary either way", () => {
    assert.match(summaryMarkdown({ skipped: "pulls-unreadable", results: [] }), /Nothing re-run/);
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
  });

  it("names each deploy job as the jobs API does: `<caller job name> / <called job id>`", () => {
    // A renamed job would read as "never decided", so no deploy would ever
    // count as stuck or recovered, and nothing would be re-run, silently.
    const called = workflowJobs(join(WORKFLOWS, "_deploy.yml")).map((j) => j.jobId);
    assert.ok(called.includes("deploy"), "_deploy.yml's job is `deploy`");
    for (const { workflow, job: name } of DEPLOYS) {
      const caller = workflowJobs(join(WORKFLOWS, workflow)).find((j) => j.jobId === "deploy");
      assert.ok(caller, `${workflow} has a deploy job`);
      assert.equal(caller.keys.get("uses"), "./.github/workflows/_deploy.yml");
      const callerName = caller.keys.get("name") ?? "deploy";
      assert.equal(name, `${callerName} / deploy`);
    }
    assert.match(readFileSync(join(WORKFLOWS, "migration-snapshot.yml"), "utf8"), /workflows: \["Deploy staging", "Deploy production"\]/);
  });

  it("hands the script the snapshot's start, which the whole rule turns on", () => {
    assert.match(uncommented, /SNAPSHOT_RUN_STARTED_AT: \$\{\{ github\.event\.workflow_run\.run_started_at \}\}/);
  });

  it("gives a completion it will skip a group of its own, so it can't cancel a running sweep", () => {
    const group = /^ {2}group: (.+)$/m.exec(uncommented)?.[1] ?? "";
    assert.match(group, /github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.event == 'workflow_run'/);
    assert.match(group, /format\('pr-recheck-after-deploy-skip-\{0\}', github\.run_id\)/);
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
