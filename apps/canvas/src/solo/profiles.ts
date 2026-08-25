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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// SOLO MODE — one plugin owns the whole application.
//
// `?solo=paged.draw` boots the editor as a web illustration program:
// draw's tools, draw's panels, draw's menus, an ARTBOARD instead of a
// page run, and none of the DTP furniture.
//
// WHAT THIS IS NOT. It is not a new document model. The 2026-08-25
// scoping (thoughts/docs/paged/plugin-platform/solo-mode-scoping.md)
// reversed the assumption that it would be: `newBlankDocument(2000,
// 2000)` already yields one page at that size, an insert lands on it,
// `elementGeometry` echoes the right bounds, and it renders. A one-page
// document IS an artboard. The constraint everyone read as "the model"
// lived in the DEFAULTS and the FURNITURE, and from the UI those are
// indistinguishable.
//
// So a profile is configuration: which surfaces the app hands the shell,
// which bundle it loads, and how big a new document is.
//
// ── ALLOW-LIST, NEVER DENY-LIST ──────────────────────────────────────
// There are ~55 host panels and solo-draw wants ~15. A deny-list means
// every new host panel silently leaks into every solo profile — the
// fail-open class this codebase keeps finding, where a thing reports
// success while measuring nothing. A profile names what it SHOWS, so a
// new DTP panel is absent from solo until someone deliberately adds it.
//
// The cost of that choice is the opposite failure: a panel RENAMED
// host-side silently drops out of the profile. `profiles.spec.ts`
// resolves every id against the real arrays so that fails in CI rather
// than in the UI.

import type { ModeCockpitSlots } from "@paged-media/shell";

/** A plugin hosted as its own application. */
export interface SoloProfile {
  /** The manifest id of the ONE bundle this profile loads. */
  bundleId: string;
  /** Product name — the mode title and the document-title-bar badge. */
  title: string;
  /** `File ▸ New` mints this instead of Letter. A square artboard for a
   *  drawing tool; a photo editor would want its own. */
  documentSizePt: readonly [number, number];
  /** HOST panels this profile keeps. Plugin panels arrive with the
   *  bundle and are not listed here — the bundle is the allow-list for
   *  its own surfaces. */
  panelIds: readonly string[];
  /** HOST tools this profile keeps, BEYOND the navigation set that is
   *  always present (see `ALWAYS_IN_PALETTE` in the shell: select,
   *  direct-select, hand, zoom). */
  toolIds: readonly string[];
  /** Top-level host menus that survive. A top-level menu exists iff at
   *  least one item carries that first path segment, so dropping the
   *  items removes the menu — no per-menu predicate needed. */
  menuTopLevels: readonly string[];
  /** The cockpit's fixed slots for this profile. May name PLUGIN panels:
   *  the shipped `data` mode already does (`slots.left` is
   *  `media.paged.data.panel.sources`). */
  slots: ModeCockpitSlots;
  /** Right-edge launcher entries, by panel id. */
  panelRailIds: readonly string[];
  /** One line under the product name in the context toolbar. */
  blurb: string;
  /** Command ids the palette surfaces first. */
  paletteSuggestions: readonly string[];
}

/**
 * paged.draw — a web illustration program.
 *
 * The host panels kept are the ones an illustration app genuinely uses:
 * geometry and transform, alignment, boolean ops, layers, colour, and
 * the two diagnostic surfaces. Everything about PAGES (navigator, list,
 * spreads, masters), OUTPUT (preflight, separations, export centre,
 * outputs) and TEXT-AS-DTP (stories, styles, tabs, text-frame options,
 * text wrap) is absent — not hidden, never registered.
 *
 * `paged.stroke` and `paged.effects` are kept and draw ALSO ships its
 * own Stroke panel. That collision is real and pre-existing (the audit
 * filed it: two indistinguishable "Show: Stroke" rows in the palette).
 * Solo makes it visible rather than causing it; keeping both here is
 * deliberate so the slice does not quietly paper over a known bug.
 */
const DRAW_PROFILE: SoloProfile = {
  bundleId: "media.paged.draw",
  title: "paged.draw",
  // Square, and large enough that the artboard reads as a canvas rather
  // than a page. Verified end-to-end at this exact size.
  documentSizePt: [2000, 2000],
  panelIds: [
    "paged.properties",
    "paged.object-transform",
    "paged.align",
    "paged.pathfinder",
    "paged.layers",
    "paged.swatches",
    "paged.color",
    "paged.gradients",
    "paged.color-wheel",
    "paged.stroke",
    "paged.effects",
    "paged.attributes",
    "paged.info",
    "paged.problems",
    "paged.actions",
    "paged.keyboard-shortcuts",
  ],
  toolIds: [
    // Drawing primitives the HOST owns and draw builds on. draw's own 19
    // tools arrive with the bundle.
    "paged.tool.pen",
    "paged.tool.pencil",
    "paged.tool.smooth",
    "paged.tool.line",
    "paged.tool.rectangle",
    "paged.tool.ellipse",
    "paged.tool.polygon",
    "paged.tool.scissors",
    "paged.tool.rotate",
    "paged.tool.scale",
    "paged.tool.shear",
    "paged.tool.freeTransform",
    "paged.tool.gradientSwatch",
    "paged.tool.gradientFeather",
    "paged.tool.eyedropper",
    // TYPE IS A DRAWING TOOL. Excluding it was a page-layout reflex:
    // Illustrator has a Type tool, and draw's own `typeOnPath` needs an
    // existing story to attach, so without this there is no way to make
    // one. The DTP verb is the text FRAME, not type itself.
    "paged.tool.type",
    // NOT here: page, gap, contentCollector/Placer, note, and the three
    // *Frame placeholder tools — all page-layout verbs.
    //
    // WHY THIS LIST IS MOSTLY HOST TOOLS, which looks wrong at a glance:
    // draw's 19 tools are all MODIFIERS on existing paths (add/delete/
    // convert anchor, curvature, width, shape-builder, live-paint,
    // brushes). NOT ONE creates geometry. Pen, rectangle, ellipse, line
    // and polygon are the HOST's. A profile of "draw's tools plus
    // navigation" would be an illustration program you cannot draw in.
  ],
  // `Draw` itself is contributed by the bundle, not listed here.
  menuTopLevels: ["File", "Edit", "View", "Object", "Window", "Help"],
  slots: {
    // The HOST's layers panel, not a draw one — draw has no layers
    // panel. Its layer surface became an ADR-023 binding PROVIDER that
    // feeds this panel instead, which is why the illustration app's left
    // column is a host id.
    left: "paged.layers",
    tabs: [
      "paged.properties",
      "media.paged.draw.panel.stroke",
      "media.paged.draw.panel.appearance",
      "paged.swatches",
    ],
  },
  panelRailIds: [
    "paged.properties",
    "media.paged.draw.panel.stroke",
    "paged.swatches",
    "paged.problems",
  ],
  blurb: "Paths, shapes, appearance",
  paletteSuggestions: [
    "media.paged.draw.command.pathfinderUnite",
    "media.paged.draw.command.outlineStroke",
  ],
};


/**
 * paged.image — a photo editor.
 *
 * A CANVAS, and the size is the honest difference from draw: a photo
 * editor's document is the image's own pixel box, not a square artboard.
 * 1600×1200 is a starting canvas, replaced the moment a real image is
 * opened (paged.image's `openImage` sizes to the file).
 *
 * Almost no HOST tools: unlike draw — whose 19 tools are all path
 * modifiers, so the host has to supply the pen and the shapes — paged.
 * image ships its own 13, INCLUDING selection, brush, clone, heal and
 * type. The host contributes the two frame primitives that hold a
 * placed image, and nothing else.
 */
const IMAGE_PROFILE: SoloProfile = {
  bundleId: "media.paged.image",
  title: "paged.image",
  documentSizePt: [1600, 1200],
  panelIds: [
    "paged.properties",
    "paged.object-transform",
    "paged.layers",
    "paged.swatches",
    "paged.color",
    "paged.color-wheel",
    "paged.effects",
    "paged.align",
    "paged.info",
    "paged.problems",
    "paged.actions",
    "paged.keyboard-shortcuts",
  ],
  toolIds: ["paged.tool.rectangle", "paged.tool.ellipse"],
  menuTopLevels: ["File", "Edit", "View", "Object", "Window", "Help"],
  slots: {
    left: "media.paged.image.panel.adjustments",
    tabs: ["paged.properties", "paged.layers", "paged.swatches"],
  },
  panelRailIds: [
    "media.paged.image.panel.adjustments",
    "paged.properties",
    "paged.layers",
    "paged.problems",
  ],
  blurb: "Adjustments, selections, layers",
  paletteSuggestions: [
    "media.paged.image.command.adjustSelected",
    "media.paged.image.command.autoEnhance",
  ],
};

/**
 * paged.sheet — a spreadsheet application.
 *
 * The grid is the plugin's own Rust/WASM engine rendering IN a frame, so
 * the document is a page that holds one — landscape, because a sheet is
 * wider than it is tall. The host keeps the table and cell-style panels
 * because a spreadsheet placed on a page is still a paged table.
 *
 * paged.sheet contributes NO tools at all: everything happens inside the
 * grid's own modal session (K-1). So the tool rail here is the
 * navigation set and the two frame primitives — which is honest, not
 * impoverished: there is nothing to draw with in a spreadsheet.
 */
const SHEET_PROFILE: SoloProfile = {
  bundleId: "media.paged.sheet",
  title: "paged.sheet",
  documentSizePt: [1400, 900],
  panelIds: [
    "paged.properties",
    "paged.object-transform",
    "paged.table",
    "paged.cell-styles",
    "paged.table-styles",
    "paged.swatches",
    "paged.color",
    "paged.info",
    "paged.problems",
    "paged.actions",
    "paged.keyboard-shortcuts",
  ],
  toolIds: ["paged.tool.rectangle", "paged.tool.type"],
  menuTopLevels: ["File", "Edit", "View", "Object", "Window", "Help"],
  slots: {
    left: "media.paged.sheet.panel.workbook",
    tabs: [
      "media.paged.sheet.panel.grid",
      "media.paged.sheet.panel.datasets",
      "paged.properties",
    ],
  },
  panelRailIds: [
    "media.paged.sheet.panel.workbook",
    "media.paged.sheet.panel.grid",
    "paged.properties",
    "paged.problems",
  ],
  blurb: "Workbooks, ranges, charts",
  paletteSuggestions: [
    "media.paged.sheet.command.openGrid",
    "media.paged.sheet.command.sortRange",
  ],
};

/**
 * paged.doc — a word processor.
 *
 * THE ONE PROFILE WHOSE DOCUMENT IS A PAGE, deliberately. draw wants an
 * artboard and image wants a canvas, but a word processor is page-shaped
 * — Letter, with margins, paginated. Giving it an artboard would be
 * applying a template instead of asking what the application is.
 *
 * It is also the only profile that KEEPS the `Type` menu and the whole
 * text-style surface: character, paragraph, both style panels, tabs,
 * bullets, glyphs, fonts. That is the plugin the campaign plan called
 * "the EASIEST", and the reason holds — a DOCX lowers to real text
 * frames and real stories, so the verbs a word processor needs are the
 * HOST's, and solo doc is mostly a matter of taking DTP things AWAY.
 *
 * SHIPPING CAVEAT: `@paged-media/doc` has never been published (its
 * workflow fails ENEEDAUTH), so the editor consumes it through a `link:`
 * into a sibling checkout. This profile therefore works on a developer
 * machine and NOT from a fresh clone. That is a packaging fact, not a
 * design one, and it is why the solo journey spec does not assert doc.
 */
const DOC_PROFILE: SoloProfile = {
  bundleId: "media.paged.doc",
  title: "paged.doc",
  documentSizePt: [612, 792],
  panelIds: [
    "paged.properties",
    "paged.character",
    "paged.paragraph",
    "paged.character-styles",
    "paged.paragraph-styles",
    "paged.stories",
    "paged.tabs",
    "paged.bullets-numbering",
    "paged.glyphs",
    "paged.fonts",
    "paged.text-frame-options",
    "paged.swatches",
    "paged.color",
    "paged.info",
    "paged.problems",
    "paged.actions",
    "paged.keyboard-shortcuts",
  ],
  toolIds: ["paged.tool.type", "paged.tool.rectangle"],
  // `Type` STAYS — it is the point of a word processor. `Layout` and
  // `Data` go: pagination is automatic here, not composed by hand.
  menuTopLevels: ["File", "Edit", "View", "Type", "Object", "Window", "Help"],
  slots: {
    left: "media.paged.doc.panel.outline",
    tabs: [
      "paged.character",
      "paged.paragraph",
      "paged.paragraph-styles",
      "paged.properties",
    ],
  },
  panelRailIds: [
    "media.paged.doc.panel.outline",
    "paged.character",
    "paged.paragraph-styles",
    "paged.problems",
  ],
  blurb: "Text, styles, outline",
  paletteSuggestions: ["media.paged.doc.command.placeDoc"],
};


/**
 * paged.web — HTML as a page description.
 *
 * THE ONLY TWO PROFILES THAT KEEP PAGES are this one and paged.data, and
 * the reason is the same: their product IS pagination. paged.web's verbs
 * are render, thread a flow across frames, and bake to native — an
 * HTML-to-print tool whose output is a page run. Taking the pages away
 * would remove the thing it does, which is the opposite of what solo is
 * for.
 *
 * So this profile is not "the DTP app minus furniture". It is the DTP
 * app with a DIFFERENT SOURCE: you author in HTML and the pages are the
 * result. `Layout` stays for that reason.
 */
const WEB_PROFILE: SoloProfile = {
  bundleId: "media.paged.web",
  title: "paged.web",
  documentSizePt: [612, 792],
  panelIds: [
    "paged.properties",
    "paged.pages",
    "paged.stories",
    "paged.layers",
    "paged.swatches",
    "paged.color",
    "paged.character",
    "paged.paragraph",
    "paged.info",
    "paged.problems",
    "paged.actions",
    "paged.keyboard-shortcuts",
  ],
  toolIds: ["paged.tool.type", "paged.tool.rectangle"],
  menuTopLevels: ["File", "Edit", "View", "Layout", "Object", "Window", "Help"],
  slots: {
    left: "media.paged.web.panel.source",
    tabs: ["paged.properties", "paged.pages", "paged.stories"],
  },
  panelRailIds: [
    "media.paged.web.panel.source",
    "paged.pages",
    "paged.properties",
    "paged.problems",
  ],
  blurb: "HTML source, flow, bake",
  paletteSuggestions: [
    "media.paged.web.command.renderWebFrame",
    "media.paged.web.command.bakeWebFrame",
  ],
};

/**
 * paged.data — data-driven publishing.
 *
 * Like paged.web, this one KEEPS pages, and for a sharper reason: its
 * headline verb GENERATES them. A catalog or a mail-merge is a document
 * whose page count is a function of the dataset, so a profile that hid
 * the Pages panel would hide the output.
 *
 * The weakest of the six as a standalone product, and worth saying so:
 * data BINDS to a template, and in solo you have almost nothing to
 * author a template WITH — the drawing tools are draw's. It earns a
 * profile because its three panels and seven commands are a coherent
 * workspace over an EXISTING document, not because "open paged.data" is
 * a way to start from nothing.
 */
const DATA_PROFILE: SoloProfile = {
  bundleId: "media.paged.data",
  title: "paged.data",
  documentSizePt: [612, 792],
  panelIds: [
    "paged.properties",
    "paged.pages",
    "paged.stories",
    "paged.layers",
    "paged.swatches",
    "paged.character",
    "paged.paragraph",
    "paged.info",
    "paged.problems",
    "paged.actions",
    "paged.keyboard-shortcuts",
  ],
  toolIds: ["paged.tool.type", "paged.tool.rectangle"],
  // `Data` stays — it is this application's own menu, and the host
  // already curates three panel-raising rows into it.
  menuTopLevels: ["File", "Edit", "View", "Layout", "Object", "Data", "Window", "Help"],
  slots: {
    left: "media.paged.data.panel.sources",
    tabs: [
      "media.paged.data.panel.bindings",
      "media.paged.data.panel.dataset",
      "paged.properties",
    ],
  },
  panelRailIds: [
    "media.paged.data.panel.sources",
    "media.paged.data.panel.bindings",
    "paged.pages",
    "paged.problems",
  ],
  blurb: "Sources, bindings, generated pages",
  paletteSuggestions: [
    "media.paged.data.command.resolveBindings",
    "media.paged.data.command.lowerBinding",
  ],
};

/** Every profile, keyed by the `?solo=` value a user types. The key is
 *  the SHORT name (`paged.draw`), not the manifest id — a URL is typed
 *  by a person. */
export const SOLO_PROFILES: Readonly<Record<string, SoloProfile>> = {
  "paged.draw": DRAW_PROFILE,
  "paged.image": IMAGE_PROFILE,
  "paged.sheet": SHEET_PROFILE,
  "paged.doc": DOC_PROFILE,
  "paged.web": WEB_PROFILE,
  "paged.data": DATA_PROFILE,
};

// NO PROFILE FOR paged.pdf OR paged.publish, and the reason is measured
// rather than aesthetic: between them they contribute ONE importer, one
// exporter, and nothing else — zero commands, zero panels, zero tools,
// zero edit contexts. There is no surface to be solo WITH. paged.pdf's
// product is "open a PDF and edit it in paged", which is the ordinary
// editor with a PDF opened; paged.publish is an IDML format lane. A
// profile for either would be an application whose entire chrome came
// from the host, which is a worse answer than not offering one.

/**
 * Resolve `?solo=<name>` from a query string.
 *
 * Returns null for absent, empty, or unknown — an unknown profile boots
 * the ORDINARY editor rather than a broken one. A typo'd URL must not
 * produce an app with no panels and no explanation; the full editor is
 * the safe answer, and it is also the honest one, because the user
 * asked for something that does not exist.
 */
export function resolveSoloProfile(search: string): SoloProfile | null {
  let name: string | null = null;
  try {
    name = new URLSearchParams(search).get("solo");
  } catch {
    return null;
  }
  if (!name) return null;
  return SOLO_PROFILES[name] ?? null;
}
