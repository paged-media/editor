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

// D-26 — the editor half of the plugin DOCUMENTS door (`host.documents`,
// ADR 219). The SDK door owns the capability gate and fills the requester
// from the bundle's manifest; this module owns what the SDK cannot: the
// serializer and loader over the live engine client, and the keep/discard
// DECISION when a plugin asks to replace a document with unsaved edits.
//
// The editor holds one document. A plugin-built document (paged.data's
// "Merge to new document") therefore REPLACES the active one, which is the
// same loss File > New and File > Open guard against with `confirmDiscard`.
// Those run on a user's own menu choice; here a plugin asks, so the prompt
// names the plugin and the document, and dismissing it KEEPS the document.
//
// Types are structural on purpose: this build may pin a plugin-sdk that
// predates the door, and the backend must still compile (it is then simply
// not reached).

import type { CanvasClient, DocumentHandle } from "@paged-media/client";

/** What `host.documents.open` answers (mirrors plugin-api `OpenDocumentResult`). */
export type OpenDocumentResult =
  | { opened: true; pageIds: string[] }
  | { opened: false; reason: "declined" };

export interface OpenDocumentRequest {
  /** The display name the plugin asked for, or null. */
  name: string | null;
  /** Filled by the SDK from the calling bundle's manifest. */
  requester: { id: string; name: string };
}

/** The backend the SDK's `host.documents` door forwards to
 *  (plugin-sdk `DocumentsBackend`). */
export interface EditorDocumentsBackend {
  exportPaged(): Promise<Uint8Array>;
  open(bytes: Uint8Array, request: OpenDocumentRequest): Promise<OpenDocumentResult>;
}

/** A replace request awaiting the user's keep/discard answer. */
export interface PendingReplace {
  readonly id: number;
  /** The plugin asking (its manifest name). */
  readonly requester: string;
  /** The document it wants to open. */
  readonly documentName: string;
  /** Settle once: `true` discards the open document's edits and opens. */
  decide(discard: boolean): void;
}

export interface ReplaceController {
  subscribe(listener: () => void): () => void;
  current(): PendingReplace | null;
}

/** What the app attaches once its document context exists. */
export interface DocumentsDeps {
  getClient: () => CanvasClient | null;
  /** The File > Open orchestration (load with the default font, set the
   *  handle, snapshot). Resolves the handle, or throws when the bytes do
   *  not load. */
  openBytes: (bytes: Uint8Array, name: string) => Promise<DocumentHandle>;
}

export interface EditorDocuments {
  backend: EditorDocumentsBackend;
  controller: ReplaceController;
  /** Bind the live client + open orchestration; returns the detach. */
  attach(deps: DocumentsDeps): () => void;
}

const DEFAULT_NAME = "Untitled document";

/** IDML and `.paged` are both ZIP packages. Checked BEFORE the prompt and
 *  before the open resets the view, so junk bytes cost the user nothing. */
function looksLikePackage(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function createEditorDocuments(): EditorDocuments {
  let deps: DocumentsDeps | null = null;
  let seq = 0;
  let busy = false;
  const queue: PendingReplace[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const l of listeners) l();
  };

  const controller: ReplaceController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    current() {
      return queue[0] ?? null;
    },
  };

  const ask = (requester: string, documentName: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const id = ++seq;
      queue.push({
        id,
        requester,
        documentName,
        decide(discard) {
          const idx = queue.findIndex((p) => p.id === id);
          if (idx === -1) return; // already settled
          queue.splice(idx, 1);
          resolve(discard);
          notify();
        },
      });
      notify();
    });

  const backend: EditorDocumentsBackend = {
    async exportPaged() {
      const client = deps?.getClient() ?? null;
      if (!client) throw new Error("no document is open");
      return client.exportPaged();
    },

    async open(bytes, request) {
      const d = deps;
      const client = d?.getClient() ?? null;
      if (!d || !client) throw new Error("no engine client to open the document in");
      if (!looksLikePackage(bytes)) {
        throw new Error("not an IDML or .paged package (no ZIP signature)");
      }
      // One replace at a time: a second request while the first is being
      // decided or loaded would race the view state it resets.
      if (busy) throw new Error("another document is being opened");
      busy = true;
      try {
        let dirty = false;
        try {
          dirty = (await client.documentMeta()).dirty;
        } catch {
          dirty = false; // no document: nothing to lose
        }
        const name = request.name ?? DEFAULT_NAME;
        if (dirty && !(await ask(request.requester.name, name))) {
          return { opened: false, reason: "declined" };
        }
        const handle = await d.openBytes(bytes, name);
        return { opened: true, pageIds: [...handle.pageIds] };
      } finally {
        busy = false;
      }
    },
  };

  return {
    backend,
    controller,
    attach(next) {
      deps = next;
      return () => {
        if (deps === next) deps = null;
      };
    },
  };
}
