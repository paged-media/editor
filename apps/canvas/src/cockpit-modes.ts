// Cockpit — the six workflow modes + the right-edge panel rail
// (design-system ui_kits/editor is the reference). Each mode is a
// VIEW over the registered panels: `panelSet` selects what mounts,
// `toolbarLeft` (work-in-progress; D4) re-skins the context
// toolbar. The shell renders, this file declares.

import type { ModeContribution, PanelRailItem } from "@paged-media/shell";

import {
  ContentToolbar,
  DataToolbar,
  DesignToolbar,
  ExportToolbar,
  PrepressToolbar,
  ReviewToolbar,
} from "./cockpit/toolbars";

export const COCKPIT_MODES: ModeContribution[] = [
  {
    id: "design",
    toolbarLeft: DesignToolbar,
    paletteSuggestions: ["paged.file.openIdml"],
    title: "Design",
    icon: "panel-canvas",
    order: 10,
    blurb: "Composition, typography, grids, components",
    slots: {
      left: "paged.document-map",
      tabs: ["paged.properties", "paged.component-library", "paged.swatches"],
    },
    panelSet: {
      left: ["paged.pages", "paged.publication-health"],
      right: [
        "paged.swatches",
        "paged.color",
        "paged.stroke",
        "paged.character",
        "paged.paragraph",
        "paged.inspector",
        "paged.layers",
      ],
    },
  },
  {
    id: "content",
    toolbarLeft: ContentToolbar,
    title: "Content",
    icon: "panel-character",
    order: 20,
    blurb: "Safe text editing, stories, review flow",
    slots: {
      left: "paged.stories",
      inspector: "paged.story-inspector",
    },
    panelSet: {
      left: ["paged.stories"],
      right: [
        "paged.character",
        "paged.paragraph",
        "paged.character-styles",
        "paged.paragraph-styles",
      ],
    },
  },
  {
    id: "prepress",
    toolbarLeft: PrepressToolbar,
    title: "Prepress",
    icon: "ui-target",
    order: 30,
    blurb: "Preflight, bleed, colour, output readiness",
    slots: {
      left: "paged.preflight",
      inspector: "paged.output-readiness",
    },
    panelSet: {
      left: ["paged.preflight"],
      right: ["paged.ink-manager", "paged.color-settings", "paged.links"],
    },
  },
  {
    id: "data",
    toolbarLeft: DataToolbar,
    title: "Data layout",
    icon: "ui-database",
    order: 40,
    blurb: "Structured data → repeatable pages",
    slots: {
      left: "paged.data-source",
      inspector: "paged.data-mapping",
      canvas: "panel:paged.data-grid",
    },
    panelSet: {
      left: ["paged.data-mapping"],
      right: ["paged.inspector"],
    },
  },
  {
    id: "review",
    toolbarLeft: ReviewToolbar,
    title: "Review",
    icon: "ui-comment",
    order: 50,
    blurb: "Comments, approvals, versions",
    slots: {
      left: "paged.comments",
      inspector: "paged.review-inspector",
    },
    panelSet: {
      left: ["paged.comments"],
      right: ["paged.pages"],
    },
  },
  {
    id: "export",
    toolbarLeft: ExportToolbar,
    paletteSuggestions: ["paged.file.exportPdf", "paged.library.exportAse"],
    title: "Export",
    icon: "ui-export",
    order: 60,
    blurb: "Multi-format publishing",
    slots: {
      left: "paged.outputs",
      inspector: "paged.export-inspector",
      canvas: "panel:paged.export-center",
    },
    panelSet: {
      left: ["paged.export-center"],
      right: [],
    },
  },
];

// The kit's panel-selector rail (ui_kits/editor data.jsx PANEL_RAIL):
// Text / Image / Pages steer the Properties inspector; the rest open
// their panel as a right-dock tab. Everything else (Layers, Effects,
// Align, …) stays reachable through the Window menu.
export const PANEL_RAIL: PanelRailItem[] = [
  {
    panelId: "paged.properties",
    title: "Text",
    icon: "panel-character",
    inspectorContext: "text",
  },
  {
    panelId: "paged.properties",
    title: "Image",
    icon: "panel-frame-fitting",
    inspectorContext: "image",
  },
  {
    panelId: "paged.component-library",
    title: "Library",
    icon: "ui-component",
  },
  {
    panelId: "paged.object-styles",
    title: "Styles",
    icon: "panel-object-styles",
  },
  { panelId: "paged.swatches", title: "Swatches", icon: "panel-swatches" },
  { panelId: "paged.data-mapping", title: "Data", icon: "ui-database" },
  {
    panelId: "paged.properties",
    title: "Pages",
    icon: "panel-pages",
    inspectorContext: "page",
  },
  { panelId: "paged.comments", title: "Comments", icon: "ui-comment" },
  { panelId: "paged.preflight", title: "Preflight", icon: "ui-target" },
];
