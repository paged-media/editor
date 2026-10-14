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

// A selection a SCRIPT makes reaches the shell.
//
// `paged.setElementSelection([...])` / `paged.clearSelection()` move the
// ENGINE's selection inside the worker, and nothing tells the main thread:
// the shell's mirror (the selection box, the control bar, every panel
// bound to the selection) went on showing what was selected before. Every
// script run ends in a `scriptResult` reply, whoever started it (Script
// panel, console, playground, the assistant, a plugin's script bridge),
// and every reply fans out to the client's subscribers, so that is the one
// place to look.
//
// After a run the engine's selection is read back and compared with the
// selection the engine last REPORTED (every `elementSelectionApplied`
// reply names it). Only a script that changed it is followed, the way a
// click is: the selection, then its geometry. Comparing against the
// engine's own last answer rather than the shell's mirror keeps the
// shell's mirror-only selections (a harness, a panel row) out of it, and
// a background read-only script (`paged.stories()` behind the thread
// lines) changes nothing and so updates nothing.

import type {
  CanvasClient,
  ElementGeometryItem,
  ElementId,
} from "@paged-media/client";

type Client = Pick<CanvasClient, "subscribe" | "setElementSelection" | "elementGeometry">;

export interface ScriptSelectionSink {
  setElementSelection(ids: ElementId[]): void;
  setElementGeometry(items: ElementGeometryItem[]): void;
}

const key = (ids: readonly ElementId[]) => JSON.stringify(ids);

/** Follow selections scripts make; returns the unsubscribe. */
export function followScriptSelection(client: Client, sink: ScriptSelectionSink): () => void {
  // The engine's selection as its last reply named it.
  let reported: readonly ElementId[] = [];
  // Runs that finish while a read is in flight need one more read, not one
  // each: the engine answers its CURRENT selection.
  let reading = false;
  let again = false;
  let disposed = false;

  const check = async (): Promise<void> => {
    if (reading) {
      again = true;
      return;
    }
    reading = true;
    try {
      do {
        again = false;
        const before = reported;
        // An empty "add" changes nothing and answers the selection; its
        // reply also updates `reported`.
        const ids = await client.setElementSelection([], "add");
        if (disposed) return;
        if (key(ids) === key(before)) continue;
        sink.setElementSelection(ids);
        try {
          const items = await client.elementGeometry(ids);
          if (!disposed) sink.setElementGeometry(items);
        } catch {
          // Geometry is selection chrome; the selection itself is set.
        }
      } while (again && !disposed);
    } catch {
      // Worker reload / disconnect — the next run reads again.
    } finally {
      reading = false;
    }
  };

  const off = client.subscribe((msg) => {
    switch (msg.kind) {
      case "elementSelectionApplied":
        reported = msg.payload.ids;
        return;
      case "documentLoaded":
        reported = [];
        return;
      case "scriptResult":
        void check();
        return;
      default:
        return;
    }
  });
  return () => {
    disposed = true;
    off();
  };
}
