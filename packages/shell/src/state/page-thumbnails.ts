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

// Keeps the per-page thumbnails (`useDocument().snapshots`) in step with
// the document after it loads. The load pass (`document-loader`) takes
// one thumbnail per page and nothing else ever took another, so a page
// added later — a Data Merge batch, the Pages panel, a script — showed
// a blank tile for good, and an edited page kept its pre-edit picture.
//
// Two triggers, one sequential queue:
//   - the page list: a page the handle lists with no thumbnail gets one,
//     a thumbnail whose page is gone is dropped (and its URL revoked);
//   - the engine's change replies: the pages a mutation / undo / redo /
//     committed gesture / scene layer names are taken again.
// A `scriptResult` names no pages, so script edits to EXISTING pages are
// not re-taken here (pages a script adds still are, through the list).
//
// Requests run one at a time after the edits settle: the worker is
// single-threaded, so a burst of requests would only queue in front of
// the user's next edit.

import { useEffect, useRef } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { PageId, WorkerToMain } from "@paged-media/client";

import { useCanvasClient } from "./canvas-client-context";
import { useDocument } from "./document-context";
import { requestPageThumbnail } from "./document-loader";

/** Quiet time before the queue drains, so typing or a run of mutations
 *  costs one thumbnail per page, not one per keystroke. */
const SETTLE_MS = 250;

interface ThumbnailQueue {
  /** Pages whose thumbnail is due. */
  pending: Set<PageId>;
  /** Drain `pending` once the edits settle. */
  schedule: () => void;
}

/** The pages a change reply says it touched (null: none named). */
function changedPages(msg: WorkerToMain): readonly PageId[] | null {
  switch (msg.kind) {
    case "mutationApplied":
    case "undoApplied":
    case "redoApplied":
    case "gestureCommitted":
      return msg.payload.pageIds;
    case "sceneLayerApplied":
      return msg.payload.applied ? (msg.payload.pageIds ?? null) : null;
    default:
      return null;
  }
}

export function usePageThumbnails(): void {
  const client = useCanvasClient();
  const { handle, snapshots, snapshotsReady, setSnapshots } = useDocument();

  // The drain is async and outlives renders; it reads the document
  // through this ref, never through a closure over one render.
  const live = useRef({ handle, snapshots, snapshotsReady });
  live.current = { handle, snapshots, snapshotsReady };

  const queue = useRef<ThumbnailQueue | null>(null);

  useEffect(() => {
    const pending = new Set<PageId>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let draining = false;
    let disposed = false;

    const drain = async (): Promise<void> => {
      if (draining || disposed) return;
      draining = true;
      // A load pass is running (or there is no document): it takes every
      // page itself, and the page-list effect re-schedules when it ends.
      let waiting = false;
      try {
        while (pending.size > 0 && !disposed) {
          const { handle: h, snapshotsReady: ready } = live.current;
          if (!h || !ready) {
            waiting = true;
            return;
          }
          // Document order, and only pages the handle knows: a reply can
          // name a page the handle has not caught up with yet, and the
          // page-list effect queues that one when it does.
          const order = h.pageIds.filter((id) => pending.has(id));
          pending.clear();
          for (const pageId of order) {
            let url: string;
            try {
              url = await requestPageThumbnail(client, pageId);
            } catch {
              continue; // deleted meanwhile; nothing to show
            }
            const now = live.current;
            if (
              disposed ||
              !now.snapshotsReady ||
              now.handle?.docId !== h.docId ||
              !now.handle.pageIds.includes(pageId)
            ) {
              // The document was replaced (or the page removed) while
              // the request was out: this picture belongs to nothing.
              URL.revokeObjectURL(url);
              continue;
            }
            setSnapshots((prev) => {
              const next = new Map(prev);
              const old = next.get(pageId);
              if (old && old !== url) URL.revokeObjectURL(old);
              next.set(pageId, url);
              return next;
            });
          }
        }
      } finally {
        draining = false;
        // Pages queued while the last request was out.
        if (!waiting && !disposed && pending.size > 0) schedule();
      }
    };

    const schedule = (): void => {
      if (disposed) return;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void drain();
      }, SETTLE_MS);
    };

    queue.current = { pending, schedule };

    const off = client.subscribe((msg) => {
      const pages = changedPages(msg);
      if (!pages || pages.length === 0) return;
      for (const id of pages) pending.add(id);
      schedule();
    });
    return () => {
      disposed = true;
      off();
      if (timer != null) clearTimeout(timer);
      queue.current = null;
    };
  }, [client, setSnapshots]);

  // The page list: thumbnails for pages that have none, none for pages
  // that are gone. Waits for the load pass (`snapshotsReady`), which
  // takes the first set itself.
  const docId = handle?.docId ?? null;
  const lastDocId = useRef<string | null>(null);
  useEffect(() => {
    const q = queue.current;
    if (!q) return;
    if (docId !== lastDocId.current) {
      // A new document: whatever the old one queued names its pages.
      lastDocId.current = docId;
      q.pending.clear();
    }
    if (!handle || !snapshotsReady) return;
    const listed = new Set<PageId>(handle.pageIds);
    const current = live.current.snapshots;
    const gone = [...current.keys()].filter((id) => !listed.has(id));
    if (gone.length > 0) {
      setSnapshots((prev) => {
        const next = new Map(prev);
        for (const id of gone) {
          const url = next.get(id);
          if (url) URL.revokeObjectURL(url);
          next.delete(id);
        }
        return next;
      });
    }
    for (const id of handle.pageIds) {
      if (!current.has(id)) q.pending.add(id);
    }
    if (q.pending.size > 0) q.schedule();
  }, [docId, handle, snapshotsReady, setSnapshots]);
}
