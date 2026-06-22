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

import type { PagedEditor } from "../state/paged-editor";
import type { ToolId } from "../registries/tool";
import type {
  CanvasPointerEvent,
  DeactivateReason,
  GestureHandler,
} from "./gesture-handler";

// Concept 1 (Phase 2) — the gesture spine. Framework-agnostic: it
// owns the single mounted GestureHandler and swaps it when the
// effective tool changes, deactivating the OUTGOING handler before
// activating the INCOMING one (AC 6). Spring-load passes
// `reason: "suspend"` so a momentary tool doesn't cancel an in-flight
// gesture (AC 5). The canvas app drives it via `useGestureSpine`,
// feeding pointer events already resolved to document coordinates.

export class GestureSpine {
  private current: { id: ToolId; handler: GestureHandler } | null = null;

  get activeId(): ToolId | null {
    return this.current?.id ?? null;
  }

  hasActive(): boolean {
    return this.current !== null;
  }

  /**
   * Make `id` the effective tool. Idempotent for the same id (cheap on
   * frequent spring-load). Deactivates the outgoing handler first, then
   * activates the incoming one if it carries a `gesture()` factory;
   * tools without a handler leave the spine empty (the legacy pointer
   * path handles them).
   */
  setEffectiveTool(id: ToolId, paged: PagedEditor, reason: DeactivateReason): void {
    if (this.current?.id === id) return;
    if (this.current) this.current.handler.onDeactivate(reason);
    const handler = paged.registries.tools.get(id)?.gesture?.();
    if (handler) {
      handler.onActivate(paged);
      this.current = { id, handler };
    } else {
      this.current = null;
    }
  }

  /** Tear down the current handler (e.g. on unmount). */
  clear(reason: DeactivateReason = "switch"): void {
    if (this.current) {
      this.current.handler.onDeactivate(reason);
      this.current = null;
    }
  }

  pointerDown(e: CanvasPointerEvent): void {
    this.current?.handler.onPointerDown(e);
  }
  pointerMove(e: CanvasPointerEvent): void {
    this.current?.handler.onPointerMove(e);
  }
  pointerUp(e: CanvasPointerEvent): void {
    this.current?.handler.onPointerUp(e);
  }
  key(e: KeyboardEvent): void {
    this.current?.handler.onKey?.(e);
  }
  cursorAt(e: CanvasPointerEvent) {
    return this.current?.handler.cursorAt?.(e);
  }
}
