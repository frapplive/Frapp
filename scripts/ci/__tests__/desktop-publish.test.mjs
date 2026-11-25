import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PREFIX,
  SERVED_FILE,
  assertVersion,
  channelFeedName,
  feedFiles,
  feedVersion,
  parseArgs,
  point,
  release,
  releasePlan,
  withStaging,
} from "../desktop-publish.mjs";

const WIN_FEED = `version: 0.2.0
files:
  - url: Frapp-Setup-0.2.0.exe
    sha512: abc==
    size: 100
path: Frapp-Setup-0.2.0.exe
sha512: abc==
releaseDate: '2026-11-25T00:00:00.000Z'
`;
const MAC_FEED = `version: 0.2.0
files:
  - url: Frapp-0.2.0-universal-mac.zip
    sha512: def==
    size: 200
path: Frapp-0.2.0-universal-mac.zip
sha512: def==
releaseDate: '2026-11-25T00:00:00.000Z'
`;
const FILES = [
  "Frapp-Setup-0.2.0.exe",
  "Frapp-Setup-0.2.0.exe.blockmap",
  "Frapp-0.2.0-universal-mac.zip",
  "Frapp-0.2.0-universal-mac.zip.blockmap",
  "Frapp-0.2.0-universal.dmg",
  "latest.yml",
  "latest-mac.yml",
  "builder-debug.yml",
];
const read = (file) => (file.endsWith("latest-mac.yml") ? MAC_FEED : WIN_FEED);

test("a feed's version and files are read from its own lines", () => {
  assert.equal(feedVersion(WIN_FEED), "0.2.0");
  assert.deepEqual(feedFiles(WIN_FEED), ["Frapp-Setup-0.2.0.exe"]);
  assert.throws(() => feedVersion("files: []\n"), /no version/);
});

test("only a plain version is published: a channel is a feed, not a suffix", () => {
  assert.equal(assertVersion("0.2.0"), "0.2.0");
  for (const bad of ["0.2.0-beta.1", "v0.2.0", "", undefined, "0.2"]) {
    assert.throws(() => assertVersion(bad), /plain version/);
  }
});

test("each channel reads its own feed per OS", () => {
  assert.equal(channelFeedName("latest.yml", "beta"), "beta.yml");
  assert.equal(channelFeedName("latest-mac.yml", "beta"), "beta-mac.yml");
  assert.equal(channelFeedName("latest-mac.yml", "latest"), "latest-mac.yml");
  assert.throws(() => channelFeedName("latest.yml", "nightly"), /not a channel/);
  assert.throws(() => channelFeedName("builder-debug.yml", "beta"), /not a feed/);
});

test("a staged feed carries the percentage, and a full one drops it", () => {
  const staged = withStaging(WIN_FEED, 20);
  assert.match(staged, /\nstagingPercentage: 20\n$/);
  assert.equal(withStaging(staged, 100), WIN_FEED);
  assert.equal(withStaging(staged, null), WIN_FEED);
  assert.equal(withStaging(staged, 50).match(/stagingPercentage/g).length, 1);
  assert.throws(() => withStaging(WIN_FEED, 0), /whole number/);
  assert.throws(() => withStaging(WIN_FEED, Number.NaN), /whole number/);
});

test("a release uploads files before feeds, keeps its feeds, and lands on beta only", () => {
  const { version, steps } = releasePlan({ dir: "/out", files: FILES, read });
  assert.equal(version, "0.2.0");
  const targets = steps.map((step) => step.to);
  assert.deepEqual(targets, [
    "desktop/Frapp-0.2.0-universal-mac.zip",
    "desktop/Frapp-0.2.0-universal.dmg",
    "desktop/Frapp-Setup-0.2.0.exe",
    "desktop/feeds/0.2.0/latest.yml",
    "desktop/feeds/0.2.0/latest-mac.yml",
    "desktop/beta.yml",
    "desktop/beta-mac.yml",
  ]);
  // Nothing a member's app reads by default moves on a release.
  assert.ok(!targets.includes("desktop/latest.yml"));
  // Blockmaps serve partial downloads, which the app has turned off.
  assert.ok(!targets.some((target) => target.endsWith(".blockmap")));
  // Published files and kept feeds are never replaced; the channel feed is.
  assert.ok(steps.slice(0, 5).every((step) => step.noClobber));
  assert.ok(steps.slice(5).every((step) => !step.noClobber && step.cacheControl.startsWith("no-cache")));
});

test("a release folder missing a feed, a named file, or agreement on the version is refused", () => {
  assert.throws(() => releasePlan({ dir: "/out", files: ["latest.yml"], read }), /needs latest.yml and latest-mac.yml/);
  assert.throws(
    () => releasePlan({ dir: "/out", files: FILES.filter((name) => name !== "Frapp-Setup-0.2.0.exe"), read }),
    /lacks: Frapp-Setup-0.2.0.exe/,
  );
  assert.throws(
    () =>
      releasePlan({
        dir: "/out",
        files: FILES,
        read: (file) => (file.endsWith("mac.yml") ? MAC_FEED.replace("0.2.0", "0.3.0") : WIN_FEED),
      }),
    /disagree/,
  );
});

test("release refuses a version that is already published", async () => {
  const calls = [];
  const gcloud = async (args) => {
    calls.push(args);
    return args[0] === "ls" ? "gs://b/desktop/feeds/0.2.0/latest.yml\n" : "";
  };
  await assert.rejects(
    release({ bucket: "b", dir: "/out", gcloud, log: () => {}, list: () => FILES, read }),
    /already published/,
  );
  assert.equal(calls.filter((args) => args[0] === "cp").length, 0);
});

// A second build of one version is signed again, so its bytes differ from the
// files a dead run left: new feeds over old files would fail every download.
test("release refuses a version an earlier run left half uploaded", async () => {
  const calls = [];
  const gcloud = async (args) => {
    calls.push(args);
    return args[0] === "ls" ? "gs://b/desktop/Frapp-Setup-0.2.0.exe\ngs://b/desktop/latest.yml\n" : "";
  };
  await assert.rejects(
    release({ bucket: "b", dir: "/out", gcloud, log: () => {}, list: () => FILES, read }),
    /earlier run left part of Frapp 0\.2\.0 in the bucket \(desktop\/Frapp-Setup-0\.2\.0\.exe\)/,
  );
  assert.equal(calls.filter((args) => args[0] === "cp").length, 0);
});

test("release stops when it cannot list the bucket, and uploads nothing", async () => {
  const calls = [];
  const gcloud = async (args) => {
    calls.push(args);
    if (args[0] === "ls") throw Object.assign(new Error("Command failed"), { stderr: "ERROR: 403 forbidden" });
    return "";
  };
  await assert.rejects(
    release({ bucket: "b", dir: "/out", gcloud, log: () => {}, list: () => FILES, read }),
    /Command failed/,
  );
  assert.equal(calls.filter((args) => args[0] === "cp").length, 0);
});

test("release uploads the plan with gcloud, never overwriting a published file", async () => {
  const calls = [];
  const gcloud = async (args) => {
    calls.push(args);
    // An empty prefix is an error to gcloud, on stderr.
    if (args[0] === "ls") {
      throw Object.assign(new Error("Command failed"), { stderr: "ERROR: One or more URLs matched no objects." });
    }
    return "";
  };
  const version = await release({ bucket: "b", dir: "/out", gcloud, log: () => {}, list: () => FILES, read });
  assert.equal(version, "0.2.0");
  const copies = calls.filter((args) => args[0] === "cp");
  assert.equal(copies.length, 7);
  assert.deepEqual(copies[2], [
    "cp",
    "/out/Frapp-Setup-0.2.0.exe",
    "gs://b/desktop/Frapp-Setup-0.2.0.exe",
    "--no-clobber",
  ]);
  assert.deepEqual(copies[6].slice(2), [
    "gs://b/desktop/beta-mac.yml",
    "--cache-control=no-cache, max-age=0",
    "--content-type=text/yaml",
  ]);
});

test("point copies a published version's kept feeds onto a channel, staged when asked", async () => {
  const written = [];
  const gcloud = async (args) => {
    if (args[0] === "cat") return args[1].endsWith("mac.yml") ? MAC_FEED : WIN_FEED;
    // The staged file is gone once point returns, so read it as it is uploaded.
    written.push({ to: args[2], text: readFileSync(args[1], "utf8") });
    return "";
  };
  await point({ bucket: "b", channel: "latest", version: "0.2.0", staging: 20, gcloud, log: () => {} });
  assert.deepEqual(
    written.map((upload) => upload.to),
    ["gs://b/desktop/latest.yml", "gs://b/desktop/latest-mac.yml"],
  );
  assert.equal(written[0].text, `${WIN_FEED}stagingPercentage: 20\n`);
  assert.equal(written[1].text, `${MAC_FEED}stagingPercentage: 20\n`);
});

test("point at beta writes the beta feeds, whole", async () => {
  const written = [];
  const gcloud = async (args) => {
    if (args[0] === "cat") return args[1].endsWith("mac.yml") ? MAC_FEED : WIN_FEED;
    written.push({ to: args[2], text: readFileSync(args[1], "utf8") });
    return "";
  };
  await point({ bucket: "b", channel: "beta", version: "0.2.0", staging: null, gcloud, log: () => {} });
  assert.deepEqual(
    written.map((upload) => upload.to),
    ["gs://b/desktop/beta.yml", "gs://b/desktop/beta-mac.yml"],
  );
  assert.equal(written[0].text, WIN_FEED);
});

// Windows and Mac installs must never end up on different versions.
test("point writes neither feed when the version lacks one", async () => {
  const written = [];
  const gcloud = async (args) => {
    if (args[0] === "cat") {
      if (args[1].endsWith("mac.yml")) throw new Error("matched no objects");
      return WIN_FEED;
    }
    written.push(args);
    return "";
  };
  await assert.rejects(
    point({ bucket: "b", channel: "latest", version: "0.2.0", staging: null, gcloud, log: () => {} }),
    /matched no objects/,
  );
  assert.equal(written.length, 0);
});

test("point refuses a version whose kept feed names another", async () => {
  const gcloud = async () => WIN_FEED;
  await assert.rejects(
    point({ bucket: "b", channel: "latest", version: "0.1.0", staging: null, gcloud, log: () => {} }),
    /names another version/,
  );
});

test("arguments are --name value pairs after the action", () => {
  assert.deepEqual(parseArgs(["point", "--channel", "latest", "--version", "0.2.0"]), {
    action: "point",
    options: { channel: "latest", version: "0.2.0" },
  });
  assert.throws(() => parseArgs(["point", "latest"]), /Unreadable/);
});

// The bucket and prefix are written in places that can't import each other:
// this script's workflow, the script, the Cloud Shell setup, and the API route
// that hands installed apps their links.
test("the workflow, this script and the API name the same bucket and prefix", () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const api = readFileSync(join(repo, "apps/api/src/domain/constants/desktop-updates.ts"), "utf8");
  const workflow = readFileSync(join(repo, ".github/workflows/desktop-release.yml"), "utf8");
  const builder = readFileSync(join(repo, "apps/desktop/electron-builder.yml"), "utf8");
  const controller = readFileSync(join(repo, "apps/api/src/interface/controllers/desktop-update.controller.ts"), "utf8");
  const bucket = /^export const DESKTOP_RELEASES_BUCKET = '([^']+)';$/m.exec(api)?.[1];
  assert.ok(bucket, "the API constant names a bucket");
  assert.match(workflow, new RegExp(`^  DESKTOP_BUCKET: ${bucket}$`, "m"));
  const gcp = readFileSync(join(repo, "scripts/gcp/lib.sh"), "utf8");
  assert.match(gcp, new RegExp(`^DESKTOP_RELEASES_BUCKET="${bucket}"$`, "m"));
  assert.equal(/^export const DESKTOP_RELEASES_PREFIX = '([^']+)';$/m.exec(api)?.[1], PREFIX);
  assert.ok(api.includes(`const RELEASE_FILE = ${SERVED_FILE};`), "the API's file-name rule is SERVED_FILE");
  // Only the release workflow gives a build its update address (an unsigned
  // CI build gets none and never updates), and it is the API route in front
  // of that bucket.
  assert.match(builder, /^publish: null$/m);
  assert.match(workflow, /^  DESKTOP_UPDATE_URL: https:\/\/api\.frapp\.live\/v1\/desktop\/updates$/m);
  assert.match(controller, /@Controller\(['"]desktop\/updates['"]\)/);
});

test("a release with a file the API would not serve is refused", () => {
  const files = FILES.map((name) => name.replace("Frapp-0.2.0-universal.dmg", "Frapp 0.2.0.dmg"));
  assert.throws(() => releasePlan({ dir: "/out", files, read }), /serves no file named like Frapp 0\.2\.0\.dmg/);
});
