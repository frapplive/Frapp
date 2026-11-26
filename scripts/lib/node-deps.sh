#!/usr/bin/env bash
# Whether this checkout's node_modules can run the repo's gates. Sourced, not executed: by
# scripts/lib/cloud-sandbox-common.sh (bringup's closing toolchain check) and by
# .claude/hooks/session-start.sh (which repairs the tree before bringup starts). One rule for
# both, so the hook repairs exactly the tree bringup would report as `(dependencies)`.

# Does `node_modules/.bin/turbo` under $1 actually run? `check-types`, `lint` and every
# workspace test are `turbo run ...`, so without it none of them can start. It runs turbo
# rather than only stat-ing it: `-x` follows the symlink, so it covers the absent and dangling
# cases, but not a target that exists and does not work (measured: with
# `node_modules/turbo/bin/turbo` replaced by executable garbage, `-x` still passes and only
# the `--version` run catches it).
node_deps_turbo_runs() {
  local root="${1:-$PWD}"
  [ -x "$root/node_modules/.bin/turbo" ] \
    && "$root/node_modules/.bin/turbo" --version >/dev/null 2>&1
}

# Take turns at repairing the tree: a flock on file $1, on fd 8; node_deps_unguard releases it.
# Two session starts at once would otherwise run two `npm ci` over one node_modules. Unlike
# bringup_guard (scripts/lib/bringup-lock.sh), the caller needs to know how it got the turn:
#   0  at once, or flock is missing (nothing is serialized): this caller may repair
#   2  after waiting for another holder: that one already tried, so this caller must not
#   1  not within $2 seconds: another holder is still at it, so this caller must not
node_deps_guard() {
  command -v flock >/dev/null 2>&1 || return 0
  { exec 8>>"$1"; } 2>/dev/null || return 0
  flock -n 8 2>/dev/null && return 0
  flock -w "$2" 8 2>/dev/null && return 2
  return 1
}

node_deps_unguard() {
  exec 8>&-
}
