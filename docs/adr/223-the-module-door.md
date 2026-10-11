# ADR 223 — The editor answers the module door from a build-time module manifest

- **Status:** Accepted, 2026-10-11.
- **Scope:** `apps/canvas/src/plugin-modules.ts`, `apps/canvas/scripts/module-index.mjs`,
  the `pagedModules` plugin in `apps/canvas/vite.config.ts` (`virtual:paged-modules`),
  `apps/canvas/scripts/modules-sync.mjs`, the `modules` host option in `main.tsx`,
  `.github/workflows/playground.yml`.

## Context

ADR 220 put the wasm modules on the module host and reached them through same-origin 302s,
because every bundle fetched a URL next to its own code and nothing checked the bytes.
plugin-sdk ADR 326 added the door that lets a bundle ask the host instead:
`host.modules.resolve(name)` for a name declared in `capabilities.wasm`, answered by a
`ModulesBackend` the host application injects, with Subresource Integrity.

## Decision

The editor's `ModulesBackend` answers from a module manifest the build generates.

- **Manifest.** `scripts/module-index.mjs` lists every installed `@paged-media/*` package
  that has a plugin manifest, and for each wasm artifact the manifest declares and the
  package ships: its sha384 and its host version. The host version is the npm version, or
  `<version>+<sha256 prefix>` for a package linked from a source checkout, the same rule
  `modules-sync.mjs` keys uploads by. Both scripts share the file, so they cannot disagree
  about a module's key. Vite serves the manifest as `virtual:paged-modules`.
- **Answers.** A build with `PAGED_MODULES_HOSTED=1` (the playground) answers
  `https://modules.paged.media/<package>/<version>/<path>`. The dev server answers the
  installed file under `/@fs/`, so dev runs the same door with the same integrity. Any other
  build answers `null`, and the bundle loads its own copy. Only a plugin id and a path in
  the manifest are answered.
- **Hosting.** `modules-sync.mjs` also makes sure every module in the manifest is hosted,
  uploading from the installed package what the build did not emit, so the door never points
  at a missing object.
- **Inert until the pin moves.** The pinned plugin-sdk (0.2.48) does not know the `modules`
  option and ignores it. The editor's types are local, structurally plugin-sdk's
  `ModulesBackend`.

## Consequences

- Once the editor pins plugin-sdk 0.2.51 or later, `supports("modules@1")` is true and a
  bundle that adopted the door (paged.data from 0.1.0-canary.14) fetches its wasm from the
  module host directly, with integrity, instead of through a 302.
- The 302s stay for bundles that do not use the door.
- `pnpm test:modules` covers the backend and the manifest.
