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

// The intent → expected-context contract — the journey oracle's source
// of truth. Each row encodes what a DTP/InDesign user expects to SEE
// after an action: which Properties mode, which control sections, the
// selection/caret state, the active tool, the open panels. It is
// declarative and TOLERANT — every field is optional, so a test asserts
// only the dimensions its intent owns (omitting a field = "don't care").
// This is what keeps the oracle from degrading into a brittle full-DOM
// snapshot.
//
// Where the app diverges from InDesign convention today, the contract
// states the CORRECT expectation and the journey is `test.fixme`'d with a
// pointer to the gap — the oracle is a living UX spec, not a fossil of
// current behaviour.

/** The Properties context-inspector mode (properties-panel.tsx). */
export type InspectorKind = "text" | "image" | "frame" | "page" | "none";

/** A per-control expectation inside a named Properties section. */
export interface ExpectedControl {
  /** Section wrapper key: `object | fitting | stroke | character |
   *  paragraph` (the `data-properties-section` values). */
  section: string;
  /** aria-label (default) or `data-control` id of the control. */
  label: string;
  by?: "aria" | "data";
  present?: boolean;
  enabled?: boolean;
  populated?: boolean;
}

/** A declarative expected context. Every field optional = "don't care". */
export interface ExpectedContext {
  /** Human label — shown verbatim in failure diffs. */
  intent: string;
  /** Active tool slot id (the `data-tool-slot` the rail marks active). */
  tool?: string;
  /** Properties context-inspector mode. */
  inspectorKind?: InspectorKind;
  /** Sections that MUST render. */
  sectionsPresent?: string[];
  /** Sections that MUST be absent. */
  sectionsAbsent?: string[];
  /** Element (page-item) selection. */
  elementSelection?: { count?: number; kind?: string };
  /** Text content selection: collapsed caret, a range, or none. */
  contentSelection?: "none" | "caret" | "range";
  /** Panels that must be open (subset check). */
  panelsOpen?: string[];
  /** The foregrounded panel. */
  activePanel?: string;
  /** Edit-context stack top (`null` = no scoped-editing context). */
  editContext?: { type: string | null };
  /** Selection overlay: the handle flavour + count. `frame8` = the eight
   *  resize handles; `textBeam` = the text caret; `none` = nothing. */
  overlay?: {
    handles?: "frame8" | "textBeam" | "anchorPoints" | "none";
    handleCount?: number;
  };
  /** Per-control assertions (present/enabled/populated). */
  controls?: ExpectedControl[];
}

// ── Canonical DTP intents ────────────────────────────────────────────

/** Blank document, nothing selected. InDesign shows no object/text
 *  controls — just page/document properties. We assert the strong,
 *  position-independent facts (no element/text sections, empty
 *  selection); `inspectorKind` is intentionally omitted because the
 *  empty state may resolve to either `none` or the page summary. */
export const EMPTY_DOC: ExpectedContext = {
  intent: "Blank document, nothing selected → no object/text sections",
  tool: "select",
  sectionsAbsent: ["object", "stroke", "character", "paragraph", "fitting"],
  elementSelection: { count: 0 },
  contentSelection: "none",
};

/** A graphic frame/shape is SELECTED (no caret, no placed image). DTP
 *  convention: a Frame context — Transform + Stroke — and no text or
 *  image-fitting controls. */
export const FRAME_SELECTED: ExpectedContext = {
  intent: "A frame/shape selected → Frame context: Transform + Stroke",
  inspectorKind: "frame",
  sectionsPresent: ["object", "stroke"],
  sectionsAbsent: ["character", "paragraph", "fitting"],
  elementSelection: { count: 1 },
  contentSelection: "none",
  overlay: { handles: "frame8", handleCount: 8 },
};

/** Multiple objects selected. DTP convention: a combined Frame context
 *  (Transform + Stroke on the group box) — the Align/Distribute context.
 *  No text/fitting controls. */
export const MULTI_SELECT: ExpectedContext = {
  intent: "Multiple objects selected → Frame context (group box)",
  inspectorKind: "frame",
  sectionsPresent: ["object", "stroke"],
  sectionsAbsent: ["character", "paragraph", "fitting"],
  elementSelection: { count: 2 },
  contentSelection: "none",
};

/** An image frame is SELECTED. DTP convention: the Image context —
 *  Transform + **Frame Fitting** + Stroke. The Frame-Fitting section is
 *  what distinguishes it from a plain frame. */
export const IMAGE_FRAME: ExpectedContext = {
  intent: "An image frame selected → Image context: Transform + Frame Fitting + Stroke",
  inspectorKind: "image",
  sectionsPresent: ["object", "fitting", "stroke"],
  sectionsAbsent: ["character", "paragraph"],
  elementSelection: { count: 1 },
  contentSelection: "none",
};

/** A text frame is SELECTED with the Selection tool (no caret). DTP
 *  convention: this is a FRAME context — you edit geometry/stroke, not
 *  glyphs. Character/Paragraph are NOT live without a caret. */
export const TEXT_FRAME_SELECTED: ExpectedContext = {
  intent: "Text frame selected (Selection tool) → Frame context, not Text",
  inspectorKind: "frame",
  sectionsPresent: ["object", "stroke"],
  sectionsAbsent: ["character", "paragraph", "fitting"],
  elementSelection: { kind: "textFrame", count: 1 },
  contentSelection: "none",
};

/** A caret is active inside a text frame. DTP convention: the Text
 *  context (Character + Paragraph) becomes live. */
export const TEXT_CARET_EDITING: ExpectedContext = {
  intent: "Caret in a text frame → Text context: Character + Paragraph",
  inspectorKind: "text",
  sectionsPresent: ["character", "paragraph"],
  contentSelection: "caret",
};
