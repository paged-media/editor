// Concept 1 (toolbar) — the GestureHandler contract.
//
// A tool's gesture handler is the object the gesture spine mounts on
// the canvas overlay when the tool becomes active. This file pins the
// CONTRACT only; the spine implementation + the concrete handlers
// (Select / Text / Pen / Rectangle) land in Phase 2, in apps/canvas
// (they need the canvas page-rect / camera math).
//
// Invariant 9 (sdk.md): a handler renders the in-progress gesture
// imperatively on the overlay, but MUTATES only through
// `paged.client.mutate(Mutation)` or the spine's worker gesture
// (beginGesture / updateGesture / commitGesture) — never by reaching
// into the model. Imperative rendering; declarative mutation.

import type { PagedEditor } from "../state/paged-editor";
import type { CursorSpec } from "./cursor";

/**
 * Why a handler is being deactivated. The distinction is load-bearing
 * for spring-loading (concept §"a stack, not a scalar"):
 *  - "switch"  — a real tool change; commit or cancel any in-flight
 *                gesture.
 *  - "suspend" — a spring-load push/pop (e.g. hold Space for a
 *                momentary Hand); the handler must KEEP its in-flight
 *                gesture so it resumes when the override is released.
 */
export type DeactivateReason = "switch" | "suspend";

/**
 * A pointer event on the canvas overlay, already page-resolved and
 * camera-inverted by the spine, so handlers never touch camera math.
 * Mirrors what ViewportCanvas computes today (viewportToDoc +
 * findContainingPage). Coordinates are document points (pt).
 */
export interface CanvasPointerEvent {
  /** Page the pointer is over, or null on the pasteboard. */
  pageId: string | null;
  /** Page-local point in pt (docPoint − pageRect origin). null off-page. */
  pagePoint: [number, number] | null;
  /** Page-independent document point in pt. */
  docPoint: [number, number];
  /** Modifier snapshot (constrain / from-centre / momentary tools). */
  modifiers: { shift: boolean; alt: boolean; cmd: boolean; ctrl: boolean };
  /** Largest pointer delta this gesture, CSS px — for click-vs-drag. */
  maxDelta: number;
  /** Mouse button (0 = primary). */
  button: number;
  /** Underlying DOM target — handlers may read `data-handle` etc. */
  target: EventTarget | null;
  /**
   * Pointer-Events normalized pressure, 0..1 (B-08). Read straight
   * from the DOM `PointerEvent.pressure`, so browser semantics carry
   * through: a pen reports physical pressure; a mouse reports `0`
   * with no button held and `0.5` while a button is held. Gates
   * variable-width stylus strokes (§13.12, Tier B). Defaults to
   * `0.5` on synthetic events that omit it.
   */
  pressure: number;
  /** Pen tilt around the X axis, −90..90 deg. `0` for mouse/touch and
   *  pens without tilt support. */
  tiltX: number;
  /** Pen tilt around the Y axis, −90..90 deg. `0` for mouse/touch and
   *  pens without tilt support. */
  tiltY: number;
  /** Originating device class (`PointerEvent.pointerType`). Defaults
   *  to `"mouse"`. */
  pointerType: "mouse" | "pen" | "touch";
}

/**
 * An ephemeral overlay primitive a handler publishes during a gesture
 * (rubber-band rect, pen path preview, anchor dots). The concrete
 * variants are defined alongside the active-tool overlay in Phase 2;
 * the contract keeps it opaque so the type is stable now.
 */
export type OverlayPrimitive = Record<string, unknown>;

/** What `renderOverlay` draws into. The active-tool overlay reads the
 *  published primitives and renders them in the shared camera-
 *  transformed SVG. */
export interface OverlayContext {
  /** Publish this frame's ephemeral primitives; cleared on the next
   *  publish or on deactivate. */
  setPreview(primitives: readonly OverlayPrimitive[]): void;
}

/**
 * The contract every tool's `gesture()` factory returns. Optional
 * members let simple handlers ignore keys / cursors / overlay
 * rendering.
 */
export interface GestureHandler {
  /** Tool became active. Receives the editor handle. */
  onActivate(paged: PagedEditor): void;
  /** Another tool takes over (or a spring-load suspend). */
  onDeactivate(reason: DeactivateReason): void;

  /** Pointer lifecycle on the canvas overlay, in document (pt) coords. */
  onPointerDown(e: CanvasPointerEvent): void;
  onPointerMove(e: CanvasPointerEvent): void;
  onPointerUp(e: CanvasPointerEvent): void;

  /** Keyboard while the tool is active (e.g. Enter commits a pen path). */
  onKey?(e: KeyboardEvent): void;

  /** State-dependent cursor (Pen near an anchor differs from Pen on
   *  empty canvas). Returning undefined falls back to the tool's base
   *  cursor. */
  cursorAt?(e: CanvasPointerEvent): CursorSpec | undefined;

  /** Draw the in-progress gesture on the overlay (rubber-band, handles). */
  renderOverlay?(ctx: OverlayContext): void;
}
