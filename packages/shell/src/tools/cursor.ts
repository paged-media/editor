// Concept 1 (toolbar) — the cursor contract.
//
// A tool carries a base cursor; its active gesture handler may
// override the cursor per pointer position (Pen near an anchor vs.
// over empty canvas) via `GestureHandler.cursorAt`. The "function of
// handler state" the concept describes is NOT a third CursorSpec
// variant — it's the handler returning one of the two concrete
// shapes below per position.
//
// `resolveCursorCss` (the spec → `element.style.cursor` string) and
// the small SVG cursor set land in Phase 3; this file pins the type
// so the registry + handler contract can reference it now.

/** CSS cursor keywords we use. Cheapest option — no asset, DPR-free. */
export type CssCursorToken =
  | "default"
  | "crosshair"
  | "grab"
  | "grabbing"
  | "move"
  | "text"
  | "pointer"
  | "not-allowed"
  | "copy"
  | "cell"
  | "zoom-in"
  | "zoom-out"
  | "nwse-resize"
  | "nesw-resize"
  | "ew-resize"
  | "ns-resize";

/**
 * A cursor is either a CSS keyword, or a custom SVG image with an
 * explicit hotspot. SVG (not PNG) so it scales with device pixel
 * ratio. Keep the custom set small — most tools use a CSS token.
 */
export type CursorSpec =
  | { kind: "css"; token: CssCursorToken }
  | { kind: "svg"; /** inline data-URI of an SVG */ src: string; hotspot: { x: number; y: number } };

/**
 * Turn a `CursorSpec` into the value for `element.style.cursor`. SVG
 * becomes `url("…") hx hy, default`; a CSS spec is its token.
 * `undefined` → "default".
 */
export function resolveCursorCss(spec: CursorSpec | undefined): string {
  if (!spec) return "default";
  if (spec.kind === "css") return spec.token;
  return `url("${spec.src}") ${spec.hotspot.x} ${spec.hotspot.y}, default`;
}
