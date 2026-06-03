import type { ReactNode } from "react";

// Original SVG glyphs for the dockview panel tabs. Each value is a
// fragment of SVG child elements only — the consumer (`Icon.tsx`) wraps
// them in an <svg viewBox="0 0 24 24" fill="currentColor">. So:
//   • solid shapes inherit the fill (don't set `fill`);
//   • line shapes set `fill="none" stroke="currentColor"` with a
//     1.5–1.8 stroke and round caps/joins.
// Authored on a 24×24 grid with ~3px padding so they read at 18px.
// These are clean-room silhouettes faithful to the InDesign panels,
// not traced from Adobe artwork. Several families reuse a motif (the
// "A" for type, the list-lines beside a marker for the *-styles trio)
// and vary it so the panels stay distinguishable.

// Shared stroke defaults for line-style glyphs.
const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const PANEL_GLYPHS: Record<string, ReactNode> = {
  // A page/artboard with a small shape inside.
  "panel-canvas": (
    <>
      <rect x={4} y={3} width={16} height={18} rx={1.5} {...LINE} />
      <rect x={8} y={9} width={8} height={6} rx={1} {...LINE} />
    </>
  ),

  // Two overlapping page rectangles — the page navigator.
  "panel-pages": (
    <>
      <rect x={4} y={3} width={11} height={15} rx={1.5} {...LINE} />
      <rect x={9} y={6} width={11} height={15} rx={1.5} {...LINE} />
    </>
  ),

  // Crossed pen + ruler.
  "panel-tools": (
    <>
      <path d="M4 20 L13 11" {...LINE} />
      <path d="M11 9 L15 5 L19 9 L15 13 Z" {...LINE} />
      <path d="M16 4 L20 8" {...LINE} />
      <path d="M5 14 L10 19" {...LINE} />
      <path d="M7 16 L8.5 14.5 M9 18 L10.5 16.5" {...LINE} />
    </>
  ),

  // A chain link.
  "panel-links": (
    <>
      <path d="M10 14 L14 10" {...LINE} />
      <path d="M9 11 L7 13 a3 3 0 0 0 4 4 l2 -2" {...LINE} />
      <path d="M15 13 L17 11 a3 3 0 0 0 -4 -4 l-2 2" {...LINE} />
    </>
  ),

  // An eye — conditional visibility.
  "panel-conditions": (
    <>
      <path d="M3 12 C6 6 18 6 21 12 C18 18 6 18 3 12 Z" {...LINE} />
      <circle cx={12} cy={12} r={2.6} {...LINE} />
    </>
  ),

  // An eye with a small stacked-layers badge.
  "panel-condition-sets": (
    <>
      <path d="M3 11 C6 5.5 16 5.5 19 11" {...LINE} />
      <circle cx={11} cy={11} r={2.4} {...LINE} />
      <path d="M15 16 L19 14 L23 16 L19 18 Z" {...LINE} />
      <path d="M15 18.5 L19 20.5 L23 18.5" {...LINE} />
    </>
  ),

  // A folder with small colour dots.
  "panel-color-groups": (
    <>
      <path
        d="M3 6 L9 6 L11 8 L21 8 L21 19 L3 19 Z"
        {...LINE}
      />
      <circle cx={8} cy={14} r={1.4} />
      <circle cx={12.5} cy={14} r={1.4} />
      <circle cx={17} cy={14} r={1.4} />
    </>
  ),

  // A numbered / ordered list — articles flow.
  "panel-articles": (
    <>
      <path d="M5 6 L5.5 6 M5 12 L5.5 12 M5 18 L5.5 18" {...LINE} />
      <path d="M4 5 L5.5 5 L5.5 7.5" {...LINE} />
      <path d="M9 6 L20 6 M9 12 L20 12 M9 18 L20 18" {...LINE} />
    </>
  ),

  // A chain link with a small globe (web hyperlink).
  "panel-hyperlinks": (
    <>
      <path d="M8 13 L11 10 a2.6 2.6 0 0 0 -3.6 -3.6 l-2 2 a2.6 2.6 0 0 0 0 3.6" {...LINE} />
      <circle cx={16} cy={16} r={4} {...LINE} />
      <path d="M12 16 L20 16 M16 12 C18 14 18 18 16 20 C14 18 14 14 16 12" {...LINE} />
    </>
  ),

  // A bookmark ribbon.
  "panel-bookmarks": (
    <>
      <path d="M7 3 L17 3 L17 21 L12 16.5 L7 21 Z" {...LINE} />
    </>
  ),

  // Two documents with a connecting arrow — cross references.
  "panel-cross-references": (
    <>
      <rect x={3} y={4} width={7} height={10} rx={1} {...LINE} />
      <rect x={14} y={10} width={7} height={10} rx={1} {...LINE} />
      <path d="M9 9 L15 14 M15 14 L12.5 14 M15 14 L15 11.5" {...LINE} />
    </>
  ),

  // "A–Z" alphabetized lines — index.
  "panel-index": (
    <>
      <path d="M4 9 L5.6 4.5 L7.2 9 M4.5 7.6 L7.1 7.6" {...LINE} />
      <path d="M4.4 15 L7.2 15 L4.4 19.5 L7.2 19.5" {...LINE} />
      <path d="M11 6 L20 6 M11 11 L20 11 M11 16 L20 16 M11 20 L17 20" {...LINE} />
    </>
  ),

  // A vertical list of small page rectangles.
  "panel-pages-list": (
    <>
      <rect x={4} y={3.5} width={6} height={5} rx={0.8} {...LINE} />
      <rect x={4} y={10} width={6} height={5} rx={0.8} {...LINE} />
      <rect x={4} y={16.5} width={6} height={5} rx={0.8} {...LINE} />
      <path d="M13 6 L20 6 M13 12.5 L20 12.5 M13 19 L20 19" {...LINE} />
    </>
  ),

  // Two facing pages — a spread.
  "panel-spreads": (
    <>
      <rect x={3} y={5} width={8.5} height={14} rx={1} {...LINE} />
      <rect x={12.5} y={5} width={8.5} height={14} rx={1} {...LINE} />
      <path d="M12 5 L12 19" {...LINE} />
    </>
  ),

  // A page with a layered corner and an "M" — master pages.
  "panel-master-pages": (
    <>
      <path d="M6 3 L18 3 L18 21 L6 21 Z" {...LINE} />
      <path d="M9 15 L9 9 L12 13 L15 9 L15 15" {...LINE} />
    </>
  ),

  // A table grid with one cell highlighted — cell styles.
  "panel-cell-styles": (
    <>
      <rect x={3} y={4} width={18} height={16} rx={1} {...LINE} />
      <path d="M3 10 L21 10 M3 15 L21 15 M9 4 L9 20 M15 4 L15 20" {...LINE} />
      <rect x={15} y={10} width={6} height={5} />
    </>
  ),

  // A full table grid — table styles.
  "panel-table-styles": (
    <>
      <rect x={3} y={4} width={18} height={16} rx={1} {...LINE} />
      <path
        d="M3 9 L21 9 M3 14.5 L21 14.5 M9 4 L9 20 M15 4 L15 20"
        {...LINE}
      />
    </>
  ),

  // A stylized "Aa" — fonts.
  "panel-fonts": (
    <>
      <path d="M3 19 L7 5 L11 19 M4.3 14.5 L9.7 14.5" {...LINE} />
      <path d="M20 11.5 a2.6 2.6 0 0 0 -5.2 0 M14.8 16.4 a2.6 2.6 0 0 0 5.2 0 L20 19" {...LINE} />
      <path d="M20 11.5 L20 16.5" {...LINE} />
      <path d="M14.8 13.9 a2.6 2.6 0 0 0 5.2 0" {...LINE} />
    </>
  ),

  // Three rects aligned to a left edge with a guide line.
  "panel-align": (
    <>
      <path d="M4 3 L4 21" {...LINE} />
      <rect x={7} y={5} width={12} height={3.5} rx={0.8} {...LINE} />
      <rect x={7} y={10.5} width={8} height={3.5} rx={0.8} {...LINE} />
      <rect x={7} y={16} width={14} height={3.5} rx={0.8} {...LINE} />
    </>
  ),

  // Overlapping circle + square — boolean union (pathfinder).
  "panel-pathfinder": (
    <>
      <rect x={4} y={4} width={11} height={11} rx={1} {...LINE} />
      <circle cx={15} cy={15} r={5.5} {...LINE} />
    </>
  ),

  // Indented tree with disclosure carets — outline.
  "panel-outline": (
    <>
      <path d="M4 5 L5.6 6 L4 7" {...LINE} />
      <path d="M8 6 L20 6" {...LINE} />
      <path d="M8 12 L9.6 13 L8 14" {...LINE} />
      <path d="M12 13 L20 13" {...LINE} />
      <path d="M12 19 L20 19" {...LINE} />
    </>
  ),

  // A node tree — root with two children.
  "panel-tree": (
    <>
      <rect x={9} y={3} width={6} height={4} rx={1} {...LINE} />
      <rect x={3} y={17} width={6} height={4} rx={1} {...LINE} />
      <rect x={15} y={17} width={6} height={4} rx={1} {...LINE} />
      <path d="M12 7 L12 12 M6 17 L6 12 L18 12 L18 17" {...LINE} />
    </>
  ),

  // A magnifier over a small list — inspector.
  "panel-inspector": (
    <>
      <rect x={3} y={4} width={11} height={12} rx={1} {...LINE} />
      <path d="M6 7.5 L11 7.5 M6 10.5 L11 10.5" {...LINE} />
      <circle cx={15} cy={15} r={4} {...LINE} />
      <path d="M18 18 L21 21" {...LINE} />
    </>
  ),

  // A single large "A" — character.
  "panel-character": (
    <>
      <path d="M5 20 L12 4 L19 20 M7.5 14.5 L16.5 14.5" {...LINE} />
    </>
  ),

  // A pilcrow (¶) — paragraph.
  "panel-paragraph": (
    <>
      <path d="M18 4 L10.5 4 a4 4 0 0 0 0 8 L14 12" {...LINE} />
      <path d="M14 4 L14 20 M18 4 L18 20" {...LINE} />
    </>
  ),

  // A pilcrow with list lines beside it — paragraph styles.
  "panel-paragraph-styles": (
    <>
      <path d="M11 4 L6.5 4 a3 3 0 0 0 0 6 L8.5 10" {...LINE} />
      <path d="M8.5 4 L8.5 16 M11 4 L11 16" {...LINE} />
      <path d="M15 7 L21 7 M15 12 L21 12 M15 17 L19 17" {...LINE} />
    </>
  ),

  // An "A" with list lines beside it — character styles.
  "panel-character-styles": (
    <>
      <path d="M3 16 L7 5 L11 16 M4.4 12 L9.6 12" {...LINE} />
      <path d="M15 7 L21 7 M15 12 L21 12 M15 17 L19 17" {...LINE} />
    </>
  ),

  // A square/object with list lines beside it — object styles.
  "panel-object-styles": (
    <>
      <rect x={3} y={6} width={9} height={9} rx={1} {...LINE} />
      <path d="M15 7 L21 7 M15 12 L21 12 M15 17 L19 17" {...LINE} />
    </>
  ),

  // A 3×2 grid of colour squares — swatches.
  "panel-swatches": (
    <>
      <rect x={3} y={5} width={5.5} height={6} rx={0.8} {...LINE} />
      <rect x={9.25} y={5} width={5.5} height={6} rx={0.8} {...LINE} />
      <rect x={15.5} y={5} width={5.5} height={6} rx={0.8} {...LINE} />
      <rect x={3} y={13} width={5.5} height={6} rx={0.8} {...LINE} />
      <rect x={9.25} y={13} width={5.5} height={6} rx={0.8} {...LINE} />
      <rect x={15.5} y={13} width={5.5} height={6} rx={0.8} {...LINE} />
    </>
  ),

  // An artist's palette — color.
  "panel-color": (
    <>
      <path
        d="M12 3 C6.5 3 3 7 3 11.5 C3 15 6 17 9 17 C10.5 17 11 18 11 19 C11 20.5 12.5 21 14 21 C18 21 21 17 21 12 C21 6.5 17 3 12 3 Z"
        {...LINE}
      />
      <circle cx={8} cy={9} r={1.2} />
      <circle cx={12.5} cy={7} r={1.2} />
      <circle cx={16.5} cy={9.5} r={1.2} />
      <circle cx={16.5} cy={14} r={1.2} />
    </>
  ),

  // A rounded square with a left→right gradient (vertical strips).
  "panel-gradients": (
    <>
      <rect x={4} y={5} width={16} height={14} rx={1.5} {...LINE} />
      <rect x={5} y={6} width={3} height={12} opacity={0.9} />
      <rect x={8} y={6} width={3} height={12} opacity={0.65} />
      <rect x={11} y={6} width={3} height={12} opacity={0.4} />
      <rect x={14} y={6} width={3} height={12} opacity={0.2} />
      <rect x={17} y={6} width={2} height={12} opacity={0.08} />
    </>
  ),

  // Three stacked lines of increasing thickness — stroke.
  "panel-stroke": (
    <>
      <path
        d="M4 7 L20 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
      />
      <path
        d="M4 12 L20 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d="M4 17.5 L20 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </>
  ),

  // A bounding box with corner handles + rotate arrow — transform.
  "panel-object-transform": (
    <>
      <rect x={6} y={6} width={12} height={12} {...LINE} />
      <rect x={4.6} y={4.6} width={2.8} height={2.8} />
      <rect x={16.6} y={4.6} width={2.8} height={2.8} />
      <rect x={4.6} y={16.6} width={2.8} height={2.8} />
      <rect x={16.6} y={16.6} width={2.8} height={2.8} />
      <path d="M19 9 a5 5 0 0 1 -1.5 6 M19 9 L17 9 M19 9 L19 11" {...LINE} />
    </>
  ),

  // A text frame with horizontal text lines — text frame options.
  "panel-text-frame-options": (
    <>
      <rect x={4} y={4} width={16} height={16} rx={1} {...LINE} />
      <path d="M7 8.5 L17 8.5 M7 12 L17 12 M7 15.5 L13 15.5" {...LINE} />
    </>
  ),

  // Text lines wrapping around a shape on the left — text wrap.
  "panel-text-wrap": (
    <>
      <circle cx={7} cy={9} r={3.2} {...LINE} />
      <path d="M12 6 L21 6 M12 9.5 L21 9.5 M4 14 L21 14 M4 17.5 L21 17.5" {...LINE} />
    </>
  ),

  // A smaller image fitting inside a larger frame — frame fitting.
  "panel-frame-fitting": (
    <>
      <rect x={3} y={3} width={18} height={18} rx={1} {...LINE} />
      <rect x={8} y={8} width={8} height={8} rx={0.8} {...LINE} />
      <path d="M5 5 L7 5 M5 5 L5 7 M19 19 L17 19 M19 19 L19 17" {...LINE} />
    </>
  ),

  // Sparkles / star-burst — effects.
  "panel-effects": (
    <>
      <path d="M9 4 L10.4 8.6 L15 10 L10.4 11.4 L9 16 L7.6 11.4 L3 10 L7.6 8.6 Z" {...LINE} />
      <path d="M17 13 L17.8 15.6 L20.5 16.5 L17.8 17.4 L17 20 L16.2 17.4 L13.5 16.5 L16.2 15.6 Z" {...LINE} />
    </>
  ),

  // 2–3 stacked offset sheets — layers.
  "panel-layers": (
    <>
      <path d="M12 3 L21 8 L12 13 L3 8 Z" {...LINE} />
      <path d="M3 12 L12 17 L21 12" {...LINE} />
      <path d="M3 16 L12 21 L21 16" {...LINE} />
    </>
  ),

  // A circled lowercase "i" — info.
  "panel-info": (
    <>
      <circle cx={12} cy={12} r={9} {...LINE} />
      <circle cx={12} cy={8} r={0.6} fill="currentColor" stroke="currentColor" />
      <path d="M12 11 L12 17" {...LINE} />
    </>
  ),

  // A tag/label shape with a dot — attributes.
  "panel-attributes": (
    <>
      <path d="M3 11 L11 3 L21 3 L21 13 L13 21 L3 11 Z" {...LINE} />
      <circle cx={16.5} cy={7.5} r={1.4} {...LINE} />
    </>
  ),

  // Two horizontal sliders with knobs — properties.
  "panel-properties": (
    <>
      <path d="M4 8 L20 8" {...LINE} />
      <path d="M4 16 L20 16" {...LINE} />
      <circle cx={9} cy={8} r={2.4} fill="currentColor" stroke="none" />
      <circle cx={15} cy={16} r={2.4} fill="currentColor" stroke="none" />
    </>
  ),

  // A single horizontal slider/control bar with knobs — control.
  "panel-control": (
    <>
      <path d="M4 12 L20 12" {...LINE} />
      <circle cx={8} cy={12} r={2.6} {...LINE} />
      <circle cx={16} cy={12} r={2.6} {...LINE} />
    </>
  ),

  // A console box with a ">" prompt — repl.
  "panel-repl": (
    <>
      <rect x={3} y={4} width={18} height={16} rx={2} {...LINE} />
      <path d="M7 10 L10 12.5 L7 15" {...LINE} />
      <path d="M12 15 L17 15" {...LINE} />
    </>
  ),

  // A "</>" code bracket — script editor.
  "panel-script-editor": (
    <>
      <path d="M8 8 L4 12 L8 16" {...LINE} />
      <path d="M16 8 L20 12 L16 16" {...LINE} />
      <path d="M13.5 6 L10.5 18" {...LINE} />
    </>
  ),
};
