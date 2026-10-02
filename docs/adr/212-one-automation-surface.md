# ADR 212 — One automation surface for tests, demos and the playground

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/shell/src/PagedShell.tsx`, `packages/shell/src/demo/`, `apps/canvas/src/playground/`, `apps/canvas/public/`, `.github/workflows/playground.yml`; consumed by `apps/canvas/tests`

## Context

Three things drive the running editor from outside its React tree: the Playwright specs,
narrated demo scripts, and the documentation site's playground, which embeds it in an iframe.

The test driver states why it goes through a global: it calls real client methods inside
the page, so a test exercises the same code path the React UI uses
(`apps/canvas/tests/fidelity/canvas-driver.ts:25-28`).

Demo scripts came later. Commit `df02949` (2026-06-21) added a runner that drives the editor
from a script "with a unified surface"; `7f6403d` added a production build that keeps the
handle; `15efbd9` (2026-06-23) added the iframe bridge. A lane that records sessions with
rrweb is older and still exists; the live lane was added beside it. The repository does not
record why.

## Decision

The shell publishes one handle, `globalThis.__canvas`, on every render, in every build that
is not a production build and in the production build made with Vite mode `demo`. Tests,
demo scripts and the playground all act through it.

- The handle carries the wasm client, the document handle, readiness flags, the selection
  mirrors with their setters, tool, group, theme and workflow mode with their setters, the
  registries, `gpuActive`, `openPanel` and a `debugContext` probe.
- The same block sets `__demo.run(source)`. `buildAutomation` derives three script globals
  from the handle: `paged` (one method, `run`, which calls `client.executeScript`; the
  source runs in the engine's script interpreter in the worker), `editor` (`openPanel`,
  `runCommand`, `setTool`, `setMode`, `select`, `pageIds`, `setProperty`, `mutate`) and
  `demo` (`showInfo`, `pause`, `step`, `highlight`, `wait`).
- Demo scripts are evaluated on the main thread with `new Function`. The runner's comment
  limits that to first-party scripts.
- The app mounts two front ends when the mode is `demo` or the build is not production.
  `PlaygroundController` loads `/scripts/<id>.js` for `?script=<id>` and steps through it
  with `DemoSession`. `IframeScriptBridge` is active only under `?embed=script`: it accepts
  `paged:run` messages from an allow-list of origins (`VITE_DOCS_ORIGIN`, default
  `https://docs.paged.media`, plus two localhost origins in development), passes the source
  to `client.executeScript`, and answers with `paged:result`.
- `build:demo` produces `dist-demo`; `playground.yml` is triggered on every push to `main`
  to build and deploy it.

## Evidence

- `packages/shell/src/PagedShell.tsx:936-948` — the handle is republished on every render; the `!isProd || isDemoBuild` gate and the comment that the demo build "DELIBERATELY retains the automation handle"
- `packages/shell/src/PagedShell.tsx:949-1016` — the members of the handle, and `__demo.run`
- `packages/shell/src/demo/automation.ts:20-29`, `:110-157` — the three globals and what each wraps
- `packages/shell/src/demo/runner.ts:25-28`, `:44`; `packages/shell/src/demo/session.ts:232` — `new Function`, and the first-party restriction
- `apps/canvas/src/playground/IframeScriptBridge.tsx:19-41`, `:50-55`, `:128`, `:152` — the message protocol, the origin allow-list, the call into `executeScript`
- `apps/canvas/src/main.tsx:1858-1863` — both front ends mounted under `MODE === "demo"` or a non-production build
- `apps/canvas/package.json:9`, `.github/workflows/playground.yml:33-39` — the demo build and its deployment
- `apps/canvas/public/_headers:29-43` — `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Resource-Policy: cross-origin`, chosen so the documentation site can embed the editor

## Alternatives considered

Recorded sessions. `apps/canvas/tests/demo/` captures the DOM with rrweb and bridges document
frames in through `CanvasClient.startFrameTap` (`packages/client/src/client.ts:1438-1450`);
the Playwright project `demo-capture` and the workflow `demo-capture.yml` run it. It reaches
the client through the same handle and is kept beside the live path.

`editor.mutate` is a bridge for engines whose script interface lacks authoring functions;
its comment prefers `paged.run` once they ship (`packages/shell/src/demo/automation.ts:76-81`).

## Consequences

The shape of the handle is a compatibility surface: 255 TypeScript files under
`apps/canvas/tests` reference `__canvas`. No type covers the whole handle;
`apps/canvas/tests/globals.d.ts:31-54` types a few members plus an index signature on
purpose, and other specs cast locally.

The demo build is a production bundle with a global that drives the editor. The runner says
untrusted scripts should go through the engine's interpreter instead of `new Function`
(`runner.ts:25-28`); that swap has not been made, and `DemoSession` uses `new Function` too.
The iframe bridge does not use it: received source goes only to `client.executeScript`.

`__canvas` is not the only test global. Narrower hooks (`__consent`, `__secrets`,
`__bindingProviders`, `__shellDoors`, `__textCaret`, `__overlaySignals`, `__canvasPointer`,
`__pagedJournal`) are set only when `import.meta.env.PROD` is false; the demo build lacks them.

Three comments are out of date. `canvas-driver.ts:25` says the handle is set in
`CanvasApp.tsx`, which does not exist. `apps/canvas/tests/demo/README.md:46-50` says the
capture project and the release upload are not wired yet; both exist. `main.tsx:1856` says
"only in the `demo` build"; the condition also admits every non-production build.

## Related

- [ADR 203](203-shell-is-a-registry-host.md), [ADR 205](205-client-packaged-as-write-sdk.md) — the registries `editor.*` wraps; the client the handle exposes
- [ADR 216](216-test-tiers.md) — the test tiers that use the handle
- [ADR 001](https://github.com/paged-media/core/blob/main/docs/adr/001-boa-over-quickjs.md) — the interpreter behind `client.executeScript`
