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

import { useEffect, useMemo, useRef } from "react";

import {
  GestureSpine,
  resolveCursorCss,
  usePaged,
  type CanvasPointerEvent,
} from "@paged-media/shell";

// Concept 1 (Phase 2) — mounts the gesture spine in the canvas app
// and bridges it to ViewportCanvas. Subscribes to the effective tool
// (from the ToolContext stack) and swaps the mounted handler; exposes
// `toolGesture` (the pointer dispatchers + hover cursor) ONLY while
// the effective tool carries a handler — otherwise null, so
// ViewportCanvas runs its proven select/text path untouched.
//
// Also routes keyboard events to the active handler (`onKey` — e.g.
// Escape cancels the Rectangle drag), skipping DOM editables.

export interface ToolGestureDispatch {
  onDown: (e: CanvasPointerEvent) => void;
  onMove: (e: CanvasPointerEvent) => void;
  onUp: (e: CanvasPointerEvent) => void;
  /** Abort an in-flight tool gesture WITHOUT committing (pointer
   *  capture loss / window blur). The pointer-up path commits; this
   *  one rolls back. Delivered as the handler's Escape, the uniform
   *  zero-mutation cancel every draw handler implements (INV-8). */
  onCancel: () => void;
  /** Per-position cursor from the handler's `cursorAt`, resolved to a
   *  CSS string; undefined falls back to the tool's base cursor. */
  hoverCursor?: (e: CanvasPointerEvent) => string | undefined;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

export function useGestureSpine(): {
  toolGesture: ToolGestureDispatch | null;
  /** CSS cursor for the effective tool, or undefined to keep the
   *  default canvas cursor. */
  cursor: string | undefined;
  /** The effective ToolId — lets the canvas wire tool-specific
   *  behaviour that ISN'T a gesture handler (Hand → pan, Zoom →
   *  click-zoom) through its proven legacy machinery. */
  effectiveTool: string;
} {
  const paged = usePaged();
  const spineRef = useRef<GestureSpine | null>(null);
  if (!spineRef.current) spineRef.current = new GestureSpine();
  const spine = spineRef.current;

  const effectiveTool = paged.tool.effectiveTool;
  const lastReason = paged.tool.lastReason;

  // Activate/deactivate handlers as the effective tool changes. `paged`
  // is read fresh at effect time (it carries the registry + client the
  // handler needs); keying on effectiveTool/lastReason keeps the swap
  // aligned with the stack.
  useEffect(() => {
    spine.setEffectiveTool(effectiveTool, paged, lastReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTool, lastReason]);

  // Keyboard → active handler (Escape cancels an in-flight gesture).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!spine.hasActive()) return;
      if (isEditableTarget(e.target)) return;
      spine.key(e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spine]);

  // Tear the handler down on unmount.
  useEffect(() => () => spine.clear(), [spine]);

  // Resolve from the registry (synchronous + correct on the same render
  // the tool changed, before the effect runs).
  const contribution = paged.registries.tools.get(effectiveTool);
  const hasHandler = contribution?.gesture != null;
  const hasCursorAt = hasHandler;
  const cursor = contribution?.cursor
    ? resolveCursorCss(contribution.cursor)
    : undefined;

  return useMemo(
    () => ({
      toolGesture: hasHandler
        ? {
            onDown: (e: CanvasPointerEvent) => spine.pointerDown(e),
            onMove: (e: CanvasPointerEvent) => spine.pointerMove(e),
            onUp: (e: CanvasPointerEvent) => spine.pointerUp(e),
            onCancel: () =>
              spine.key(
                new KeyboardEvent("keydown", { key: "Escape" }),
              ),
            hoverCursor: hasCursorAt
              ? (e: CanvasPointerEvent) => {
                  const spec = spine.cursorAt(e);
                  return spec ? resolveCursorCss(spec) : undefined;
                }
              : undefined,
          }
        : null,
      cursor,
      effectiveTool,
    }),
    [hasHandler, hasCursorAt, cursor, effectiveTool, spine],
  );
}
