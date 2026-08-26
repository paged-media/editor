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

// The ANNUAL contract — this file mirrors the exported constants of
// core's `paged-gen` sample `annual_base.rs` ("annual-base"), the base
// fixture of The Paged Annual, Volume One. Style/swatch/master/layer
// NAMES here must match the fixture literally: every driver lookup
// resolves BY NAME and THROWS on a miss, so drift fails on the first
// page that touches it, with the fixture named in the error.
//
// Also here: the PAGE PLAN — which physical pages each chapter owns and
// which master each page carries. Chapter modules take their page
// indexes from this table, never from literals, so the plan stays one
// reviewable list.
//
// Geometry: trim 540×720 pt, facing pages. Recto margins 54/81/48/60
// (top/bottom/inside/outside), MIRRORED on versos. Body grid 6 columns
// / 12 pt gutters (live width 432); E-Data pages 12 columns; baseline
// rhythm 13 pt — every leading and space in the style battery sums to
// multiples of it.

export const ANNUAL_PAGES = 134;

export const TRIM_W_PT = 540;
export const TRIM_H_PT = 720;
export const MARGIN_TOP_PT = 54;
export const MARGIN_BOTTOM_PT = 81;
export const MARGIN_INSIDE_PT = 48;
export const MARGIN_OUTSIDE_PT = 60;
export const BASELINE_PT = 13;

/** Recto content box (x0, y0, x1, y1) in page points. Verso mirrors. */
export const RECTO_BOX: [number, number, number, number] = [
  MARGIN_INSIDE_PT,
  MARGIN_TOP_PT,
  TRIM_W_PT - MARGIN_OUTSIDE_PT,
  TRIM_H_PT - MARGIN_BOTTOM_PT,
];
export const VERSO_BOX: [number, number, number, number] = [
  MARGIN_OUTSIDE_PT,
  MARGIN_TOP_PT,
  TRIM_W_PT - MARGIN_INSIDE_PT,
  TRIM_H_PT - MARGIN_BOTTOM_PT,
];

/** Physical page index (0-based) → is it a recto? p1 is a lone recto. */
export const isRecto = (pageIndex: number): boolean => pageIndex % 2 === 0;

export const contentBox = (
  pageIndex: number,
): [number, number, number, number] =>
  isRecto(pageIndex) ? RECTO_BOX : VERSO_BOX;

// ── masters ──────────────────────────────────────────────────────────

export const MASTER = {
  front: "A-Front",
  body: "B-Body",
  opener: "C-Opener",
  plate: "D-Plate",
  data: "E-Data",
  vertical: "F-Vertical",
  appendix: "G-Appendix",
} as const;

// ── styles (user-visible names, as the collections report them) ──────

export const STYLE = {
  body: "Annual Body",
  bodyFirst: "Body First",
  bodySmall: "Body Small",
  footnote: "Footnote",
  caption: "Caption",
  marginNote: "Margin Note",
  codeBlock: "Code Block",
  bulletList: "Bullet List",
  numbered1: "Numbered 1",
  numbered2: "Numbered 2",
  catalogEntry: "Catalog Entry",
  tableHead: "Table Head",
  tableBody: "Table Body",
  tableNumber: "Table Number",
  tocPart: "TOC Part",
  tocChapter: "TOC Chapter",
  tocHead: "TOC Head",
  indexEntry: "Index Entry",
  indexSub: "Index Sub",
  specLabel: "Spec Label",
  specValue: "Spec Value",
  chapterNumber: "Chapter Number",
  chapterTitle: "Chapter Title",
  deck: "Deck",
  head1: "Head 1",
  head2: "Head 2",
  pullQuote: "Pull Quote",
  partTitle: "Part Title",
  folio: "Folio",
  runningHead: "Running Head",
  colophon: "Colophon",
  specimenNo: "Specimen No",
} as const;

export const CHAR = {
  emphasis: "Annual Emphasis",
  strong: "Annual Strong",
  smallCaps: "Small Caps",
  codeInline: "Code Inline",
  leadIn: "Lead-In",
  superior: "Superior",
  url: "URL",
  accentInk: "Accent Ink",
  specimenNumber: "Specimen Number",
} as const;

export const OBJECT_STYLE = {
  plateFrame: "Plate Frame",
  specPanel: "Spec Panel",
  annotationMarker: "Annotation Marker",
} as const;

export const TABLE_STYLE = "Annual Table";
export const CELL_STYLE = {
  th: "Annual TH",
  td: "Annual TD",
  tdNumber: "Annual TD Number",
} as const;

// ── colour ───────────────────────────────────────────────────────────

export const SWATCH = {
  ink: "Annual Ink",
  paperWarm: "Paper Warm",
  vermilion: "Vermilion",
  vermilionTint: "Vermilion 20%",
  slate: "Slate",
  labMarigold: "Lab Marigold",
  screenBlue: "Screen Blue",
} as const;

export const GRADIENT_RAMP = "Annual Ramp";
export const COLOR_GROUP_BRAND = "Annual Brand";

// ── conditions ───────────────────────────────────────────────────────

export const CONDITION = {
  printOnly: "Print-only",
  screenOnly: "Screen-only",
  specNotes: "Spec-Notes",
} as const;

export const CONDITION_SET = {
  press: "Press",
  workingCopy: "Working Copy",
} as const;

// ── structure ────────────────────────────────────────────────────────

export const TOC_STYLE_NAME = "Annual Contents";
export const LAYER = {
  grid: "Grid",
  background: "Background",
  content: "Content",
  annotations: "Annotations",
  notes: "Notes",
} as const;

export const BOOKMARKS = ["Apparatus", "Chapter One", "Data Tables"] as const;
export const INDEX_TOPICS = [
  "Typography",
  "Baskerville",
  "Grids",
  "Spot colour",
  "Lab colour",
  "Footnotes",
  "Data tables",
  "Vertical writing",
  "Appendices",
  "Colophon",
] as const;

/** Master furniture the fixture bakes — asserted by anatomy pages. */
export const RUNNING_HEAD_VERSO_TEXT = "THE PAGED ANNUAL · MMXXVI";
export const OVERRIDE_HEAD_TEXT = "SPECIMENS RECONSIDERED · AN OVERRIDE";

// ── the page plan ────────────────────────────────────────────────────
//
// Physical pages are 1-based here (matching folios in proofs and the
// architecture doc); modules convert with `p()` below. Sections are
// authored LIVE by the first chapter: front matter i–x (roman) =
// p1–p10, body 1–116 (arabic) = p11–p126, appendix A·1–A·8 = p127–p134.

/** 1-based physical page → 0-based index. */
export const p = (physical: number): number => physical - 1;

export interface ChapterPlan {
  /** Chapter spec id (= filename stem under chapters/). */
  id: string;
  title: string;
  /** 1-based physical pages, inclusive ranges flattened. */
  pages: number[];
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const ANNUAL_PLAN: ChapterPlan[] = [
  { id: "100-front-matter", title: "Front matter", pages: range(1, 10) },
  { id: "110-anatomy", title: "Part I divider · Ch.1 Anatomy of This Book", pages: range(11, 18) },
  { id: "120-letter", title: "Ch.2 The Letter", pages: range(19, 22) },
  { id: "125-paragraph", title: "Ch.3 The Paragraph", pages: range(23, 26) },
  { id: "130-style", title: "Ch.4 The Style", pages: range(27, 32) },
  { id: "135-story", title: "Ch.5 The Story", pages: range(33, 40) },
  { id: "140-scripts", title: "Ch.6 Scripts of the World", pages: range(41, 44) },
  { id: "145-apparatus", title: "Ch.7 The Apparatus", pages: range(45, 46) },
  { id: "150-object", title: "Ch.8 The Object", pages: range(47, 52) },
  { id: "155-ink-light", title: "Ch.9 Ink & Light", pages: range(53, 56) },
  { id: "160-effects", title: "Ch.10 The Effects", pages: range(57, 60) },
  { id: "165-color", title: "Ch.11 The Colour", pages: range(61, 64) },
  { id: "170-table", title: "Ch.12 The Table", pages: range(65, 70) },
  { id: "175-picture", title: "Ch.13 The Picture", pages: range(71, 74) },
  { id: "200-drawing-office", title: "Part II divider · Ch.14 The Drawing Office", pages: range(75, 86) },
  { id: "210-darkroom", title: "Ch.15 The Darkroom", pages: range(87, 94) },
  { id: "220-ledger", title: "Ch.16 The Ledger", pages: range(95, 102) },
  { id: "230-long-read", title: "Ch.17 The Long Read", pages: range(103, 108) },
  { id: "240-catalog", title: "Ch.18 The Catalog", pages: range(109, 114) },
  { id: "250-manuscript", title: "Ch.19 The Manuscript", pages: range(115, 118) },
  { id: "300-press", title: "Part III divider · Ch.20 Imposition & Proof", pages: range(119, 126) },
  { id: "310-appendix", title: "Appendix — Limits, Index, Colophon", pages: range(127, 134) },
];

/** D-Plate pages (1-based) — zero margins, no furniture, bleed-capable. */
export const PLATE_PAGES = [1, 2, 9, 10, 11, 12, 54, 55, 75, 76, 86, 119, 120, 122];
/** E-Data pages (1-based) — 12-column fine grid. */
export const DATA_PAGES = [16, ...range(66, 70), ...range(96, 102), ...range(110, 114), 123, 124, 125];
/** Chapter-opener rectos (1-based, C-Opener master). */
export const OPENER_PAGES = [13, 19, 23, 27, 33, 41, 45, 47, 53, 57, 61, 65, 71, 77, 87, 95, 103, 109, 115, 121];
/** The fixture-authored master-override page (1-based). */
export const OVERRIDE_PAGE = 15;
/** CJK vertical pages on F-Vertical (1-based). */
export const VERTICAL_PAGES = [43, 44];
