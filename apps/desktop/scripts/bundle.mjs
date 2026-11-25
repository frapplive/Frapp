// Bundles the compiled main process into one file (#4843).
//
// The packaged app carries no node_modules (electron-builder.yml `files`):
// in this monorepo electron-builder would otherwise walk up and pack the
// whole workspace's. The shell had no runtime dependency until
// `electron-updater`, so that library is compiled into `dist/main/index.js`
// here instead. `electron` itself is the runtime and stays an import. The
// preload is left as `tsc` wrote it: it imports nothing but `electron`.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist/main/index.js");

await build({
  entryPoints: [entry],
  outfile: entry,
  allowOverwrite: true,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  logLevel: "warning",
});
