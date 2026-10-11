# @paged-media/ai — vendored copy

This directory is a **temporary copy** of `@paged-media/ai`, whose home is
[paged-media/plugin-sdk `packages/ai`](https://github.com/paged-media/plugin-sdk/tree/main/packages/ai)
(ADR 325 there; ADR 221 here). It is vendored because the package's first npm
publish has not happened yet, and the editor must build from its own repository.

- Source: plugin-sdk `33eb07b`, `packages/ai/src/*.ts`, byte for byte, except
  `engine-catalog.ts`, which imports `./catalog.json` (plugin-api's vendored
  catalog, synced from `@paged-media/canvas-wasm@0.71.2` — the engine this
  editor pins) instead of reaching into a sibling package.
- Licence: MPL-2.0 OR PMEL, as upstream (the file headers say so).
- **Do not edit here.** Change plugin-sdk, then re-copy.

## Removing it

Once `@paged-media/ai` is on npm:

1. delete `packages/ai/`;
2. in `packages/shell/package.json` and `apps/canvas/package.json`, replace
   `"@paged-media/ai": "workspace:*"` with the published version;
3. `pnpm install`, then the editor checks.
