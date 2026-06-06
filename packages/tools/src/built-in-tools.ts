// Concept 1 — the built-in InDesign tool catalog, transcribed from
// `thoughts/docs/paged/editor/media/toolbar.png`. DATA only here:
// id / title / icon / shortcut / flyout group / section / default.
// Gesture handler factories are attached to the implemented tools
// (Rectangle, Line, Pencil, Shear, Scissors, Gradient Swatch,
// Gradient Feather, Page — protocol v24); tools without a `gesture`
// appear in the rail but are inert until their handler / engine op
// lands.
//
// Registration order == toolbox reading order, so the rail's slot
// order (first-seen group order) and section order come out right.

import type { CursorSpec, ToolContribution } from "@paged-media/shell";

import {
  createAddAnchorHandler,
  createConvertAnchorHandler,
  createDeleteAnchorHandler,
} from "./handlers/anchor-tools";
import { createGradientFeatherHandler } from "./handlers/gradient-feather-tool";
import { createGradientSwatchHandler } from "./handlers/gradient-tool";
import { createLineHandler } from "./handlers/line-tool";
import { createPageHandler } from "./handlers/page-tool";
import { createPenHandler } from "./handlers/pen-tool";
import { createPencilHandler } from "./handlers/pencil-tool";
import { createRectangleHandler } from "./handlers/rectangle-tool";
import { createScissorsHandler } from "./handlers/scissors-tool";
import { createShearHandler } from "./handlers/shear-tool";

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
  {
    id: "paged.tool.gap",
    title: "Gap",
    icon: "tool-gap",
    shortcut: "u",
    group: "gap",
    section: "selection",
    isGroupDefault: true,
  },
  {
    id: "paged.tool.contentCollector",
    title: "Content Collector",
    icon: "tool-contentCollector",
    shortcut: "b",
    group: "content",
    section: "selection",
    order: 0,
    isGroupDefault: true,
  },
  {
    id: "paged.tool.contentPlacer",
    title: "Content Placer",
    icon: "tool-contentPlacer",
    group: "content",
    section: "selection",
    order: 1,
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
  {
    id: "paged.tool.typePath",
    title: "Type on a Path",
    icon: "tool-typePath",
    shortcut: "shift+t",
    group: "type",
    section: "drawType",
    order: 1,
  },
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
  {
    id: "paged.tool.pen",
    title: "Pen",
    icon: "tool-pen",
    shortcut: "p",
    group: "pen",
    section: "drawType",
    order: 0,
    isGroupDefault: true,
    // plugin-draw D2 — shim over @paged-media/draw-tools' PenMachine:
    // click/drag/Alt/Shift matrix → one `insertPath` (protocol v27).
    gesture: createPenHandler,
  },
  {
    id: "paged.tool.addAnchor",
    title: "Add Anchor Point",
    icon: "tool-addAnchor",
    shortcut: "=",
    group: "pen",
    section: "drawType",
    order: 1,
    // plugin-draw D2 — curve-preserving segment split → 3-op batch.
    gesture: createAddAnchorHandler,
  },
  {
    id: "paged.tool.deleteAnchor",
    title: "Delete Anchor Point",
    icon: "tool-deleteAnchor",
    shortcut: "-",
    group: "pen",
    section: "drawType",
    order: 2,
    // plugin-draw D2 — nearest anchor → `pathPointRemove`.
    gesture: createDeleteAnchorHandler,
  },
  {
    id: "paged.tool.convertAnchor",
    title: "Convert Direction Point",
    icon: "tool-convertAnchor",
    shortcut: "shift+c",
    group: "pen",
    section: "drawType",
    order: 3,
    // plugin-draw D2 — corner ↔ smooth → `pathPointCurveType`.
    gesture: createConvertAnchorHandler,
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
  },
  {
    id: "paged.tool.erase",
    title: "Erase",
    icon: "tool-erase",
    group: "pencil",
    section: "drawType",
    order: 2,
  },
  {
    id: "paged.tool.rectangleFrame",
    title: "Rectangle Frame",
    icon: "tool-rectangleFrame",
    shortcut: "f",
    group: "frame",
    section: "drawType",
    order: 0,
    isGroupDefault: true,
  },
  {
    id: "paged.tool.ellipseFrame",
    title: "Ellipse Frame",
    icon: "tool-ellipseFrame",
    group: "frame",
    section: "drawType",
    order: 1,
  },
  {
    id: "paged.tool.polygonFrame",
    title: "Polygon Frame",
    icon: "tool-polygonFrame",
    group: "frame",
    section: "drawType",
    order: 2,
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
  },
  {
    id: "paged.tool.polygon",
    title: "Polygon",
    icon: "tool-polygon",
    group: "shape",
    section: "drawType",
    order: 2,
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
  {
    id: "paged.tool.freeTransform",
    title: "Free Transform",
    icon: "tool-freeTransform",
    shortcut: "e",
    group: "transform",
    section: "transform",
    order: 0,
    isGroupDefault: true,
  },
  {
    id: "paged.tool.rotate",
    title: "Rotate",
    icon: "tool-rotate",
    shortcut: "r",
    group: "transform",
    section: "transform",
    order: 1,
  },
  {
    id: "paged.tool.scale",
    title: "Scale",
    icon: "tool-scale",
    shortcut: "s",
    group: "transform",
    section: "transform",
    order: 2,
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
  {
    id: "paged.tool.note",
    title: "Note",
    icon: "tool-note",
    group: "note",
    section: "modNav",
    isGroupDefault: true,
  },
  {
    id: "paged.tool.eyedropper",
    title: "Eyedropper",
    icon: "tool-eyedropper",
    shortcut: "i",
    group: "eyedropper",
    section: "modNav",
    order: 0,
    isGroupDefault: true,
  },
  {
    id: "paged.tool.measure",
    title: "Measure",
    icon: "tool-measure",
    shortcut: "k",
    group: "eyedropper",
    section: "modNav",
    order: 1,
  },
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
  "paged.tool.typePath": TEXT,
  "paged.tool.line": CROSS,
  "paged.tool.pen": CROSS,
  "paged.tool.addAnchor": CROSS,
  "paged.tool.deleteAnchor": CROSS,
  "paged.tool.convertAnchor": CROSS,
  "paged.tool.pencil": CROSS,
  "paged.tool.smooth": CROSS,
  "paged.tool.erase": CROSS,
  "paged.tool.rectangleFrame": CROSS,
  "paged.tool.ellipseFrame": CROSS,
  "paged.tool.polygonFrame": CROSS,
  "paged.tool.rectangle": CROSS,
  "paged.tool.ellipse": CROSS,
  "paged.tool.polygon": CROSS,
  "paged.tool.scissors": CROSS,
  "paged.tool.gradientSwatch": CROSS,
  "paged.tool.gradientFeather": CROSS,
  "paged.tool.eyedropper": CROSS,
  "paged.tool.measure": CROSS,
  "paged.tool.hand": { kind: "css", token: "grab" },
  "paged.tool.zoom": { kind: "css", token: "zoom-in" },
};
for (const tool of BUILT_IN_TOOLS) {
  const cursor = TOOL_CURSORS[tool.id];
  if (cursor) tool.cursor = cursor;
}
