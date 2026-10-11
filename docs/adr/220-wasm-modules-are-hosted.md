# ADR 220 — Wasm modules are hosted, not deployed

- **Status:** Accepted, 2026-10-11.
- **Scope:** `apps/canvas/scripts/modules-sync.mjs`, `.github/workflows/playground.yml`,
  `apps/canvas/src/worker/worker.ts`; the R2 bucket `paged-modules` at `modules.paged.media`.

## Context

The engine wasm (`@paged-media/canvas-wasm`, about 27 MiB) and paged.data's DuckDB (about
34 MiB) are each over Cloudflare Pages' 25 MiB limit per file, so the playground could not
deploy them. Every plugin already boots its wasm lazily, on first use. What was missing was a
home for the modules:

- They shipped uncompressed inside every deploy.
- They were cached per site, never shared.
- They were thrown away when they were too big.

## Decision

Wasm modules are hosted like shared libraries, on a first-party module host:
`https://modules.paged.media/<package>/<version>/<path in the package>`, an R2 bucket on our
domain.

- **Immutable per version.** A module published to npm never changes under its version. A
  package linked from a source checkout gets `+<content hash>` added to its version.
- **Compressed and cacheable.** Objects are stored brotli-compressed (`Content-Encoding: br`)
  with `Content-Type: application/wasm`, `Cache-Control: public, max-age=31536000, immutable`,
  and public read-only CORS. The browser decodes while it downloads, `instantiateStreaming`
  compiles while it downloads, and every site that loads the same version shares one cached
  copy.
- **Identified by content.** After a build, `modules-sync.mjs` matches every emitted `.wasm`
  byte for byte against the wasm files inside the installed `@paged-media/*` packages. A
  `.wasm` that matches no package fails the deploy, because a module without a version has no
  immutable home.
- **Resolved by redirect.** For each module the deploy uploads it if it isn't hosted yet,
  removes it from the deploy, and adds a same-origin `302` to it in `_redirects`.
  - The plugins keep requesting the URLs they always used: Vite `?url` assets, and
    plugin-data's `bin/`.
  - DuckDB's worker stays same-origin, as plugin-data D-05 requires, and only its
    `instantiate` fetch crosses to the module host.
  - Local dev and other hosts are unchanged, because the redirects exist only in the deployed
    output.
- `modules.json` in the deploy records each module's URL, size and SHA-384.

## Consequences

- The gzip stopgap from #22 is gone: the engine and DuckDB load from the module host.
- CI needs R2 write access. It uses `CLOUDFLARE_API_TOKEN`, which needs R2 edit permission
  on the account.
- **Not yet:**
  - A plugin-API door (`host.assets.moduleUrl`) that would resolve `capabilities.wasm`
    artifacts through the host, with subresource integrity.
  - Lazy loading of the plugin bundles' JavaScript.
  - Uploading from each package's own publish workflow.
