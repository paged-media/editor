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
    title: "Design",
    icon: "panel-canvas",
    order: 10,
    blurb: "Composition, typography, grids, components",
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
    panelSet: {
      left: ["paged.comments"],
      right: ["paged.pages"],
    },
  },
  {
    id: "export",
    toolbarLeft: ExportToolbar,
    title: "Export",
    icon: "ui-export",
    order: 60,
    blurb: "Multi-format publishing",
    panelSet: {
      left: ["paged.export-center"],
      right: [],
    },
  },
];

export const PANEL_RAIL: PanelRailItem[] = [
  { panelId: "paged.character", title: "Text", icon: "panel-character" },
  { panelId: "paged.frame-fitting", title: "Image", icon: "panel-frame-fitting" },
  { panelId: "paged.object-styles", title: "Styles", icon: "panel-object-styles" },
  { panelId: "paged.component-library", title: "Library", icon: "ui-component" },
  { panelId: "paged.swatches", title: "Swatches", icon: "panel-swatches" },
  { panelId: "paged.pages", title: "Pages", icon: "panel-pages" },
  { panelId: "paged.layers", title: "Layers", icon: "panel-layers" },
  { panelId: "paged.effects", title: "Effects", icon: "panel-effects" },
  { panelId: "paged.inspector", title: "Inspect", icon: "panel-inspector" },
];
