# ADR 205 — The editor's wasm client is packaged as the write SDK

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/client` (`package.json`, `tsconfig.build.json`, `README.md`, `api-catalog.json`), `scripts/client-api-catalog.mjs`

## Context

The engine repository publishes a viewer SDK, `@paged-media/idml-viewer`, that is read-only
by design. The header of `scripts/client-api-catalog.mjs` records what prompted this
decision: a survey of which surfaces can reach the engine's mutations and wire kinds found
that "the SDK" reached almost none of them, because the SDK it measured was the viewer.
Growing the viewer into a write surface "would undo that decision, and it does not need
undoing, because the full-capability SDK already exists — this package. It just was not
published, not catalogued, and therefore not answerable"
(`scripts/client-api-catalog.mjs:7-15`).

Until commit `3ec1f4b` (2026-09-10) `packages/client` was a private workspace package at
version `0.0.0`. The same commit explains why its machine-readable catalogue is generated
and not listed by hand: the viewer's hand-written list works at 47 members kept by their
author, but this package has about 66 members over five barrels, "and a hand list that size
rots".

## Decision

`packages/client` is a publishable package, `@paged-media/client`, presented as the SDK that
changes a document, beside the viewer SDK that shows one. Its public surface is described
by a catalogue generated from the source.

- The manifest is not private. Its version follows the engine's scheme with a prerelease
  suffix (`0.64.0-canary.0` at this commit), and `publishConfig` sets public access and the
  `canary` dist-tag.
- Inside the workspace the entry points are the TypeScript sources, so "an edit is live
  without a build step". `publishConfig` repoints `main`, `types` and `exports` at `dist/`
  for the tarball only; `tsconfig.build.json` is the build that emits it.
- The emitted imports are extensionless ESM. The build config calls this "a real constraint
  on consumers" and accepts it because every consumer runs a bundler.
- Every engine authoring operation is a variant of `Mutation` and goes through one method,
  `mutate()`, which its doc comment calls "THE write door"; there is no method per operation
  (`packages/client/src/client.ts:381-399`). Gestures, undo and redo, and scripts have their
  own calls. `send()` reaches any message kind without a typed helper.
- `api-catalog.json` is written by `scripts/client-api-catalog.mjs` from the declarations
  and doc comments of the package: public members with signature and summary, and
  `wireKinds`, the engine message kinds the client sends. The script fails when a public
  member has no doc comment or a count falls below a floor, and with `--check` also when the
  file is stale. CI runs the check.
- The catalogue reads the protocol number the way `protocol.ts` does, from the installed
  engine package.

## Evidence

- `packages/client/package.json:2-3`, `:13-20`, `:26-46` — name, version, source entry points, `publishConfig`
- `packages/client/tsconfig.build.json:2-15` — the publish build and the extensionless imports
- `packages/client/README.md:12-25`, `:67-71` — the two SDKs; `mutate()` and `send()`
- `scripts/client-api-catalog.mjs:22-43`, `:125-129`, `:392-423` — generated, not listed; the floors; the gate
- `scripts/client-api-catalog.mjs:344-363` — the protocol read from the engine package
- `packages/client/api-catalog.json:3-9` — protocol 64; 66 client members, 49 wire kinds, 67 exports
- `package.json:24`, `.github/workflows/tests.yml:192-198` — `test:client-catalog` and its CI step

## Alternatives considered

- **Growing the viewer SDK into a write surface.** Rejected in the script header and in
  `packages/client/README.md:23-25`.
- **A hand-written catalogue with a completeness test**, as the viewer has. Rejected in the
  script header and in commit `3ec1f4b`.
- **Consuming a built `dist` inside the workspace.** Not done, so an edit needs no build step.

## Consequences

The public surface of `CanvasClient` is now a compatibility surface tied to the protocol
number: a client and an engine that share a minor are meant to be compatible
(`packages/client/README.md:91-93`). A new public method needs a doc comment before CI
passes. Consumers must serve a cross-origin isolated page
([ADR 202](202-render-worker-owns-the-canvas.md)).

The publication itself is not finished. No workflow under `.github/workflows/` publishes the
package, and no lifecycle script in the manifest builds `dist` before a publish. On
2026-10-02 the npm registry answered 404 for `@paged-media/client`. The README still calls
it "the editor's own client, published" (`packages/client/README.md:9-10`) and gives an
`npm install` command for it (`:30`).

The package contains no worker entry. The README example constructs a worker from a file of
the consumer, `./canvas.worker.ts`, and does not say what that file must contain; the
editor's own entry is `apps/canvas/src/worker/worker.ts`. The same README says the package
"constructs a `Worker`" (`:33`), which is true only for the `workerUrl` option.

No file in this repository reads `api-catalog.json` apart from the script that generates and
checks it. The catalogue lists 49 wire kinds; the script header gives the engine's total as
62. One group summary in the script still says "the v62 wire"
(`scripts/client-api-catalog.mjs:70`) while the catalogue records protocol 64.

## Related

- [ADR 200](200-engine-as-npm-wasm-packages.md), [ADR 202](202-render-worker-owns-the-canvas.md) — the engine package and version scheme; the worker the client drives
- [ADR 112](https://github.com/paged-media/core/blob/main/docs/adr/112-viewer-sdk-is-a-sibling.md), [ADR 019](https://github.com/paged-media/core/blob/main/docs/adr/019-capability-catalog-one-contract.md), [ADR 216](216-test-tiers.md) — the read-only viewer SDK; the engine's generated capability contract; the structural CI guards this gate belongs to
