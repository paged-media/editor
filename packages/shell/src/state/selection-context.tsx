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

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  ElementGeometryItem,
  ElementId,
} from "@paged-media/client";

import {
  useOptionalTool,
  SELECT_TOOL_ID,
  TEXT_TOOL_ID,
} from "./tool-context";
import type { ToolId } from "../registries/tool";

export type ActiveTool = "select" | "text";

// Concept 1 — `activeTool` is now a facade over the ToolContext stack.
// The four legacy consumers (canvas-panel, ViewportCanvas, path-edit,
// tools-panel) still read the scalar union; these helpers translate
// between it and the richer `ToolId`. Only the two built-in tools map;
// any other effective tool reports "select" until those consumers
// migrate to `ToolId`.
function legacyToolFor(id: ToolId): ActiveTool {
  return id === TEXT_TOOL_ID ? "text" : "select";
}
function toolIdForLegacy(t: ActiveTool): ToolId {
  return t === "text" ? TEXT_TOOL_ID : SELECT_TOOL_ID;
}

interface SelectionContextValue {
  /** Currently-selected page items (text frames, rectangles, …). */
  elementSelection: ElementId[];
  setElementSelection: (ids: ElementId[]) => void;

  /** Oriented bounds + transform for every selected element. The
   * overlay multiplies bounds by the transform to draw chrome
   * without re-deriving the math in TS. */
  elementGeometry: ElementGeometryItem[];
  setElementGeometry: (items: ElementGeometryItem[]) => void;

  /** Active mode: select = element gestures, text = caret/typing. */
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;

  /** Step 5c — path-edit mode. While `true`, the path-edit overlay
   * renders anchor + handle dots on the selected polygon and the
   * pointer routes hits through `hit_path_anchor` instead of the
   * default frame hit. Enter on a single Polygon enters; Escape
   * exits. The mode auto-exits when the selection clears or the
   * active tool changes. */
  pathEditMode: boolean;
  setPathEditMode: (enabled: boolean) => void;

  /** Track J — flat anchor index inside the path-edit target's
   * anchor table that the user has clicked. `null` when no anchor
   * is selected. Backspace/Delete uses this to address the
   * `PathPointRemove` mutation; double-click uses it to address the
   * `PathPointCurveType` toggle. Cleared on path-edit exit, on
   * selection change, and on Escape. */
  selectedAnchorIndex: number | null;
  setSelectedAnchorIndex: (index: number | null) => void;

  /** Track L — the group the user has "entered" via double-click.
   * `null` when no group is active (default — single-click selects
   * the outermost group containing the hit). When set, single-click
   * scopes to the group's leaves and Escape exits. The held value
   * is the group's `self_id`, not an `ElementId`, because the only
   * place the value gets compared is the canvas-panel's onHit
   * handler — keeping it as a plain string sidesteps cross-package
   * ElementId imports for state-only consumers. */
  activeGroup: string | null;
  setActiveGroup: (groupId: string | null) => void;
}

const Context = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: PropsWithChildren) {
  const [elementSelection, setElementSelection] = useState<ElementId[]>([]);
  const [elementGeometry, setElementGeometry] = useState<ElementGeometryItem[]>(
    [],
  );
  // `activeTool` derives from the ToolContext when present. The
  // fallback `useState` keeps `SelectionProvider` usable standalone
  // (e.g. focused unit tests that don't mount `ToolProvider`).
  const tool = useOptionalTool();
  const [legacyToolFallback, setLegacyToolFallback] =
    useState<ActiveTool>("select");
  const activeTool = tool ? legacyToolFor(tool.effectiveTool) : legacyToolFallback;
  const setActiveTool = useCallback(
    (t: ActiveTool) => {
      if (tool) tool.setBaseTool(toolIdForLegacy(t));
      else setLegacyToolFallback(t);
    },
    [tool],
  );
  const [pathEditMode, setPathEditMode] = useState<boolean>(false);
  const [selectedAnchorIndex, setSelectedAnchorIndex] = useState<number | null>(
    null,
  );
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const value = useMemo<SelectionContextValue>(
    () => ({
      elementSelection,
      setElementSelection,
      elementGeometry,
      setElementGeometry,
      activeTool,
      setActiveTool,
      pathEditMode,
      setPathEditMode,
      selectedAnchorIndex,
      setSelectedAnchorIndex,
      activeGroup,
      setActiveGroup,
    }),
    [
      elementSelection,
      elementGeometry,
      activeTool,
      pathEditMode,
      selectedAnchorIndex,
      activeGroup,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSelection called outside SelectionProvider");
  }
  return ctx;
}
