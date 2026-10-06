# ADR 219 — A plugin may replace the open document, and the editor asks first

- **Status:** Accepted, 2026-10-06.
- **Scope:** `apps/canvas/src/plugin-documents.ts`, `apps/canvas/src/DocumentReplaceDialog.tsx`,
  `apps/canvas/src/main.tsx`, `apps/canvas/src/worker/worker.ts`,
  `packages/client/src/client.ts` (`measureTexts`), `packages/shell/src/state/paged-editor.tsx`,
  `apps/canvas/tests/e2e/documents-door.spec.ts`. The contract is plugin-sdk DESIGN.md §20.

## Context

paged.data's mail merge wants "Merge to new document": keep the template, produce the merged
result as a separate document. No plugin door could produce one. `host.nativeDocument.open`
exists, but it belongs to importers: it runs after the user chose File > Open and confirmed
there, so it replaces the open document without asking. A plugin command that called it would
discard unsaved edits with no prompt.

The editor holds one document. There are no tabs, and the worker owns one engine model, so a
second live document would need a document id on every wire message.

The same merge measures overset by calling `host.text.measureString` once per distinct word:
133 of the 148 host calls of a 57-record merge, each a worker round-trip.

## Decision

1. **Replace, do not multiply.** `host.documents.exportPaged()` serializes the open document
   (the File > Save container); `host.documents.open(bytes, { name })` replaces the open
   document with bytes the plugin built. A merge exports the template, opens the copy and
   merges into it with ordinary mutations.
2. **The editor asks.** When the open document has unsaved edits, `open` shows a keep/discard
   prompt naming the plugin (from its manifest, not from the call) and the document. Keep is
   the default: the Keep button, Esc and a backdrop click all keep the document, and the door
   answers `{ opened: false, reason: "declined" }`. Discard runs the File > Open orchestration.
   The prompt is a designed modal like the consent prompt, not `window.confirm`, because it
   must name who is asking; File > New / Open keep `confirmDiscard` (the user asked there).
3. **Fail before the reset.** Bytes without a ZIP signature reject before the prompt and before
   the view resets. One replace runs at a time; a second request rejects.
4. **No dirty override.** The opened copy starts clean with an empty undo history. The merge's
   own mutations mark it edited, which is the truth the save path and the unload guard read.
5. **One round-trip for many measurements.** `client.measureTexts(family, style, texts, sizePt)`
   posts one editor-local `requestMeasureTextBatch` message; the worker serves it before
   `handleMessage` by looping the same `CanvasWorker.measureText` shaper. It is not an engine
   wire kind and needs no protocol change. It backs `PagedEditor.text.measureMany`, which
   backs `host.text.measureStrings`.

## Consequences

- Every bundle sees the replace as a document switch (`documentLoaded` is broadcast). The copy
  carries the template's plugin parts, so a bundle that restores per-document state restores
  the template's state into the copy; the caller must let that restore finish before merging.
- The doors stay inert until the editor pins a plugin-sdk that knows `documents` and
  `measureMany` (0.2.41). Until then the backend is reachable only through the dev-only
  `__documents` handle and `__canvas.client.measureTexts`, which the e2e spec drives.
- `requestMeasureTextBatch` appears in the client api-catalog's wire-kind column although the
  engine never sees it, like `requestMeasureText`, which the worker also serves itself.
- Multi-document editing (tabs, a handle per document) stays out of scope; it needs document
  ids on the wire.
