# ADR 211 — The editor has no backend: documents are local files

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `apps/canvas` (file commands, save, hosting headers) and
  `packages/shell/src/state/open-file-handle.ts`

## Context

The engine runs as wasm in a worker inside the page and returns a document's bytes on
request: `exportPaged()` for the native `.paged` container, `exportIdml()` for IDML. The
application around it is built by Vite into static files. Its source contains no call to a
server of its own, no account and no sign-in; its `fetch` calls read assets from its own
origin. The repository does not record why.

What the repository does record is how saving came to work. The `.paged` save was added on
2026-08-21 (commit `4b6b5bf`). At first every save was a browser download, so a second save
produced a second file and the opened file was never touched. Commit `68b1069` (2026-08-22)
and the header of the handle store describe that as a save-as under the name Save, in an
application with no autosave (`packages/shell/src/state/open-file-handle.ts:20-27`).

## Decision

The editor is a static web application with no server side. A document is opened from a
local file and saved by asking the engine for the bytes and writing them to the file it was
opened from, or, failing that, to a browser download.

- **Open.** The Open command prefers the File System Access picker, which returns a handle;
  it falls back to an `<input type="file">`. A file can also be dropped on the window. A
  file type claimed by a plugin importer goes to that importer.
- **Save.** `savePaged` calls `client.exportPaged()`, then `writeToOpenFile`, which returns
  `false` when there is no handle, no platform support or no permission; the caller then
  downloads the bytes. "Save As IDML" always downloads.
- **No autosave, no recent-files list.** New and Open ask before discarding unsaved edits,
  and a `beforeunload` handler asks before the tab closes while the document is dirty.
- **Failures are shown.** A failed `.paged` or IDML save is published to the Problems panel.
- **Network.** The build ships `Content-Security-Policy: connect-src 'self' blob: data:`
  as a response header in `_headers` and as a `<meta>` tag injected into the page.

## Evidence

- `apps/canvas/src/main.tsx:1593-1638` — `savePaged`: export, write back, download fallback
- `packages/shell/src/state/open-file-handle.ts:20-45`, `:85-113` — handle store; `writeToOpenFile`
- `packages/shell/src/PagedShell.tsx:721-726`, `:759-788`, `:817-847` — the picker, the handle,
  the input fallback
- `packages/shell/src/state/commands/file-commands.ts:44-48`,
  `packages/shell/src/PagedShell.tsx:1292-1323` — no autosave; the two confirmations
- `apps/canvas/src/main.tsx:1359-1375`, `:1590`, `:1636` — `reportFileFailure` and its two callers
- `apps/canvas/public/_headers:44-49`, `apps/canvas/vite.config.ts:89-102`, `:115-124` — the
  `connect-src` policy and the build-time `<meta>`
- `apps/canvas/package.json:8`, `.github/workflows/playground.yml:32-39` — the build is
  `vite build`; the demo build is uploaded to a static host

## Alternatives considered

A download for every save is the earlier behaviour, replaced as described above. No
server-side alternative is recorded in the repository.

## Consequences

Any static host can serve the editor if it sends the headers in `apps/canvas/public/_headers`.
The store's header states the browser floor: the app already "requires a Chromium-class
browser" for WebGPU, SharedArrayBuffer and OffscreenCanvas
(`packages/shell/src/state/open-file-handle.ts:29-32`).

State that is not the document stays in the browser: theme and layout in `localStorage`,
per-plugin binary data in the origin-private file system
(`apps/canvas/src/plugin-blob-store.ts:19-30`). An unsaved document is lost with its tab; the
comment on the `beforeunload` handler says it is not autosave
(`packages/shell/src/PagedShell.tsx:1307-1308`).

The native picker's file-type filter lists `.paged` and `.idml`; importer extensions are
added to the `<input>` fallback only (`packages/shell/src/PagedShell.tsx:761-772`,
`:832-838`). Save writes the `.paged` container to the stored handle whichever of the two
types was opened; the code comment notes that the bytes are an IDML package with extra parts
(`apps/canvas/src/main.tsx:1593-1599`).

When no handle is stored, Save downloads. The handle is set and cleared only inside the
Open command's picker (`packages/shell/src/PagedShell.tsx:774`, `:785`, `:807`, `:844`). The
store's header also names File ▸ New as a point where it is cleared
(`packages/shell/src/state/open-file-handle.ts:41`); no such call exists at the pinned
commit, and the drop path (`packages/shell/src/PagedShell.tsx:1109-1158`) does not touch the
handle.

## Related

- [ADR 202](202-render-worker-owns-the-canvas.md) — the engine in a worker inside the page
- https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/017-importer-exporter-door-shape.md
  — how a foreign file type is opened
- https://github.com/paged-media/core/blob/main/docs/adr/021-paged-native-document-model-idml-as-format.md
  — the `.paged` container that Save writes
