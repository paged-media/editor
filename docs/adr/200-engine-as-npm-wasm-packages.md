# ADR 200 — The engine is consumed as published npm wasm packages

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/client` (`package.json`, `src/protocol.ts`), `apps/canvas/src/worker/worker.ts`, `apps/devtools/src/inspector.ts`, `.github/workflows/protocol-version.yml`

## Context

The engine is a Rust workspace in another repository, `paged-media/core`. The editor needs its
wasm binary, the wasm-bindgen loader and TypeScript declarations of the wire types.

Until 2026-06-07 the editor produced these itself. Two `build-wasm.sh` scripts compiled the
wasm from a core checkout into `src/wasm/` directories, the generated `.d.ts` was tracked
"so PR diffs show wire-format / protocol changes", and a CI workflow rebuilt the wasm and
failed on a diff. `README.md:61-72` and `README.md:88-114` still describe that arrangement.
Commits `2f0a94f`, `1b4ddda` and `209dc1f` removed it. The repository names the change
"Decision B" (`CLAUDE.md:59`).

The files that state the rule give its effect: "`pnpm install` suffices; there is no
build-from-core step" (`CONTRIBUTING.md:28-29`), and in CI "no `core` checkout, no
build-from-source bridge" (`.github/workflows/tests.yml:5-7`). An argument for a package
boundary over the source build is not written down. The repository does not record why.

After the change the protocol number was still a hand-kept constant in `protocol.ts`, with a
script that compared it to the installed package. Commit `432c999` (2026-10-01) removed both
and states the reason: the package version already is the protocol, so "moving the engine
pin is the whole protocol bump on this side".

## Decision

The editor takes the engine only as the published packages `@paged-media/canvas-wasm` and
`@paged-media/introspect-wasm`, at exact version pins. The wasm, the loader and the generated
declarations are not tracked in this repository.

- Three manifests pin the same version, `0.64.0` at this commit: `packages/client` and
  `apps/canvas` pin `canvas-wasm`; `apps/devtools` pins `introspect-wasm`.
- `packages/client/src/protocol.ts` declares no wire type of its own: its one type export
  block re-exports from `@paged-media/canvas-wasm`, and its header forbids hand-written types.
- `PROTOCOL_VERSION` is computed. `protocol.ts` imports the installed package's `package.json`
  and takes the minor of its `0.<protocol>.<patch>` version; `protocolFromVersion` throws when
  the minor is not an integer. The comment gives the reason for a JSON import: "The main
  thread needs the value without loading the wasm".
- The worker imports the loader dynamically and hands it the wasm through an explicit `?url`
  import, because the loader's default resolves a path inside `node_modules` that Vite does
  not rewrite for worker chunks. `apps/devtools` does the same.
- After the wasm loads, the worker compares its `protocolVersion` with `PROTOCOL_VERSION` and
  posts a `protocolMismatch` warning when they differ. The worker itself continues its
  start-up; `CanvasClient` on the main thread turns the warning into a fatal state in which
  every pending and every later request is rejected.

## Evidence

- `packages/client/package.json:54`, `apps/canvas/package.json:28`, `apps/devtools/package.json:13` — the three exact pins
- `packages/client/src/protocol.ts:20-31`, `:55-172` — the re-export rule and the single re-export block
- `packages/client/src/protocol.ts:33-53` — `PROTOCOL_VERSION` read from the package version; the throw
- `apps/canvas/src/worker/worker.ts:66-76`, `:264-287` — the `?url` asset, the dynamic import, the version comparison
- `apps/devtools/src/inspector.ts:28-51` — the same loading pattern for `introspect-wasm`
- `packages/client/src/client.ts:1513-1527` — `protocolMismatch` rejects every request
- `.github/workflows/protocol-version.yml:3-13`, `:46-48` — what the workflow used to check and why no check is left
- `CONTRIBUTING.md:23-29` — the rule as stated to contributors

## Alternatives considered

- **Build from a core checkout, with the `.d.ts` tracked.** Removed on 2026-06-07.
- **A hand-kept `PROTOCOL_VERSION` plus a comparison script.** In place until `432c999`.

## Consequences

The applications build from a fresh clone with `pnpm install`; no Rust toolchain and no core
checkout are involved. An engine change reaches the editor only after core publishes a
release, and the three pins then move together. A locally built engine package must carry a
`0.<protocol>.<patch>` version, or the number read from it is wrong and the handshake fails.

The test lanes are not free of core. `.github/workflows/tests.yml:298-301` checks core out to
build a fixture generator, and `.github/workflows/showcase-nightly.yml:4-9` reintroduces a
sibling core checkout on purpose. Both use it for test fixtures, not for the engine wasm.

Several texts contradict the code. `README.md` describes the removed build, says the package
boundary "is not yet wired" (`:113`) and that the worker "warns on drift" (`:72`), and calls
`packages/client` the only thing that touches the engine (`:61`), although `apps/canvas`
depends on the package directly and its worker imports it. The root `package.json:10` keeps
a `wasm` script that fans out to per-app scripts that no longer exist. `CLAUDE.md:76-77`
still tells the reader to bump `PROTOCOL_VERSION`.
`apps/canvas/src/panels/cockpit/separations-wire.ts:26-36` re-exports two wire types outside
`protocol.ts` and explains this by a local `PROTOCOL_VERSION` override that no longer exists.

## Related

- [ADR 006](https://github.com/paged-media/core/blob/main/docs/adr/006-protocol-coupled-versioning.md), [ADR 115](https://github.com/paged-media/core/blob/main/docs/adr/115-worker-boundary-transports.md) — the `0.<protocol>.<patch>` version scheme this reads; the engine side of the handshake
- [ADR 201](201-plugins-as-pinned-packages.md), [ADR 202](202-render-worker-owns-the-canvas.md) — the same boundary for plugin bundles; the worker that loads the package
- [ADR 302](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/302-vendored-wire-types.md) — the plugin contract's own copy of the wire types
