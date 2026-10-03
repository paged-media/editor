# ADR 201 — First-party plugins are compiled in as pinned published packages

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `apps/canvas/package.json`, `packages/tools/package.json`, the root `package.json` overrides, `apps/canvas/src/main.tsx` (`PluginBundles`), `apps/canvas/src/plugin-load-guard.ts`, `scripts/check-plugin-pins.mjs`

## Context

The editor hosts eight first-party plugin bundles, developed in other repositories: `draw`,
`web`, `data`, `sheet`, `image`, `publish`, `pdf` and `doc`. It also needs the plugin
contract packages `@paged-media/plugin-api` and `@paged-media/plugin-sdk`.

The bundles were first consumed through pnpm `link:` dependencies into sibling checkouts.
Commit `999eeb7` (2026-06-22) moved `apps/canvas` and `packages/tools` to published packages
and gives the reason: each published bundle "ships its wasm, so the editor builds with a
plain `pnpm install`", and the playground deployment needs "no multi-repo checkout, no
Rust/wasm toolchain".

A pin can fall behind the plugin repository without any signal. The header of
`scripts/check-plugin-pins.mjs` records that six of eight bundles had done so by 2026-08-04:
a feature "can be built, tested and committed in a plugin repo and still be absent from the
running editor". The bundles are imported statically and run as modules of the
application. The repository does not record why they are compiled in and not loaded at run
time.

## Decision

Every plugin bundle and both contract packages are dependencies of `apps/canvas` at exact
canary versions. All of them are published except `@paged-media/doc` (see Consequences).
The application imports the eight bundles statically and activates them in one fixed order.

- `main.tsx` imports each bundle object by name and passes it to `loadBundle` from
  `@paged-media/plugin-sdk`, in the order draw, web, data, sheet, image, publish, pdf, doc.
  Nothing in `apps/canvas/src` discovers or fetches a bundle at run time.
- Each load call goes through `createGuardedLoader`, which catches a throw, records it in the
  journal and the Problems panel, and returns `null` so the remaining bundles still load.
- `packages/tools` pins `@paged-media/draw` and both contract packages at the same versions
  as the application. Commit `ad45550` added the contract pins so that the lockfile "holds
  exactly one plugin-api and one plugin-sdk".
- A worker module a bundle asks the host to spawn is resolved from a table in `main.tsx`:
  "the bundle can spawn only what the editor knows it ships".
- `scripts/check-plugin-pins.mjs` compares the pins with the bundle versions in sibling
  plugin checkouts and fails on a difference. A bundle redirected by a root `link:` or
  `file:` override is listed separately and not counted. With no sibling checkout it prints
  SKIPPED and exits 0.

## Evidence

- `apps/canvas/package.json:31-39`, `:43` — the eight bundle pins and the two contract pins
- `apps/canvas/src/main.tsx:91-98`, `:1314-1341` — the static imports; the ordered `loadIf` list
- `apps/canvas/src/main.tsx:1276-1290`, `apps/canvas/src/plugin-load-guard.ts:21-36`, `:98-141` — the guard and its stated reason
- `packages/tools/package.json:17-19` — the same draw and contract pins
- `apps/canvas/src/main.tsx:103-108`, `:1177-1180` — the worker module import and the resolver table
- `scripts/check-plugin-pins.mjs:13-28`, `:97-114` — the rationale; overrides and the SKIPPED exit
- `package.json:32-37`, `.github/actions/plugin-doc-from-source/action.yml:2-7` — the one remaining `link:` override and its CI stopgap

## Alternatives considered

- **`link:` dependencies into sibling plugin repositories.** Replaced in `999eeb7`. Commit
  `3576fe4` (2026-08-04) records root overrides that still redirected four bundles; one remains.
- **A pin check that counts linked bundles as drift.** Rejected in the script: it "would send
  someone chasing a skew their own editor does not have".
- **A worker-hosted bundle loader.** `packages/shell/src/bundles/loader.ts` spawns a bundle
  kernel as a Web Worker. The shell still exports it; no code outside the shell imports it.

## Consequences

A plugin change reaches the editor only after a canary is published and the pin moves. The
pin check is the repository's only guard against a stale pin. It is kept out of `pnpm test`
because "the repo being ahead of the pin is the normal, correct intermediate state", and the
CI step that runs it reports SKIPPED (`.github/workflows/protocol-version.yml:50-59`).

The bundles run in the application's realm, not in an isolate (ADR 319). Because the imports
are static, every bundle's module body is evaluated even when solo mode activates only one
(`apps/canvas/src/main.tsx:1307-1309`). All bundle wasm counts against one size budget
(ADR 308). The decision is not complete for `@paged-media/doc`. `apps/canvas/package.json:32`
pins a version that has not been published (`.github/actions/plugin-doc-from-source/action.yml:3`).
The root override resolves the package from a sibling checkout, and CI checks that
repository out and builds its wasm before installing the editor.

Three comments contradict the code. `apps/canvas/src/plugin-load-guard.ts:24` calls
`loadBundle` unguarded and `:33-36` defers a fix in the SDK; plugin-sdk at the pinned version
catches a throwing `activate` itself (`plugin-sdk: packages/plugin-sdk/src/load.ts:89-122`).
`apps/canvas/vite.config.ts:47-52` says the editor consumes the data bundle "through the pnpm
`link:` chain". `scripts/check-plugin-pins.mjs:33` says the script is not invoked through a
package script; `package.json:18` defines `check:pins`.

## Related

- [ADR 200](200-engine-as-npm-wasm-packages.md), [ADR 203](203-shell-is-a-registry-host.md), [ADR 213](213-solo-mode.md) — the same boundary for the engine; where bundle contributions land; solo mode filters the bundle list
- [ADR 306](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/306-canary-releases.md), [ADR 307](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/307-contract-as-peer-dependency.md) — the canary releases the pins point at; why one copy of the contract
- [ADR 308](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/308-plugin-wasm.md), [ADR 318](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/318-host-spawned-workers.md), [ADR 319](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/319-trust-line.md) — the wasm budget; the worker door behind the resolver table; the trust line
