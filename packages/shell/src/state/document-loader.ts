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

// File-loading orchestration extracted from CanvasApp.tsx — the
// `onFile` flow that turns a dropped file into (a) loaded
// document handle, (b) per-page snapshots, (c) Tier 3 resolution.
//
// The loader takes the canvas client + the document/loading
// callbacks (typically the setters from DocumentContext). It does
// NOT depend on React; pass it the setters and it dispatches.

// eslint-disable-next-line import/no-relative-parent-imports
import type { CanvasClient } from "@paged-media/client";
// eslint-disable-next-line import/no-relative-parent-imports
import type {
  DocumentHandle,
  PageId,
} from "@paged-media/client";

import type { LoadingState } from "./document-context";

const SNAPSHOT_WIDTH_PX = 256;

export interface DocumentLoaderCallbacks {
  setHandle: (h: DocumentHandle | null) => void;
  setLoading: (l: LoadingState | null) => void;
  setStatus: (s: string) => void;
  setSnapshotsReady: (ready: boolean) => void;
  addSnapshot: (pageId: PageId, objectUrl: string) => void;
  resetForNewDocument: () => void;
  pushWarning: (w: string) => void;
}

/**
 * Drives the load → snapshot → ready sequence for one IDML file.
 *
 * Order matters here: each step must complete before the next. The
 * worker is single-threaded; parallel requests would only queue.
 * Snapshot progress lands in the UI page-by-page (the navigator
 * shows the snapshot as soon as it lands), so the loop is
 * deliberately not Promise.all.
 *
 * Errors at the load step abort; per-page snapshot errors are
 * pushed as warnings and the loop continues — a missing snapshot
 * shouldn't block the rest of the document.
 */
export async function loadDocumentFile(
  client: CanvasClient,
  file: File,
  cb: DocumentLoaderCallbacks,
): Promise<void> {
  cb.setStatus(`loading ${file.name} (${file.size.toLocaleString()} bytes)…`);
  cb.setLoading({ name: file.name, bytes: file.size });
  cb.resetForNewDocument();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fontBytes = await fetchDefaultFont();

  let handle: DocumentHandle;
  try {
    handle = await client.loadDocument(bytes, fontBytes);
  } catch (err) {
    cb.setLoading(null);
    cb.setStatus(`load failed: ${String(err)}`);
    return;
  }

  cb.setHandle(handle);
  cb.setLoading(null);
  cb.setStatus(
    `loaded ${handle.pageCount} page${handle.pageCount === 1 ? "" : "s"}; snapshotting…`,
  );
  await snapshotAllPages(client, handle, cb);
}

/** Size of a new blank document in points, [width, height]. */
export interface BlankDocumentOptions {
  widthPt: number;
  heightPt: number;
}

/**
 * File ▸ New — create an empty single-page document and run the same
 * post-load orchestration as {@link loadDocumentFile} (reset, snapshot,
 * ready). The blank package is minted by the engine
 * ([`CanvasClient.newBlankDocument`]); the editor only orchestrates the
 * surrounding UI state, exactly like opening a file.
 */
export async function createBlankDocument(
  client: CanvasClient,
  opts: BlankDocumentOptions,
  cb: DocumentLoaderCallbacks,
): Promise<void> {
  cb.setStatus("creating new document…");
  cb.setLoading({ name: "Untitled", bytes: 0 });
  cb.resetForNewDocument();

  const fontBytes = await fetchDefaultFont();

  let handle: DocumentHandle;
  try {
    handle = await client.newBlankDocument(opts.widthPt, opts.heightPt, fontBytes);
  } catch (err) {
    cb.setLoading(null);
    cb.setStatus(`new document failed: ${String(err)}`);
    return;
  }

  cb.setHandle(handle);
  cb.setLoading(null);
  cb.setStatus(
    `new ${handle.pageCount}-page document; snapshotting…`,
  );
  await snapshotAllPages(client, handle, cb);
}

/**
 * Auto-fetch a default font so text is shaped + the captured StoryLayout
 * has real glyph positions. Without this the caret + selection rendering
 * has nothing to position against (glyphs vec empty → no clusters
 * captured). Inter is checked in under corpus/fonts/. Best-effort: the
 * canvas still renders without it.
 */
async function fetchDefaultFont(): Promise<Uint8Array | undefined> {
  try {
    const fontResp = await fetch("/fonts/Inter.ttf");
    if (fontResp.ok) {
      return new Uint8Array(await fontResp.arrayBuffer());
    }
  } catch {
    // best-effort
  }
  return undefined;
}

/**
 * Sequential per-page snapshot requests + ready flag, shared by the
 * open-file and new-document paths. Sequential because the worker is
 * single-threaded; parallel requests would only queue. A missing
 * snapshot is a warning, not a hard failure.
 */
async function snapshotAllPages(
  client: CanvasClient,
  handle: DocumentHandle,
  cb: DocumentLoaderCallbacks,
): Promise<void> {
  for (const pageId of handle.pageIds) {
    try {
      const snap = await client.requestSnapshot(pageId, SNAPSHOT_WIDTH_PX);
      const blob = new Blob([new Uint8Array(snap.pngBytes)], {
        type: "image/png",
      });
      const url = URL.createObjectURL(blob);
      cb.addSnapshot(pageId, url);
    } catch (err) {
      cb.pushWarning(`snapshot ${pageId}: ${String(err)}`);
    }
  }

  cb.setStatus(
    `loaded ${handle.pageCount} page${handle.pageCount === 1 ? "" : "s"}`,
  );
  cb.setSnapshotsReady(true);
}
