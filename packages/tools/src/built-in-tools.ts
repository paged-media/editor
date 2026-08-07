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

// Concept 1 — the built-in InDesign tool catalog, transcribed from
// `thoughts/docs/paged/editor/media/toolbar.png`. DATA only here:
// id / title / icon / shortcut / flyout group / section / default.
//
// EVERY entry in this list must be one of exactly two things:
//
//   1. WORKING — it carries a `gesture`, or an app-level consumer
//      routes its id (Selection / Direct Selection / Type via the
//      `legacyKey` bridge, Hand / Zoom via canvas-panel).
//   2. AN HONEST STUB — `status: "planned"`, which the rail renders
//      dimmed and refuses to activate and for which the shell
//      registers no command and no keybinding.
//
// The third state this file used to be full of — a rail entry with
// neither a gesture nor a consumer, which accepts a click and then
// silently does nothing — is a bug, not a placeholder: the user gets
// no signal, so the dead affordance reads as a fault in their own
// input. It is strictly worse than a visible stub.
//
// A `shortcut` on a planned tool is a RESERVATION (INV-REG-1 keeps
// tool keys globally unique across the built-ins and every plugin
// bundle) — the key is held for the real implementation, never bound.
//
// Registration order == toolbox reading order, so the rail's slot
// order (first-seen group order) and section order come out right.

import type { CursorSpec, ToolContribution } from "@paged-media/shell";

import { createEllipseHandler } from "./handlers/ellipse-tool";
import { createEyedropperHandler } from "./handlers/eyedropper-tool";
import { createGradientFeatherHandler } from "./handlers/gradient-feather-tool";
import { createGradientSwatchHandler } from "./handlers/gradient-tool";
import { createLineHandler } from "./handlers/line-tool";
import { createPolygonHandler } from "./handlers/polygon-tool";
import { createPageHandler } from "./handlers/page-tool";
import { createPencilHandler } from "./handlers/pencil-tool";
import { createPenHandler } from "./handlers/pen-tool";
import { createRectangleHandler } from "./handlers/rectangle-tool";
import { createScissorsHandler } from "./handlers/scissors-tool";
import { createShearHandler } from "./handlers/shear-tool";
import { createSmoothHandler } from "./handlers/smooth-tool";
import { createRotateHandler, createScaleHandler } from "./handlers/transform-tools";

export const BUILT_IN_TOOLS: ToolContribution[] = [
  // ── A · Selection tools ──────────────────────────────────────
  {
    id: "paged.tool.select",
    title: "Selection",
    icon: "tool-select",
    shortcut: "v",
    group: "select",
    section: "selection",
    isGroupDefault: true,
    legacyKey: "select",
  },
  {
    id: "paged.tool.directSelect",
    title: "Direct Selection",
    icon: "tool-directSelect",
    shortcut: "a",
    group: "directSelect",
    section: "selection",
    isGroupDefault: true,
  },
  {
    id: "paged.tool.page",
    title: "Page",
    icon: "tool-page",
    shortcut: "shift+p",
    group: "page",
    section: "selection",
    isGroupDefault: true,
    // Editor-ops — click arms, Alt+click inserts after, drag resizes,
    // Delete removes the armed page (engine ops landed, protocol v24).
    gesture: createPageHandler,
  },
  // STUB — the Gap tool resizes the WHITESPACE between neighbouring
  // frames, which needs a neighbourhood solver on top of `resizeFrame`
  // (the engine op exists; the editor-side geometry does not). `u` is
  // reserved, not bound.
  {
    id: "paged.tool.gap",
    title: "Gap",
    icon: "tool-gap",
    shortcut: "u",
    group: "gap",
    section: "selection",
    isGroupDefault: true,
    status: "planned",
  },
  // STUB — the Content Conveyor collects page items into a holding bin
  // and places COPIES of them elsewhere. There is no element-duplicate
  // arm on the wire at all (`duplicatePage` is page-scoped), so this
  // pair cannot be built editor-side today. `b` is reserved, not bound.
  {
    id: "paged.tool.contentCollector",
    title: "Content Collector",
    icon: "tool-contentCollector",
    shortcut: "b",
    group: "content",
    section: "selection",
    order: 0,
    isGroupDefault: true,
    status: "planned",
  },
  {
    id: "paged.tool.contentPlacer",
    title: "Content Placer",
    icon: "tool-contentPlacer",
    group: "content",
    section: "selection",
    order: 1,
    status: "planned",
  },

  // ── B · Drawing and Type tools ───────────────────────────────
  {
    id: "paged.tool.type",
    title: "Type",
    icon: "tool-type",
    shortcut: "t",
    group: "type",
    section: "drawType",
    order: 0,
    isGroupDefault: true,
    legacyKey: "text",
  },
  // RETIRED — "Type on a Path" used to sit here as an inert built-in
  // holding `shift+t`. paged.draw ships the working tool
  // (`media.paged.draw.tool.typeOnPath`, over core's v58
  // `attachTextToPath`) in this same `type` slot at order 2; the dead
  // built-in was shadowing it AND forcing it onto `shift+h`. Removing
  // it FREES `shift+t` — paged.draw should claim the canonical key for
  // `typeOnPath` (that assignment lives in the plugin's own repo).
  {
    id: "paged.tool.line",
    title: "Line",
    icon: "tool-line",
    shortcut: "\\",
    group: "line",
    section: "drawType",
    isGroupDefault: true,
    // Editor-ops — drag → `insertLine` (protocol v24).
    gesture: createLineHandler,
  },
  // W2.5 — the built-in Pen (group default of the "pen" slot): click =
  // corner anchor, click-drag = smooth anchor, Enter/first-anchor click
  // commits a single `insertPath`, Escape cancels. The Add/Delete/
  // Convert Anchor companions in the same slot are contributed by the
  // paged.draw BUNDLE (`media.paged.draw.tool.*`, registered via
  // `loadBundle(drawBundle)` in apps/canvas/main.tsx) and edit EXISTING
  // paths — orthogonal to authoring a new one here.
  {
    id: "paged.tool.pen",
    title: "Pen",
    icon: "tool-pen",
    shortcut: "p",
    group: "pen",
    section: "drawType",
    isGroupDefault: true,
    gesture: createPenHandler,
  },
  {
    id: "paged.tool.pencil",
    title: "Pencil",
    icon: "tool-pencil",
    shortcut: "n",
    group: "pencil",
    section: "drawType",
    order: 0,
    isGroupDefault: true,
    // Editor-ops — freehand → RDP → `insertPath{smooth}` (v24).
    gesture: createPencilHandler,
  },
  {
    id: "paged.tool.smooth",
    title: "Smooth",
    icon: "tool-smooth",
    group: "pencil",
    section: "drawType",
    order: 1,
    // Click a path → one `simplifyPath` (whole-element; see the
    // handler's honest-scope note). Tolerance is a tool option.
    gesture: createSmoothHandler,
    options: {
      toolId: "paged.tool.smooth",
      fields: [
        {
          kind: "number",
          key: "tolerance",
          label: "Tolerance",
          min: 0.1,
          max: 20,
          step: 0.1,
          unit: "pt",
        },
      ],
    },
  },
  // RETIRED — "Erase" was an inert built-in with no shortcut. paged.draw
  // ships the working eraser (`media.paged.draw.tool.eraserBrush`,
  // `shift+i`) in the `pen` slot.

  // The three FRAME tools drive the same handlers as their Shape-slot
  // twins. In InDesign a graphic frame differs from a shape only in its
  // default fill; in the paged model there is no separate placeholder
  // node kind at all — `insertFrame` / `insertOval` / `insertPath`
  // produce the Rectangle / Oval / Polygon that `placeImage` targets,
  // i.e. the frame. Wiring them to the existing handlers is therefore
  // exactly what the rail promises (and `f` is also a live pill on the
  // Design-mode context toolbar), not a second, parallel implementation.
  {
    id: "paged.tool.rectangleFrame",
    title: "Rectangle Frame",
    icon: "tool-rectangleFrame",
    shortcut: "f",
    group: "frame",
    section: "drawType",
    order: 0,
    isGroupDefault: true,
    gesture: createRectangleHandler,
  },
  {
    id: "paged.tool.ellipseFrame",
    title: "Ellipse Frame",
    icon: "tool-ellipseFrame",
    group: "frame",
    section: "drawType",
    order: 1,
    gesture: createEllipseHandler,
  },
  {
    id: "paged.tool.polygonFrame",
    title: "Polygon Frame",
    icon: "tool-polygonFrame",
    group: "frame",
    section: "drawType",
    order: 2,
    gesture: createPolygonHandler,
    // Sides / star inset are read from the `paged.tool.polygon`
    // settings key — InDesign likewise gives the Polygon and Polygon
    // Frame tools ONE shared Polygon Settings dialog.
    options: {
      toolId: "paged.tool.polygon",
      fields: [
        { kind: "number", key: "sides", label: "Number of Sides", min: 3, max: 100, step: 1 },
        { kind: "number", key: "starInset", label: "Star Inset", min: 0, max: 100, step: 1, unit: "%" },
      ],
    },
  },
  {
    id: "paged.tool.rectangle",
    title: "Rectangle",
    icon: "tool-rectangle",
    shortcut: "m",
    group: "shape",
    section: "drawType",
    order: 0,
    isGroupDefault: true,
    // Phase 2 — the first real gesture handler: drag → insertFrame.
    gesture: createRectangleHandler,
  },
  {
    id: "paged.tool.ellipse",
    title: "Ellipse",
    icon: "tool-ellipse",
    shortcut: "l",
    group: "shape",
    section: "drawType",
    order: 1,
    // W2.6 — drag → bounds preview → one `insertOval` (Shift = circle,
    // Alt = from centre; DR-02/DR-03).
    gesture: createEllipseHandler,
  },
  {
    id: "paged.tool.polygon",
    title: "Polygon",
    icon: "tool-polygon",
    group: "shape",
    section: "drawType",
    order: 2,
    // W2.6 — drag → N-gon/star preview → one `insertPath` (corner
    // anchors). Reads sides/starInset from tool-settings (T8 below).
    gesture: createPolygonHandler,
    // T8 — the canonical tool-options example (double-click the slot).
    options: {
      toolId: "paged.tool.polygon",
      fields: [
        { kind: "number", key: "sides", label: "Number of Sides", min: 3, max: 100, step: 1 },
        { kind: "number", key: "starInset", label: "Star Inset", min: 0, max: 100, step: 1, unit: "%" },
      ],
    },
  },

  // ── C · Transformation tools ─────────────────────────────────
  {
    id: "paged.tool.scissors",
    title: "Scissors",
    icon: "tool-scissors",
    shortcut: "c",
    group: "scissors",
    section: "transform",
    isGroupDefault: true,
    // Editor-ops — anchor click → `pathOpenAt` (protocol v24).
    gesture: createScissorsHandler,
  },
  // STUB — Free Transform is a MODE with its own unified handle box
  // (translate + resize + rotate + shear from one frame), not another
  // gesture arm. Every arm it would compose already exists engine-side;
  // what is missing is the overlay + handle hit-testing, which is a
  // feature, not a wiring. Until then the Selection tool's own handles
  // (resize, the rotate handle, Cmd+drag to scale) are the real path.
  // `e` is reserved, not bound.
  {
    id: "paged.tool.freeTransform",
    title: "Free Transform",
    icon: "tool-freeTransform",
    shortcut: "e",
    group: "transform",
    section: "transform",
    order: 0,
    isGroupDefault: true,
    status: "planned",
  },
  // Rotate / Scale drive the engine's `{kind:"rotate"}` / `{kind:"scale"}`
  // gesture arms — the same arms the selection chrome's rotate handle and
  // Cmd+handle-drag already commit, and the same transforms the
  // Object/Transform panel writes numerically. Both pivot on the
  // selection centroid; Shift constrains engine-side.
  {
    id: "paged.tool.rotate",
    title: "Rotate",
    icon: "tool-rotate",
    shortcut: "r",
    group: "transform",
    section: "transform",
    order: 1,
    gesture: createRotateHandler,
  },
  {
    id: "paged.tool.scale",
    title: "Scale",
    icon: "tool-scale",
    shortcut: "s",
    group: "transform",
    section: "transform",
    order: 2,
    gesture: createScaleHandler,
  },
  {
    id: "paged.tool.shear",
    title: "Shear",
    icon: "tool-shear",
    shortcut: "o",
    group: "transform",
    section: "transform",
    order: 3,
    // Editor-ops — worker gesture `{kind:"shear"}` (protocol v24).
    gesture: createShearHandler,
  },
  {
    id: "paged.tool.gradientSwatch",
    title: "Gradient Swatch",
    icon: "tool-gradientSwatch",
    shortcut: "g",
    group: "gradientSwatch",
    section: "transform",
    isGroupDefault: true,
    // Editor-ops — drag → batched gradient angle+length (v24).
    gesture: createGradientSwatchHandler,
  },
  {
    id: "paged.tool.gradientFeather",
    title: "Gradient Feather",
    icon: "tool-gradientFeather",
    shortcut: "shift+g",
    group: "gradientFeather",
    section: "transform",
    isGroupDefault: true,
    // Editor-ops — drag → whole-struct `frameGradientFeather` (v24).
    gesture: createGradientFeatherHandler,
  },

  // ── D · Modification and Navigation tools ────────────────────
  // STUB — an editorial Note is a story-level annotation. The engine
  // has no Note in its model and no wire op to create one, so this is
  // engine-blocked rather than unbuilt. No shortcut to reserve.
  {
    id: "paged.tool.note",
    title: "Note",
    icon: "tool-note",
    group: "note",
    section: "modNav",
    isGroupDefault: true,
    status: "planned",
  },
  // C-32 — the Eyedropper is BACK in the host, and this time it works.
  //
  // It was retired as an inert built-in because paged.draw shipped a
  // real one; that freed the rail but made the capability unreachable
  // for paged.image, which cannot import from a sibling bundle under
  // the isolation contract. A capability whose vocabulary is HOST
  // vocabulary belongs to the host once a second plugin needs it, and
  // colour is host vocabulary.
  //
  // The two Eyedroppers are NOT duplicates and both stay: paged.draw's
  // samples typed ELEMENT PROPERTIES (fill/stroke/weight/opacity) and
  // says in its own header that it does not do pixels; this one samples
  // the COMPOSITED PIXEL, which only the host can see. Reclaiming `i`
  // is safe — paged.draw's lives on `shift+d`.
  {
    id: "paged.tool.eyedropper",
    title: "Eyedropper",
    icon: "tool-eyedropper",
    shortcut: "i",
    group: "eyedropper",
    section: "modNav",
    // Order 0 + group default, ahead of paged.draw's `order: 2`. Not a
    // land-grab: the group needs a default that WORKS EVERYWHERE, and
    // this one does — draw's exists only when that bundle is loaded and
    // is about vector appearance, while sampling a colour is something
    // every context wants. The slot holds both; only the face changes.
    order: 0,
    isGroupDefault: true,
    gesture: createEyedropperHandler,
  },
  // RETIRED — Measure was an inert built-in holding `k` while
  // paged.draw shipped a working version
  // (`media.paged.draw.tool.eyedropper` on `shift+d`, joining this same
  // `eyedropper` slot, and `media.paged.draw.tool.measure` on `shift+m`
  // in its own slot). The dead built-in Eyedropper was even the slot's
  // group DEFAULT, so the rail face was the broken one. Removing both
  // FREES `i` and `k` for paged.draw to claim (its repo, not ours), and
  // hands the `eyedropper` slot to the plugin — which also means the
  // slot now takes its rail position from bundle-load order; paged.draw
  // can pin it back with `slotOrder`.
  {
    id: "paged.tool.hand",
    title: "Hand",
    icon: "tool-hand",
    shortcut: "h",
    group: "hand",
    section: "modNav",
    isGroupDefault: true,
  },
  {
    id: "paged.tool.zoom",
    title: "Zoom",
    icon: "tool-zoom",
    shortcut: "z",
    group: "zoom",
    section: "modNav",
    isGroupDefault: true,
  },
];

// Concept 1 (Phase 3) — base cursor per tool. Applied to the canvas
// overlay on tool activation; a handler's `cursorAt` may override it
// per pointer position. Injected here so every tool (including hidden
// flyout members) gets one without bloating each literal above.
const TEXT: CursorSpec = { kind: "css", token: "text" };
const CROSS: CursorSpec = { kind: "css", token: "crosshair" };
const TOOL_CURSORS: Record<string, CursorSpec> = {
  "paged.tool.type": TEXT,
  "paged.tool.line": CROSS,
  "paged.tool.pen": CROSS,
  "paged.tool.pencil": CROSS,
  "paged.tool.smooth": CROSS,
  "paged.tool.rectangleFrame": CROSS,
  "paged.tool.ellipseFrame": CROSS,
  "paged.tool.polygonFrame": CROSS,
  "paged.tool.rectangle": CROSS,
  "paged.tool.ellipse": CROSS,
  "paged.tool.polygon": CROSS,
  "paged.tool.scissors": CROSS,
  "paged.tool.gradientSwatch": CROSS,
  "paged.tool.gradientFeather": CROSS,
  "paged.tool.hand": { kind: "css", token: "grab" },
  "paged.tool.zoom": { kind: "css", token: "zoom-in" },
};
for (const tool of BUILT_IN_TOOLS) {
  const cursor = TOOL_CURSORS[tool.id];
  if (cursor) tool.cursor = cursor;
}
