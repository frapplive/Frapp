#!/usr/bin/env node

// Puts a desktop release's files where installed apps look for them, and
// moves the update feeds between versions (#4843, ADR-29 decision 8).
//
// Everything lives under one prefix of one private bucket
// (scripts/gcp/desktop-downloads.sh). Installed apps reach it through the
// API's `GET /v1/desktop/updates/:file`, which redirects to a time-limited
// link (apps/api/src/domain/constants/desktop-updates.ts names the same
// bucket and prefix):
//
//   desktop/Frapp-Setup-0.2.0.exe, Frapp-0.2.0-universal.dmg, ...  the files
//   desktop/feeds/0.2.0/latest.yml, latest-mac.yml                 that release's feeds, kept
//   desktop/beta.yml,   beta-mac.yml                               what beta apps read
//   desktop/latest.yml, latest-mac.yml                             what every other app reads
//
// A feed names its files by bare filename, so it resolves beside itself. Two
// actions:
//
//   release  uploads the signed files (never over an existing one: a version
//            is published once), keeps the release's feeds, and points the
//            beta channel at it.
//   point    points a channel at a version already published, from its kept
//            feeds. That is the promotion to everyone (same files, nothing
//            rebuilt or signed again) and also how a bad release is pulled:
//            point the channel back at the one before. `--staging` offers it
//            to that percentage of installs first.
//
// The uploads go through `gcloud storage`, which the runner has, signed in as
// the production project's deployer with the job's OIDC token and no key
// (lib/gcp.mjs). The token is handed to gcloud in the child's environment
// only.
//
// Env inputs:
//   DESKTOP_BUCKET          required; the bucket's name
//   CLOUD_RUN_PROVIDER      required; the workload identity provider
//   CLOUD_RUN_DEPLOYER      required; the account to act as
//   DESKTOP_RELEASE_DIR     release only; electron-builder's output, every OS's files together
//
// Usage:
//   node scripts/ci/desktop-publish.mjs release
//   node scripts/ci/desktop-publish.mjs point --channel latest --version 0.2.0 [--staging 20]
//
// Unit tests: `scripts/ci/__tests__/desktop-publish.test.mjs`.

import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { requireEnv } from "./lib/env.mjs";
import { deployerAccessToken } from "./lib/gcp.mjs";
import { isInvokedDirectly } from "./lib/invoked-directly.mjs";

export const PREFIX = "desktop";
/** The channels an installed app can read (apps/desktop/src/shared/update-policy.ts). */
export const CHANNELS = ["latest", "beta"];
/** The feed files electron-builder writes, one per OS that updates itself. */
export const FEED_FILES = ["latest.yml", "latest-mac.yml"];

/** A feed is re-read on every check, so nothing may keep a copy. */
const FEED_CACHE = "no-cache, max-age=0";

const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * The file names the API will hand a link out for (`RELEASE_FILE` in
 * apps/api/src/domain/constants/desktop-updates.ts; the test holds the two
 * together). A file named any other way would upload fine and then answer
 * 404 to every installed app, so a release that has one stops here.
 */
export const SERVED_FILE = /^Frapp-[A-Za-z0-9.-]{1,60}\.(exe|dmg|zip)$/;

/** A plain `1.2.3`: channels are feeds here, never version suffixes. */
export function assertVersion(version) {
  if (!VERSION.test(version ?? "")) {
    throw new Error(`"${version}" is not a plain version like 0.2.0.`);
  }
  return version;
}

/** The `version:` a feed names. */
export function feedVersion(text) {
  const match = /^version:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(text);
  if (!match) throw new Error("The feed has no version line.");
  return match[1];
}

/** Every file a feed tells an app to download. */
export function feedFiles(text) {
  const names = new Set();
  for (const match of text.matchAll(/^\s*(?:-\s+)?(?:url|path):\s*['"]?([^'"\s]+)['"]?\s*$/gm)) {
    names.add(match[1]);
  }
  return [...names];
}

/** The feed a channel reads on an OS: `latest-mac.yml` becomes `beta-mac.yml`. */
export function channelFeedName(feedFile, channel) {
  if (!FEED_FILES.includes(feedFile)) throw new Error(`${feedFile} is not a feed file.`);
  if (!CHANNELS.includes(channel)) throw new Error(`"${channel}" is not a channel (${CHANNELS.join(", ")}).`);
  return feedFile.replace(/^latest/, channel);
}

/**
 * A feed offered to `percentage` of installs (electron-updater's
 * `stagingPercentage`), or to all of them when it is null or 100.
 */
export function withStaging(text, percentage) {
  const without = text.replace(/^stagingPercentage:.*\n?/gm, "");
  if (percentage === null || percentage === 100) return without;
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 99) {
    throw new Error(`--staging takes a whole number from 1 to 100, not "${percentage}".`);
  }
  return `${without.replace(/\n*$/, "\n")}stagingPercentage: ${percentage}\n`;
}

/**
 * What a release uploads, in order: files first, feeds last, so no app is
 * ever told about a file that isn't there yet.
 */
export function releasePlan({ dir, files, read }) {
  const feeds = FEED_FILES.filter((name) => files.includes(name));
  if (feeds.length !== FEED_FILES.length) {
    throw new Error(`The release folder needs ${FEED_FILES.join(" and ")}; it has ${feeds.join(", ") || "neither"}.`);
  }
  const texts = new Map(feeds.map((name) => [name, read(path.join(dir, name))]));
  const versions = new Set([...texts.values()].map(feedVersion));
  if (versions.size !== 1) {
    throw new Error(`The feeds disagree on the version: ${[...versions].join(", ")}.`);
  }
  const version = assertVersion([...versions][0]);

  const needed = new Set();
  for (const text of texts.values()) for (const name of feedFiles(text)) needed.add(name);
  const missing = [...needed].filter((name) => !files.includes(name));
  if (missing.length > 0) throw new Error(`The feeds name files the release folder lacks: ${missing.join(", ")}.`);
  // The installer people download by hand (the dmg) rides along though no
  // feed names it. Blockmaps are left behind: they serve partial downloads,
  // which the app has turned off (apps/desktop/src/main/updater.ts).
  const extras = files.filter((name) => name.endsWith(".dmg") && !needed.has(name));

  const unserved = [...needed, ...extras].filter((name) => !SERVED_FILE.test(name));
  if (unserved.length > 0) {
    throw new Error(`The API serves no file named like ${unserved.join(", ")}; see SERVED_FILE.`);
  }

  const steps = [];
  for (const name of [...needed, ...extras].sort()) {
    steps.push({ from: path.join(dir, name), to: `${PREFIX}/${name}`, noClobber: true });
  }
  for (const name of feeds) {
    steps.push({
      from: path.join(dir, name),
      to: `${PREFIX}/feeds/${version}/${name}`,
      cacheControl: FEED_CACHE,
      noClobber: true,
    });
  }
  for (const name of feeds) {
    steps.push({
      from: path.join(dir, name),
      to: `${PREFIX}/${channelFeedName(name, "beta")}`,
      cacheControl: FEED_CACHE,
      noClobber: false,
    });
  }
  return { version, steps };
}

/** `--name value` pairs after the action. */
export function parseArgs(argv) {
  const [action, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i];
    if (!name?.startsWith("--") || rest[i + 1] === undefined) throw new Error(`Unreadable argument: ${name}`);
    options[name.slice(2)] = rest[i + 1];
  }
  return { action, options };
}

const run = promisify(execFile);

function gcloudFor({ token, exec = run }) {
  const env = { ...process.env, CLOUDSDK_AUTH_ACCESS_TOKEN: token, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" };
  return async (args) => {
    const { stdout } = await exec("gcloud", ["storage", ...args], { env, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  };
}

async function upload(gcloud, bucket, step, log) {
  log(`${step.noClobber ? "upload" : "set"}  gs://${bucket}/${step.to}`);
  await gcloud([
    "cp",
    step.from,
    `gs://${bucket}/${step.to}`,
    ...(step.cacheControl ? [`--cache-control=${step.cacheControl}`] : []),
    ...(step.to.endsWith(".yml") ? ["--content-type=text/yaml"] : []),
    ...(step.noClobber ? ["--no-clobber"] : []),
  ]);
}

/**
 * Every object already under the prefix. An empty prefix is gcloud's "matched
 * no objects" error and means none; any other failure (sign-in, network) is
 * thrown, because "couldn't look" must never read as "nothing there".
 */
async function published(gcloud, bucket) {
  const root = `gs://${bucket}/`;
  try {
    const listing = await gcloud(["ls", `${root}${PREFIX}/**`]);
    return new Set(
      listing
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith(root))
        .map((line) => line.slice(root.length)),
    );
  } catch (error) {
    if (/matched no objects/i.test(`${error.stderr ?? ""} ${error.message ?? ""}`)) return new Set();
    throw error;
  }
}

/** Uploads a release folder and points the beta channel at it. */
export async function release({ bucket, dir, gcloud, log = console.log, list = readdirSync, read = readText }) {
  const { version, steps } = releasePlan({ dir, files: list(dir), read });
  const existing = await published(gcloud, bucket);
  // A version is published once: a second run must not swap files under
  // installs that already hold the first run's checksums.
  if ([...existing].some((object) => object.startsWith(`${PREFIX}/feeds/${version}/`))) {
    throw new Error(
      `Frapp ${version} is already published. Raise the version in apps/desktop/package.json and release that.`,
    );
  }
  // An earlier run that died partway left some of this version's files. A
  // new build of the same version is signed again, so its bytes and checksums
  // differ: keeping the old files under new feeds would fail every download.
  const leftover = steps.filter((step) => step.noClobber && existing.has(step.to)).map((step) => step.to);
  if (leftover.length > 0) {
    throw new Error(
      `An earlier run left part of Frapp ${version} in the bucket (${leftover.join(", ")}) and never finished. ` +
        "Raise the version in apps/desktop/package.json and release that.",
    );
  }
  for (const step of steps) await upload(gcloud, bucket, step, log);
  log(`Frapp ${version} is on the beta channel.`);
  return version;
}

/** Points a channel at a published version, optionally to a share of installs. */
export async function point({ bucket, channel, version, staging, gcloud, log = console.log, temp = tempDir }) {
  assertVersion(version);
  const dir = temp();
  try {
    // Both feeds are read and checked before either is written, so a version
    // missing one never leaves Windows and Mac installs on different versions.
    const steps = [];
    for (const name of FEED_FILES) {
      const text = await gcloud(["cat", `gs://${bucket}/${PREFIX}/feeds/${version}/${name}`]);
      if (feedVersion(text) !== version) throw new Error(`The kept ${name} for ${version} names another version.`);
      const file = path.join(dir, name);
      writeFileSync(file, withStaging(text, staging));
      steps.push({
        from: file,
        to: `${PREFIX}/${channelFeedName(name, channel)}`,
        cacheControl: FEED_CACHE,
        noClobber: false,
      });
    }
    for (const step of steps) await upload(gcloud, bucket, step, log);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  log(`The ${channel} channel offers Frapp ${version}${staging && staging !== 100 ? ` to ${staging}% of installs` : ""}.`);
}

const readText = (file) => readFileSync(file, "utf8");
const tempDir = () => mkdtempSync(path.join(tmpdir(), "desktop-feed-"));

async function main() {
  const { action, options } = parseArgs(process.argv.slice(2));
  if (action !== "release" && action !== "point") {
    throw new Error(`Unknown action "${action}". Use release or point.`);
  }
  const bucket = requireEnv("DESKTOP_BUCKET");
  const token = await deployerAccessToken({
    provider: requireEnv("CLOUD_RUN_PROVIDER"),
    serviceAccount: requireEnv("CLOUD_RUN_DEPLOYER"),
  });
  const gcloud = gcloudFor({ token });
  if (action === "release") {
    await release({ bucket, dir: requireEnv("DESKTOP_RELEASE_DIR"), gcloud });
    return;
  }
  const staging = options.staging === undefined || options.staging === "" ? null : Number(options.staging);
  await point({ bucket, channel: options.channel, version: options.version, staging, gcloud });
}

if (isInvokedDirectly(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
