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

// The editor's host-injected NATIVE-DOCUMENT backend for the plugin SDK
// (ADR-022 Phase 3).
//
// `host.nativeDocument` is the capability-gated, isolate-safe door an
// import/export plugin (paged.publish, the IDML adapter) uses to speak in
// terms of the WHOLE Paged-native document — replacing the non-isolate
// `host.editor.client` escape hatch for that job. The SDK owns the door +
// the `readNative`/`openNative` gates; the editor's only job is this
// backend over the live engine client:
//   • reads  — the core-owned native parts, via the `readPagedPart` /
//     `listPagedParts` wire ops at the well-known `paged/core/…` paths (a
//     PRIVILEGED cross-namespace read, not a plugin's own `host.parts`
//     subtree, which is exactly why it is separately gated).
//   • open   — replace the active document via `client.loadDocument` (the
//     binary side-channel); an importer produces native bytes and hands
//     them here.

import type { CanvasClient } from "@paged-media/client";
import type { CreateBundleHostOptions } from "@paged-media/plugin-sdk";

/** The injected backend the SDK's `host.nativeDocument` door forwards to. */
type NativeDocumentBackend = NonNullable<
  CreateBundleHostOptions["nativeDocument"]
>;

// The core-owned native part paths (mirrors paged-store's DOCUMENT_PGM_PATH
// and paged-composition's DOCUMENT_PGD_PATH). Kept as literals here — they
// are a stable wire contract, not code the editor imports from the engine.
const DOCUMENT_PGM_PATH = "paged/core/model/document.pgm";
const DOCUMENT_PGD_PATH = "paged/core/composition/document.pgd";
const CORE_PARTS_PREFIX = "paged/core/";

/**
 * Build the editor's native-document backend over the live engine client
 * (the same thunk idiom as the other backends — resolved at call time so it
 * survives client reloads). Reads answer the honest `null`/`[]` when there
 * is no client or the part is absent; `open` rejects with no client.
 */
export function createEditorNativeDocumentBackend(
  getClient: () => CanvasClient | null,
  // Full-document open orchestration (loadDocumentFile-equivalent: load with
  // the default font, then setHandle + snapshot). Injected so an importer that
  // OPENS a new document (paged.publish's .idml, paged.pdf's .pdf) actually
  // ACTIVATES it in the view. Without it, a bare `client.loadDocument` loads
  // the worker model but leaves the app's document handle null — the canvas +
  // document-map gate on `handle.pageCount`, so nothing renders. Optional: the
  // backend still works (worker-only) in isolation / tests when it's absent.
  openBytes?: (bytes: Uint8Array, name: string) => Promise<void>,
): NativeDocumentBackend {
  async function readPart(path: string): Promise<Uint8Array | null> {
    const client = getClient();
    if (!client) return null;
    try {
      const reply = await client.send({
        kind: "readPagedPart",
        payload: { path },
      });
      if (reply.kind !== "pagedPartRead" || !reply.payload.found) return null;
      return Uint8Array.from(reply.payload.bytes);
    } catch {
      return null;
    }
  }

  return {
    readModel: () => readPart(DOCUMENT_PGM_PATH),
    readComposition: () => readPart(DOCUMENT_PGD_PATH),

    async listParts(prefix?: string): Promise<string[]> {
      const client = getClient();
      if (!client) return [];
      const rel = (prefix ?? "").replace(/^\/+/, "");
      const full = rel ? CORE_PARTS_PREFIX + rel : CORE_PARTS_PREFIX;
      try {
        const reply = await client.send({
          kind: "listPagedParts",
          payload: { prefix: full },
        });
        return reply.kind === "pagedPartList" ? reply.payload.paths : [];
      } catch {
        return [];
      }
    },

    async open(bytes: Uint8Array): Promise<void> {
      const client = getClient();
      if (!client)
        throw new Error("no engine client to load the document into");
      // Prefer the full shell orchestration so the opened document activates
      // in the view (setHandle + snapshot + default font). Fall back to the
      // bare worker load when no orchestration is injected.
      if (openBytes) {
        await openBytes(bytes, "Imported document");
        return;
      }
      await client.loadDocument(bytes);
    },
  };
}
