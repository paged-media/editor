#!/usr/bin/env bash
# Protocol-version drift check — Decision-B package-boundary model.
#
# BEFORE the flip the editor vendored the tsify `.d.ts` and CI rebuilt
# the wasm from a sibling `core` checkout, diffing the regenerated
# `.d.ts` to catch wire-format drift. AFTER the flip the wire types and
# the engine wasm ship in the published `@paged-media/canvas-wasm`
# package, so there is no local `.d.ts` to regenerate. The drift signal
# is now purely static and dependency-based:
#
#   * `packages/client/src/protocol.ts` declares the TS-side
#     `PROTOCOL_VERSION` constant (a runtime value the worker stamps on
#     every outgoing envelope).
#   * `@paged-media/canvas-wasm` is versioned by the protocol-coupled
#     convention `0.<protocol>.<patch>` (the engine's
#     `paged-canvas/src/channel.rs` const is the source of truth and the
#     release minor mirrors it).
#
# This script asserts those two agree: the MINOR of the installed
# canvas-wasm package version must equal `PROTOCOL_VERSION`. A bump to
# one without the other — e.g. pinning a new canvas-wasm release that
# changed the wire format without re-exporting/retesting the TS side —
# trips here on PRs.
#
# (Runtime drift is still defended at worker startup: `worker.ts`
# compares `CanvasWorker.protocolVersion` from the wasm against
# `PROTOCOL_VERSION` and fires a `protocolMismatch` warning. This script
# is the static, CI-time guard that catches the mismatch before a human
# ever loads the editor.)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTOCOL_TS="$ROOT/packages/client/src/protocol.ts"

# TS-side constant: `export const PROTOCOL_VERSION = 33 as const;`
TS_VERSION="$(grep -oE 'PROTOCOL_VERSION[[:space:]]*=[[:space:]]*[0-9]+' "$PROTOCOL_TS" \
  | grep -oE '[0-9]+$')"
if [ -z "${TS_VERSION:-}" ]; then
  echo "::error::could not read PROTOCOL_VERSION from $PROTOCOL_TS" >&2
  exit 1
fi

# Installed package version. Resolve the package.json from client's
# node_modules so we check what is actually installed, not just the pin
# string in package.json (they should match, but the lockfile/registry
# is what ships).
PKG_JSON="$(node -e "process.stdout.write(require.resolve('@paged-media/canvas-wasm/package.json', { paths: ['$ROOT/packages/client', '$ROOT'] }))" 2>/dev/null || true)"
if [ -z "${PKG_JSON:-}" ]; then
  echo "::error::@paged-media/canvas-wasm is not installed — run pnpm install first" >&2
  exit 1
fi
PKG_VERSION="$(node -e "process.stdout.write(require('$PKG_JSON').version)")"
# Strip any prerelease/build suffix (e.g. 0.33.0-dry.0 -> 0.33.0), then
# take the minor.
PKG_MINOR="$(echo "${PKG_VERSION%%-*}" | cut -d. -f2)"

echo "protocol.ts PROTOCOL_VERSION = $TS_VERSION"
echo "@paged-media/canvas-wasm     = $PKG_VERSION  (minor = $PKG_MINOR)"

if [ "$TS_VERSION" != "$PKG_MINOR" ]; then
  echo "::error::protocol drift — protocol.ts is v$TS_VERSION but the" \
       "installed @paged-media/canvas-wasm is v$PKG_VERSION (protocol" \
       "minor $PKG_MINOR). Bump the canvas-wasm pin to a 0.$TS_VERSION.x" \
       "release, or update PROTOCOL_VERSION + the re-exports in" \
       "protocol.ts to match the package." >&2
  exit 1
fi

echo "OK — protocol.ts and @paged-media/canvas-wasm agree on protocol v$TS_VERSION"
