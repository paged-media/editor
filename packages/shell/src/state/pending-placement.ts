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

// Place — "where should this go?", asked with the pointer.
//
// THE GAP. `File ▸ Place…` picked an image and dropped it CENTRED on the
// current page. Every place landed in the same spot, so placing four
// images meant placing four images on top of each other and dragging
// three of them off the pile. The plan called this a missing "loaded
// cursor", which mis-described it: Place has no modal state to escape,
// and the cursor is the symptom. The gap is that the user is never
// asked WHERE.
//
// WHY A BARE PROMISE AND NOT A CONTEXT. The threading cursor solves the
// same shape — arm, then let the next click resolve — with a context, a
// provider and a headless controller component, because threading has
// STATE worth sharing: which frame you dragged from, what the ports
// should draw while loaded, what Esc means. Place has none of that. It
// needs one point, once, inside a function that is already async. A
// promise is the whole feature, and a second copy of the threading
// machinery would be more code that can disagree with itself.
//
// THE CURSOR IS SET WITH `!important` ON THE ROOT for the reason
// ThreadingController documents at its own call site: the canvas, the
// panels and the menu bar each set their own cursor, so anything less
// specific loses over most of the window and the copy cursor appears
// only in the gaps.

/** A client-space point the user clicked, or `null` when they cancelled. */
export interface PlacementPoint {
  clientX: number;
  clientY: number;
  /** Where the pointer was released when the press was a DRAG (ED-6):
   *  the user drew the box the placed item should fill. Absent for a
   *  click. */
  to?: { clientX: number; clientY: number };
}

export interface PlacementOptions {
  /** Called while a drag is under way with the press and the pointer now,
   *  and with `null` when it ends — for a live preview of the box. */
  onDrag?: (
    from: { clientX: number; clientY: number },
    to: { clientX: number; clientY: number } | null,
  ) => void;
}

/** Screen px a press must travel before it is a drag — the canvas's own
 *  click/drag threshold. */
const DRAG_THRESHOLD_PX = 4;

/** Marks the armed state for specs and for anything that wants to react
 *  to it. `documentElement` rather than a React node so it survives a
 *  dock re-layout mid-gesture. */
const ARMED_ATTR = "data-paged-placement";

let armed = false;

/** True while a placement is waiting for its click. */
export function placementArmed(): boolean {
  return armed;
}

/**
 * Arm a placement and resolve with the point the user clicks next — or,
 * when they DRAG, with the press and the release (`to`), the box they
 * drew (ED-6: a drag used to be ignored, the press alone resolved).
 *
 * Resolves `null` when the user presses Escape, right-clicks, or clicks
 * anywhere outside the canvas — every one of which means "no point was
 * chosen", and the caller must place nothing rather than fall back to a
 * guess. A placement that silently landed somewhere after a cancel
 * would be worse than the centred behaviour it replaces, because the
 * user believes they cancelled.
 */
export function awaitPlacementPoint(
  options: PlacementOptions = {},
): Promise<PlacementPoint | null> {
  return new Promise<PlacementPoint | null>((resolve) => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("cursor");
    const previousPriority = root.style.getPropertyPriority("cursor");

    /** The press inside the canvas, while its release is awaited. */
    let pressed: { clientX: number; clientY: number } | null = null;
    let dragging = false;

    let settled = false;
    const finish = (value: PlacementPoint | null) => {
      if (settled) return;
      settled = true;
      armed = false;
      root.removeAttribute(ARMED_ATTR);
      if (previous) root.style.setProperty("cursor", previous, previousPriority);
      else root.style.removeProperty("cursor");
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("keydown", onKey, true);
      if (dragging) options.onDrag?.(pressed!, null);
      resolve(value);
    };

    const onDown = (e: PointerEvent) => {
      // Right/middle click is not a placement — treat it as a cancel so
      // a stray press cannot strand the armed state forever.
      if (e.button !== 0) {
        finish(null);
        return;
      }
      // A click OUTSIDE the canvas cancels and is LET THROUGH.
      //
      // The obvious implementation — capture every pointerdown anywhere
      // and consume it — is the bug this campaign already catalogued in
      // the threading controller: while a cursor was loaded, a click
      // meant for a panel or a menu was eaten, so the surface went dead
      // and the only way out was Escape. Reaching for File ▸ New with a
      // placement armed must open the File menu, not silently disarm
      // into nothing. So: no preventDefault, no stopPropagation, and the
      // placement quietly stands down.
      const viewport = document.querySelector("[data-paged-viewport]");
      const target = e.target as Node | null;
      if (!viewport || !target || !viewport.contains(target)) {
        finish(null);
        return;
      }
      // Inside the canvas: consume it, or the canvas ALSO starts a
      // marquee/selection under the image being placed. Then wait for the
      // release, which decides between a click and a drawn box.
      e.preventDefault();
      e.stopPropagation();
      if (pressed) return;
      pressed = { clientX: e.clientX, clientY: e.clientY };
    };

    const onMove = (e: PointerEvent) => {
      if (!pressed) return;
      // The canvas never saw the press; keep the drag from it too.
      e.stopPropagation();
      dragging ||=
        Math.hypot(e.clientX - pressed.clientX, e.clientY - pressed.clientY) >
        DRAG_THRESHOLD_PX;
      if (dragging) options.onDrag?.(pressed, { clientX: e.clientX, clientY: e.clientY });
    };

    const onUp = (e: PointerEvent) => {
      if (!pressed) return;
      e.preventDefault();
      e.stopPropagation();
      finish(
        dragging
          ? { ...pressed, to: { clientX: e.clientX, clientY: e.clientY } }
          : pressed,
      );
    };

    // Capture stolen mid-press: the press is still the user's answer.
    const onPointerCancel = () => {
      if (pressed) finish(pressed);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    };

    armed = true;
    root.setAttribute(ARMED_ATTR, "armed");
    root.style.setProperty("cursor", "copy", "important");
    // Capture phase, so this wins the pointer before ViewportCanvas's
    // own pointerdown handler begins a gesture.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("keydown", onKey, true);
  });
}

/** Cancel an armed placement from outside.
 *
 *  `confirmDiscard` (File ▸ New / File ▸ Open) calls this: a placement
 *  armed against the OLD document must not resolve into the new one.
 *  Clicking those menu items already cancels — a click outside the
 *  canvas stands the placement down — but the KEYBOARD route reaches
 *  the command with the placement still armed. */
export function cancelPendingPlacement(): void {
  if (!armed) return;
  // Escape is the same cancel this promise already understands, so the
  // teardown lives in one place rather than two that can drift.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}
