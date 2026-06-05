// Cockpit — the kit's nine-menu line (File Edit Layout Type Object
// Data View Window Help). Real commands register elsewhere
// (File/Open IDML…, File/Export PDF…, Edit/Undo…, View/Zoom…, the
// registry-driven Window menu); everything here is the VISIBLE,
// honestly-disabled remainder of the kit's menu skeleton — each
// item lights up when its backing lands. Sentence case per the
// content rules.

import type { MenuItemContribution } from "@paged-media/shell";

const soon = (
  path: string,
  order: number,
  group?: string,
): MenuItemContribution => ({
  path,
  command: `paged.soon.${path.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  order,
  group,
  disabled: true,
});

export const COCKPIT_MENU_SEAMS: MenuItemContribution[] = [
  // ── File (kit FILE_MENU; Open IDML… + Export PDF… are real) ──
  soon("File/New document…", 5, "open"),
  soon("File/Open recent", 12, "open"),
  soon("File/Close", 30, "save"),
  soon("File/Save", 31, "save"),
  soon("File/Save as…", 32, "save"),
  soon("File/Place…", 40, "place"),
  soon("File/Package…", 60, "produce"),
  soon("File/Print…", 61, "produce"),
  // ── Layout ──
  soon("Layout/Margins and columns…", 10),
  soon("Layout/Ruler guides…", 20),
  soon("Layout/Create guides…", 21),
  soon("Layout/Numbering and section options…", 30),
  // ── Type ──
  soon("Type/Character…", 10),
  soon("Type/Paragraph…", 11),
  soon("Type/Tabs…", 20),
  soon("Type/Insert special character", 30),
  // ── Object ──
  soon("Object/Transform", 10),
  soon("Object/Arrange", 11),
  soon("Object/Group", 20),
  soon("Object/Effects…", 30),
  // ── Data (the data-publishing surface) ──
  soon("Data/Connect source…", 10),
  soon("Data/Field mapping…", 20),
  soon("Data/Generate pages…", 30),
  // ── Help ──
  soon("Help/Documentation", 10),
  soon("Help/Keyboard shortcuts", 20),
];
