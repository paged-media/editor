/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Step 3d / 3h — the canonical file-open command. The header file
// picker and (3h+) the Cmd+K palette both resolve through this
// contribution so there's a single load path.

import { createBlankDocument, loadDocumentFile } from "../document-loader";
import { setPendingImportSource } from "../import-source";
import type { PagedEditor } from "../paged-editor";
import type { CommandContribution } from "../../registries";

export const PAGED_FILE_OPEN_IDML = "paged.file.openIdml";
export const PAGED_FILE_NEW = "paged.file.new";

/** US Letter in points — InDesign's default new-document size. */
const LETTER_PT: readonly [number, number] = [612, 792];

/**
 * Build the File ▸ New command. Mints a blank single-page document via
 * the engine ([`CanvasClient.newBlankDocument`]) and runs it through the
 * same document-state orchestration as Open, so the menu, palette, and
 * tests all reach one path.
 */
/** Ask before discarding an edited document.
 *
 *  `File > New` and `File > Open` both replace the open document
 *  outright. The editor has no autosave and no recent-files list, so a
 *  mis-click here is unrecoverable — the previous document is simply
 *  gone. The dirty flag was already displayed in two places and acted on
 *  in none.
 *
 *  `window.confirm` deliberately, not a designed modal: this must work
 *  before any React tree exists (a failed bundle load still reaches the
 *  menu), it must be synchronous so nothing races the replacement, and
 *  it is the one dialog the platform guarantees. A prettier modal is a
 *  fine follow-up; shipping nothing until it exists is not.
 *
 *  Returns true when it is safe to proceed. */
async function confirmDiscard(editor: PagedEditor, what: string): Promise<boolean> {
  let dirty = false;
  try {
    dirty = (await editor.client.documentMeta()).dirty;
  } catch {
    // No document, or the worker is not answering — nothing to lose.
    return true;
  }
  if (!dirty) return true;
  return globalThis.confirm(
    `This document has unsaved edits. ${what} will discard them.\n\n` +
      "Save with Cmd+S first, or continue to discard.",
  );
}

export function buildNewDocumentCommand(options: {
  setStatus: (s: string) => void;
  pushWarning: (w: string) => void;
  defaultSizePt?: readonly [number, number];
}): CommandContribution {
  return {
    id: PAGED_FILE_NEW,
    title: "New document",
    category: "File",
    handler: async (paged) => {
      const editor = paged as PagedEditor;
      if (!(await confirmDiscard(editor, "Creating a new document"))) return;
      const [widthPt, heightPt] = options.defaultSizePt ?? LETTER_PT;
      await createBlankDocument(
        editor.client,
        { widthPt, heightPt },
        {
          setHandle: editor.document.setHandle,
          setSourceName: editor.document.setSourceName,
          setLoading: editor.document.setLoading,
          setStatus: options.setStatus,
          setSnapshotsReady: editor.document.setSnapshotsReady,
          addSnapshot: (pageId, url) => {
            editor.document.setSnapshots((prev) => {
              const next = new Map(prev);
              next.set(pageId, url);
              return next;
            });
          },
          resetForNewDocument: editor.document.resetForNewDocument,
          pushWarning: options.pushWarning,
        },
      );
    },
  };
}

/**
 * Build the file-open command contribution. The `pickFile` thunk
 * is supplied at registration time so the shell stays decoupled
 * from the DOM-level mechanism (file input, drag-drop, palette
 * invocation, OS file dialog) — every entry point hands in its
 * own picker and the loader runs identically afterward.
 */
export function buildOpenIdmlCommand(options: {
  pickFile: () => Promise<File | null>;
  setStatus: (s: string) => void;
  pushWarning: (w: string) => void;
}): CommandContribution {
  return {
    id: PAGED_FILE_OPEN_IDML,
    // "Open…", not "Open IDML…": the picker's accept list is computed from
    // the importer registry, so this door opens every registered format
    // (.idml, .svg, .xlsx, images, .docx, …). Command id keeps the historic
    // name for test/config stability.
    title: "Open…",
    category: "File",
    handler: async (paged) => {
      const editor = paged as PagedEditor;
      const file = await options.pickFile();
      if (!file) return;
      // K-2 / S-06 — a registered plugin importer may claim this file type
      // (e.g. paged.sheet's .xlsx). Route the bytes to the plugin instead
      // of the default IDML load — the plugin owns what the file becomes
      // (it does not replace the document unless it chooses to).
      const importer = editor.registries.importers.resolve(file.name, file.type);
      if (importer) {
        options.setStatus(`importing ${file.name} via ${importer.title}…`);
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          // U14 — park the file name for the open orchestration: an
          // importer that OPENS a document does so through
          // `nativeDocument.open(bytes)`, which carries no name.
          setPendingImportSource(file.name);
          await importer.import({ name: file.name, bytes, mimeType: file.type });
          options.setStatus(`imported ${file.name}`);
        } catch (err) {
          options.pushWarning(
            `import of ${file.name} via ${importer.title} failed: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        } finally {
          setPendingImportSource(null);
        }
        return;
      }
      // The guard sits HERE, not before the picker and not before the
      // importer routing above. Asking before the picker interrupts a
      // gesture the user may abandon anyway, and a plugin importer does
      // not necessarily replace the document — paged.sheet's .xlsx adds
      // a frame. This branch is the one that always replaces, so it is
      // the only one where "continue" means "discard what is open".
      if (!(await confirmDiscard(editor, `Opening ${file.name}`))) return;
      await loadDocumentFile(editor.client, file, {
        setHandle: editor.document.setHandle,
        setSourceName: editor.document.setSourceName,
        setLoading: editor.document.setLoading,
        setStatus: options.setStatus,
        setSnapshotsReady: editor.document.setSnapshotsReady,
        addSnapshot: (pageId, url) => {
          editor.document.setSnapshots((prev) => {
            const next = new Map(prev);
            next.set(pageId, url);
            return next;
          });
        },
        resetForNewDocument: editor.document.resetForNewDocument,
        pushWarning: options.pushWarning,
      });
    },
  };
}
