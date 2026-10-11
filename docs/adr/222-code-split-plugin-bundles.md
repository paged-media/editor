# ADR 222 — Plugin bundles are code-split; PDF loads on first import

- **Status:** Accepted, 2026-10-11.
- **Amends:** ADR 213 (solo mode now also saves the download of the other bundles).
- **Scope:** `apps/canvas/src/plugin-bundle-table.ts`, `apps/canvas/src/plugin-bundle-loader.ts`,
  `apps/canvas/src/main.tsx` (`PluginBundles`, `GatedCanvasClient`),
  `apps/canvas/tests/fidelity/canvas-driver.ts` (`openCanvas`), `scripts/journal.test.mjs`.
  The plugin contract (plugin-sdk ADR 304: one synchronous `activate`) is unchanged.

## Context

`main.tsx` imported all eight first-party bundles statically (`draw`, `web`, `data`, `sheet`,
`image`, `publish`, `pdf`, `doc`). Their code was therefore part of the entry chunk: the
browser had to download, parse and evaluate every plugin before the shell could mount, and
solo mode, which activates one bundle, still paid for all eight. Plugin wasm was already
loaded lazily by each bundle; the JavaScript was not.

Three things depend on a bundle being active, and any change to when it activates must keep
them working:

1. **Document restore.** Bundles restore their own container parts when a document opens
   (the sheet workbook, the data session, draw recipes). They subscribe to
   `document.onDidOpen` in `activate()`; a document that opened before the subscription
   would not be restored.
2. **Contributions.** Menus, the command palette, the tool rail, panels, the Export Center and
   the file picker's `accept` list read the registries. They are filled in `activate()`.
   Menus are a runtime contribution (`contribute.menu()`): no manifest declares them.
3. **Tests.** Specs probe a bundle's contributions directly after boot.

## Decision

**Every bundle is a dynamic `import()`** in `plugin-bundle-table.ts`, so each one is its own
chunk and none is in the entry. The table names each bundle's manifest id before its chunk is
fetched (solo filtering needs it); the loaded manifest is checked against it.

**Two lanes.**

- **Boot** (draw, web, data, sheet, image, publish, doc). After the shell mounts,
  `PluginBundles` fetches all of them in parallel and activates them in table order, which is
  the order of the static imports it replaces, so registration order does not change. This
  does not block first paint.
- **On demand** (pdf). The host registers a placeholder importer with the same id, title,
  extension and MIME type the bundle registers. The first `.pdf` (drag and drop, File ▸ Open,
  File ▸ Open PDF…) fetches and activates the bundle; the placeholder steps aside so the real
  importer can take the id, and the file is handed to it. If the chunk cannot be fetched the
  placeholder is put back, the failure goes to the Problems panel and the journal, and the
  next import tries again.

**No document opens before the boot lane has settled.** The app's `CanvasClient` is a
subclass whose `loadDocument` and `newBlankDocument` wait for it. Every way a document is
opened (File ▸ Open, File ▸ New, an importer through `nativeDocument.open`, the documents
door, scripts, the site bridge, the solo boot artboard) goes through one of those two
methods, so this is the single gate for document restore. The wait is bounded (20 s): a
chunk that never arrives delays an open, it does not block it, and the failure is already
reported. The chunks download while the worker fetches and compiles the engine wasm, so the
gate is normally already open.

**Tests wait for the boot lane.** `window.__pluginBundles` (`settled`, `ready()`, `active()`,
`ensure(id)`) exists from module evaluation, in the same builds that expose `__canvas`.
`openCanvas` waits for `settled` after it sees `__canvas.client`, so every spec that boots
through the shared driver sees the same registries it saw before.

**Activation failures are reported as before.** A chunk that fails to load, or whose manifest
id differs from the table, is recorded as `plugin.activate` with `ok: false` and published to
the Problems panel, and the other bundles still activate. StrictMode's mount, unmount and
remount cannot leave an orphaned bundle: an activator that was disposed while a fetch was in
flight does not activate it.

## Why only pdf is on demand

A bundle can wait for first use only if nothing the user can see or do before that use
depends on it. paged.pdf contributes one importer and nothing else; the File ▸ Open PDF… entry
is the host's own. The placeholder therefore reproduces its whole surface.

The others do not qualify:

- **draw, image** register tools, panels, many commands and runtime menus. The manifest
  lists the ids of tools, panels and commands but not their titles, icons, groups, `when`
  clauses or keybindings, and it does not list menus at all. Placeholders would need a
  second, host-maintained copy of each bundle's UI, which would drift from the bundle.
- **sheet, data, web, doc** restore container parts and own edit contexts and object types.
  Activating them when a document needs them requires inspecting the document's parts and
  `x-paged:<id>` metadata before opening it, and they also contribute panels and commands
  that the user reaches without opening a document.
- **publish** is 2 KB, and its exporter is a row in the Export Center, which lists what is
  registered.

What it would take to defer them is listed under Consequences.

## Measurements

`pnpm --filter paged-canvas build:demo`, `dist-demo/assets/*.js`:

| | before | after |
|---|---:|---:|
| entry chunk | 3,255,714 B (gzip 896,856) | 1,861,486 B (gzip 487,770) |
| JS fetched by the time the boot bundles are active | entry only | entry + 7 boot chunks |
| paged.pdf (bundle chunk, plus pdfium which was already split) | in the entry | 151,873 B + 160,876 B, on first PDF import |

The chunks per bundle: draw 459 KB, image 240 KB, data 203 KB, sheet 198 KB, pdf 152 KB,
web 133 KB, doc 28 KB, publish 2 KB (raw).

Boot, the demo build served locally with the isolation headers, headless Chromium, median of
seven loads (milliseconds from navigation start):

| | unthrottled before | after | 20 Mbit/s, 40 ms before | after |
|---|---:|---:|---:|---:|
| first contentful paint | 187 | 126 | 1,594 | 970 |
| shell mounted (`__canvas.client`) | 215 | 171 | 1,622 | 991 |
| boot bundles active | 217 | 178 | 1,625 | 1,652 |
| File ▸ New ready | 360 | 283 | 12,725 | 12,523 |
| page JS transferred by then | 3.30 MB | 3.17 MB | | |

The shell paints about 40% sooner on a constrained link. Plugins are active at the same
moment as before, because the same bytes still have to arrive. The first document is bound
by the engine wasm download, not by plugin code.

## Consequences

- The shell mounts and paints before any plugin code is evaluated. Plugin contributions
  appear a moment later; a user who opens a menu in that window sees the host's entries only.
- Solo mode fetches only its own bundle's chunk.
- The placeholder restates paged.pdf's importer (id, title, extension, MIME type) because the
  manifest names the importer but not its file types. `tests/plugin-surface/data-doc-publish.spec.ts`
  asserts the registered importer's id, title, extension and MIME type, which the placeholder
  must match before first use and the real importer after it.
- The journal's plugin roster lists paged.pdf only once it has been activated.

Deferring the remaining bundles would need, at minimum:

1. A manifest field for contribution metadata (titles, icons, menu paths, keybindings) so the
   host can register placeholders without a copy of the bundle's UI — a plugin-sdk contract
   change.
2. A document-open trigger: read the container's part list (`paged/<plugin-id>/…`) and the
   `x-paged:<id>` metadata before the open, activate the bundles that own them, then open.
3. A rule for runtime-only contributions (menus, providers) that cannot be known before
   activation.
