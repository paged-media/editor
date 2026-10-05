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

// Step 5c — path-edit mode: entry, exit, and the session that edits.
//
// Lives next to the rest of apps/canvas's UI hooks (mirrors
// useKeyboardShortcuts.ts) so it can be mounted by the canvas
// integration component without dragging shell into canvas
// internals. Behaviour:
//
//   Enter (on a single path-bearing selection) → enter path-edit
//                                                mode.
//   Escape (while in path-edit mode)           → cancel the drag in
//                                                flight, else exit.
//   Selection clears or shrinks past a single  → exit.
//   element                                       (so a marquee
//                                                drag doesn't
//                                                leave the
//                                                overlay stuck).
//   Active tool changes                        → exit (text tool
//                                                conflicts with
//                                                path editing).
//
// THE DIRECT SELECTION TOOL is this same mode with the entry step
// removed. With it in hand, the mode follows the selection: a single
// path-bearing element is in path-edit mode the moment it is selected
// (click it, or pick the tool with it already selected), and anything
// else — an oval, a group, two elements, nothing — simply is not. There
// is no second mode and no second pointer path: the tool is the
// Selection tool's click plus this hook.
//
// WHILE THE MODE IS ON a `DirectSelectSession` (@paged-media/tools — the
// shim over paged.draw's Direct Selection machine) is mounted for the
// target and published on the selection context, where the path-edit
// overlay draws it and the canvas routes pointer input to it. This hook
// feeds it the keys:
//
//   Arrow keys          → nudge the selected anchors (Shift ×10)
//   Backspace / Delete  → remove the selected anchors
//
// Those keys are the anchors' for as long as the mode is on, selected
// anchor or not — `paged.object.delete` / `.nudge*` yield them through
// their `when` (`objectVerbApplies`), and this listener prevents the
// default so the keybinding registry's widget-key guard agrees.

import { useEffect, useRef } from "react";

import {
  DIRECT_SELECT_TOOL_ID,
  elementSupportsPathEdit,
  useCanvasClient,
  useOptionalTool,
  useSelection,
} from "@paged-media/shell";
import { DirectSelectSession, engineSnapPoint, isPathEditKey } from "@paged-media/tools";

import { problemsSink } from "../panels/problems-store";

/** Diagnostics source for path-edit refusals in the Problems panel. */
export const PATH_EDIT_DIAGNOSTIC_SOURCE = "paged.pathEdit";

export function usePathEditMode() {
  const {
    activeTool,
    elementSelection,
    pathEditMode,
    setPathEditMode,
    pathEditSession,
    setPathEditSession,
    setSelectedAnchors,
    setElementGeometry,
  } = useSelection();
  const client = useCanvasClient();
  // The tool the user PICKED, not the effective one: holding Cmd
  // spring-loads Direct Selection over every Cmd chord, and that is
  // modifier posture, not a request to edit points.
  const baseTool = useOptionalTool()?.toolState.base ?? null;
  const directSelect = baseTool === DIRECT_SELECT_TOOL_ID;

  const target =
    pathEditMode &&
    elementSelection.length === 1 &&
    elementSupportsPathEdit(elementSelection[0])
      ? elementSelection[0]
      : null;
  const targetKind = target?.kind;
  const targetId = target ? JSON.stringify(target.id) : null;

  // A refusal stays in the Problems panel until the next key the
  // anchors take, so the panel shows the LAST edit's outcome and never
  // a stale one (the `paged.object.*` discipline).
  const reportedRef = useRef(false);

  // The session — one per target, for as long as it is the target.
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    const element = targetRef.current;
    if (!element) return;
    const session = new DirectSelectSession({
      client,
      target: element,
      onSelectionChange: setSelectedAnchors,
      // v67 (RFI C-68) — the engine snaps a dragged anchor to everything
      // on the page; an older engine answers nothing and the session
      // keeps its local snap to this path's own anchors.
      snapEngine: (query) =>
        engineSnapPoint(client.send.bind(client) as never, query),
      // An anchor edit moves the element's bounds; the selection outline
      // is drawn from cached geometry, so it is re-read with the path.
      onPathChanged: () => {
        void client
          .elementGeometry([element])
          .then((items) => {
            if (targetRef.current === element) setElementGeometry(items);
          })
          .catch(() => {
            /* geometry is chrome — its absence never blocks the edit */
          });
      },
      report: (severity, message) => {
        reportedRef.current = true;
        problemsSink.publish(PATH_EDIT_DIAGNOSTIC_SOURCE, "path-edit", [
          { severity, message, source: "path-edit" },
        ]);
      },
    });
    setPathEditSession(session);
    return () => {
      session.dispose();
      setPathEditSession(null);
      // A stale index pointing into a different path's anchor table
      // would mis-address the next edit.
      setSelectedAnchors([]);
    };
    // Keyed on the target's IDENTITY: a re-selection of the same element
    // hands back a new array and must not tear the session down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, targetKind, targetId]);

  // Escape with Direct Selection in hand leaves the mode for THIS
  // selection only; the same selection array must not re-enter it on
  // the next render. A new selection (even of the same element — a
  // click hands back a new array) is a new request.
  const dismissedRef = useRef<unknown>(null);

  // Enter / Escape and the anchors' keys — skip when an editable
  // element has focus so typing in the command palette / inspector
  // doesn't toggle path-edit mode by accident.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === "Enter") {
        if (pathEditMode) return; // already on; let other handlers see Enter
        if (elementSelection.length !== 1) return;
        if (!elementSupportsPathEdit(elementSelection[0])) return;
        e.preventDefault();
        setPathEditMode(true);
        return;
      }
      if (!pathEditMode) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // Mid-gesture, Escape is the gesture's: the drag is undone and
        // the mode stays.
        if (pathEditSession?.key(e)) return;
        dismissedRef.current = elementSelection;
        setPathEditMode(false);
        return;
      }
      // Chords are somebody else's (Cmd+Backspace, Ctrl+Arrow).
      if (e.metaKey || e.ctrlKey || !isPathEditKey(e.key)) return;
      e.preventDefault();
      if (reportedRef.current) {
        reportedRef.current = false;
        problemsSink.clear(PATH_EDIT_DIAGNOSTIC_SOURCE);
      }
      pathEditSession?.key(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathEditMode, pathEditSession, elementSelection, setPathEditMode]);

  // Auto-exit when the selection isn't a single path-bearing
  // element any more (cleared, or grew to a multi-select).
  useEffect(() => {
    if (!pathEditMode) return;
    if (
      elementSelection.length !== 1 ||
      !elementSupportsPathEdit(elementSelection[0])
    ) {
      setPathEditMode(false);
    }
  }, [pathEditMode, elementSelection, setPathEditMode]);

  // Auto-exit on tool switch.
  useEffect(() => {
    if (pathEditMode && activeTool !== "select") {
      setPathEditMode(false);
    }
  }, [pathEditMode, activeTool, setPathEditMode]);

  // Direct Selection: the mode follows the selection.
  useEffect(() => {
    if (!directSelect || pathEditMode) return;
    if (
      elementSelection.length !== 1 ||
      !elementSupportsPathEdit(elementSelection[0])
    ) {
      return;
    }
    if (dismissedRef.current === elementSelection) return;
    setPathEditMode(true);
  }, [directSelect, pathEditMode, elementSelection, setPathEditMode]);

  // Putting Direct Selection down leaves the mode it holds open. Keyed
  // on the tool alone: this must fire on the CHANGE away from it, not
  // whenever the mode is on under another tool (Selection + Enter).
  const wasDirectSelect = useRef(directSelect);
  useEffect(() => {
    const was = wasDirectSelect.current;
    wasDirectSelect.current = directSelect;
    if (was && !directSelect) setPathEditMode(false);
  }, [directSelect, setPathEditMode]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
