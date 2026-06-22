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
      const [widthPt, heightPt] = options.defaultSizePt ?? LETTER_PT;
      await createBlankDocument(
        editor.client,
        { widthPt, heightPt },
        {
          setHandle: editor.document.setHandle,
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
    title: "Open IDML…",
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
          await importer.import({ name: file.name, bytes, mimeType: file.type });
          options.setStatus(`imported ${file.name}`);
        } catch (err) {
          options.pushWarning(
            `import of ${file.name} via ${importer.title} failed: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
        return;
      }
      await loadDocumentFile(editor.client, file, {
        setHandle: editor.document.setHandle,
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
