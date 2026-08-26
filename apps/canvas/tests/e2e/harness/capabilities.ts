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

// E2E op suite — the CHECKED-IN capability table: engine support
// for every wire Mutation op, as established EMPIRICALLY by the
// probe in capability-matrix.spec.ts. The spec asserts the current
// engine classification matches this table — support changing in
// EITHER direction fails CI with instructions to update the table
// (and add/upgrade the real domain test).
//
// Statuses:
//   supported   — op applies, model changes, undo restores
//   unsupported — op rejected (the note carries the error kind)
//
// Seeded from the capture run on 2026-06-05 (E2E_CAPS=capture);
// re-captured 2026-06-06 against protocol v28 (the W0/W1 wave:
// applyStyle/insertField/linkFrames/unlinkFrames went live, plus
// insertTextFrame/insertOval, guide CRUD, masters/sections ops and
// conditional-text ops), then again 2026-06-06 against protocol v30
// (W3.A2: the 6 table ops — setRowHeight/setColumnWidth/insertTableRow
// /deleteTableRow/insertTableColumn/deleteTableColumn, probed against
// the tables fixture's first cell — plus the 3 kernel path ops
// outlineStroke/offsetPath/simplifyPath), then 2026-06-07 against
// protocol v34 (createGroup/dissolveGroup, setPluginMetadata), then
// again 2026-06-07 against protocol v35 (W2.11 tables v2: the
// header/footer row ops insertHeaderRow/removeHeaderRow/insertFooterRow
// /removeFooterRow + setCellSpan, probed against the tables fixture's
// first cell), then 2026-06-07 (W2.10: the W1.22 NumberingList CRUD ops
// createNumberingList/editNumberingList/deleteNumberingList — the
// Bullets & Numbering list-definition surface — probed on the `text`
// fixture). Update via the same run when core lands new ops.
//
// 2026-08-09: RE-CAPTURED at protocol v61 (engine `canvas-wasm@0.61.1`).
// Every op listed below still classifies as recorded — the probe passed
// unchanged. But the recapture surfaced something the probe structurally
// cannot: this table had drifted TWENTY-ONE protocol versions without a
// red run, because the probe validates the ops the table LISTS and
// nothing iterates the engine's own set. The header above said "v40"
// while core was at 61; the table carried 94 ops, the engine declares
// 117.
//
// The 23 it had never heard of include `insertHyperlink` and
// `insertAnchoredFrame` — doors the plugin-doc campaign built and
// shipped — plus the seven `pathfinder*` region verbs, both opacity-mask
// ops, and text-on-a-path. They are now named in KNOWN_UNCLASSIFIED in
// capability-matrix.spec.ts, guarded by AC-E2E-CAPS-COVER as a
// shrink-only ratchet: a NEW engine op fails immediately, and an entry
// that gets classified must leave the list.
//
// Why they are not classified here: a probe needs real args, and a probe
// built on guessed args reports "unsupported" when the guess is wrong
// rather than when the engine lacks the op. This table is where
// paged-media/state's completeness-check.mjs gets its wire-op list, so
// false evidence here propagates straight into the capability registry —
// worse than the gap it would paper over.
//
// 2026-06-12: re-captured at protocol v40, closing the v36–v40 gap the
// audit flagged (02 E5'). Added `setGroupTransform` — the group-transform
// write that landed beside createGroup/dissolveGroup — and probed it
// against the 0.40.0 engine (transforms a scratch group built from two
// frames, modeled on the dissolveGroup probe). NOTE: the audit also named
// `insertTable`; the 0.40.0 wire union had NO standalone insertTable
// Mutation (table creation rode a NodeSpec through an insert op, and the
// engine rejected a bare `insertTable`, probe-verified) — HISTORY as of
// the v62 re-capture below: the CURRENT wire ships `insertTable` as a
// standalone story-addressed op (the showcase's 11-tables page builds on
// it), and it is classified in the table.
// The path-segment discriminants moveTo/lineTo/cubicTo/close are
// `ScenePathSeg` kinds (the C-1 scene-layer payload), NOT Mutation ops,
// so they are correctly absent. The table's op universe == the published
// Mutation union, which `state/scripts/completeness-check.mjs` derives
// its wire-op set from (CAPS_FILE).
//
// 2026-08-26: the 94→117 drift CLOSED at protocol v62. All 23 ops the
// AC-E2E-CAPS-COVER ratchet named in KNOWN_UNCLASSIFIED got real-args
// probes (shapes sourced from the generated .d.ts, core's wire tests —
// opacity_mask_and_text_path / planar_regions / reorder / place_image /
// placeholder / batch_composition — and the shipping consumers in
// plugin-draw / plugin-doc / the showcase) and are classified below;
// KNOWN_UNCLASSIFIED is empty.

export type CapabilityStatus = "supported" | "unsupported";

export interface Capability {
  op: string;
  status: CapabilityStatus;
  note?: string;
}

export const CAPABILITIES: Capability[] = [
  // ── text ops ──────────────────────────────────────────────────────
  { op: "insertText", status: "supported" },
  { op: "deleteRange", status: "supported" },
  { op: "applyStyle", status: "supported" },
  { op: "insertField", status: "supported" },
  // ── frame / page structure ────────────────────────────────────────
  { op: "moveFrame", status: "supported", note: "live as of the v35 wasm bump (was a notImplemented stub); frame moves also ride the translate gesture, proven in proving.spec AC-E2E-PROVE-2" },
  { op: "resizeFrame", status: "supported" },
  { op: "linkFrames", status: "supported" },
  { op: "unlinkFrames", status: "supported" },
  { op: "insertPage", status: "supported" },
  { op: "deletePage", status: "supported" },
  { op: "resizePage", status: "supported" },
  { op: "duplicatePage", status: "supported" },
  { op: "insertFrame", status: "supported" },
  { op: "insertTextFrame", status: "supported" },
  { op: "deleteFrame", status: "supported" },
  { op: "insertLine", status: "supported" },
  { op: "insertPath", status: "supported" },
  { op: "insertOval", status: "supported" },
  // ── guides / masters / sections (v28) ─────────────────────────────
  { op: "insertGuide", status: "supported" },
  { op: "moveGuide", status: "supported" },
  { op: "deleteGuide", status: "supported" },
  { op: "applyMasterToPage", status: "supported" },
  { op: "insertSection", status: "supported" },
  { op: "editSection", status: "supported" },
  { op: "deleteSection", status: "supported" },
  // ── conditional text (v28) ────────────────────────────────────────
  { op: "setConditionVisible", status: "unsupported", note: "engine op live (v28) — generated fixtures carry no conditions to probe" },
  { op: "activateConditionSet", status: "unsupported", note: "engine op live (v28) — generated fixtures carry no condition sets to probe" },
  // ── document settings ─────────────────────────────────────────────
  { op: "setDocumentDefaults", status: "supported" },
  { op: "setColorSettings", status: "supported" },
  { op: "setProofSetup", status: "supported" },
  { op: "importSwatchLibrary", status: "supported" },
  { op: "setInkSetting", status: "supported" },
  { op: "setUseStandardLabForSpots", status: "supported" },
  // ── path topology ─────────────────────────────────────────────────
  { op: "pathPointInsert", status: "supported" },
  { op: "pathPointRemove", status: "supported" },
  { op: "pathOpenAt", status: "supported" },
  { op: "pathPointCurveType", status: "supported" },
  { op: "pathPointSet", status: "supported" },
  { op: "batch", status: "supported" },
  // ── kernel path ops (v30) ─────────────────────────────────────────
  { op: "outlineStroke", status: "supported" },
  { op: "offsetPath", status: "supported" },
  { op: "simplifyPath", status: "supported" },
  // ── group ops (v32) ───────────────────────────────────────────────
  { op: "createGroup", status: "supported" },
  { op: "dissolveGroup", status: "supported" },
  // ── group transform (v40 re-capture) ──────────────────────────────
  { op: "setGroupTransform", status: "supported" },
  // ── plugin-metadata carrier (v33; v34 adds the batch $created
  //    sentinel — probed through the batch op) ──────────────────────
  { op: "setPluginMetadata", status: "supported" },
  // ── table ops (v30) ───────────────────────────────────────────────
  { op: "setRowHeight", status: "supported" },
  { op: "setColumnWidth", status: "supported" },
  { op: "insertTableRow", status: "supported" },
  { op: "deleteTableRow", status: "supported" },
  { op: "insertTableColumn", status: "supported" },
  { op: "deleteTableColumn", status: "supported" },
  // ── table ops (v35: header/footer rows + cell span) ───────────────
  { op: "insertHeaderRow", status: "supported" },
  { op: "removeHeaderRow", status: "supported" },
  { op: "insertFooterRow", status: "supported" },
  { op: "removeFooterRow", status: "supported" },
  { op: "setCellSpan", status: "supported" },
  // ── layers ────────────────────────────────────────────────────────
  { op: "layerSetVisible", status: "supported" },
  { op: "layerSetLocked", status: "supported" },
  { op: "layerSetPrintable", status: "supported" },
  { op: "layerSetName", status: "supported" },
  { op: "layerMove", status: "supported" },
  { op: "layerInsert", status: "supported" },
  { op: "layerRemove", status: "supported" },
  // ── properties / boolean ──────────────────────────────────────────
  { op: "setElementProperty", status: "supported" },
  { op: "pathfinderBoolean", status: "supported" },
  // ── colour resources ──────────────────────────────────────────────
  { op: "createSwatch", status: "supported" },
  { op: "editSwatch", status: "supported" },
  { op: "deleteSwatch", status: "supported" },
  { op: "createGradient", status: "supported" },
  { op: "editGradient", status: "supported" },
  { op: "deleteGradient", status: "supported" },
  { op: "createColorGroup", status: "supported" },
  { op: "editColorGroup", status: "supported" },
  { op: "deleteColorGroup", status: "supported" },
  // ── numbering lists (W1.22 — the Bullets & Numbering list-definition surface) ──
  { op: "createNumberingList", status: "supported" },
  { op: "editNumberingList", status: "supported" },
  { op: "deleteNumberingList", status: "supported" },
  // ── styles ────────────────────────────────────────────────────────
  { op: "createParagraphStyle", status: "supported" },
  { op: "renameParagraphStyle", status: "supported" },
  { op: "deleteParagraphStyle", status: "supported" },
  { op: "createCharacterStyle", status: "supported" },
  { op: "renameCharacterStyle", status: "supported" },
  { op: "deleteCharacterStyle", status: "supported" },
  { op: "createObjectStyle", status: "supported" },
  { op: "renameObjectStyle", status: "supported" },
  { op: "deleteObjectStyle", status: "supported" },
  { op: "createCellStyle", status: "supported" },
  { op: "renameCellStyle", status: "supported" },
  { op: "deleteCellStyle", status: "supported" },
  { op: "createTableStyle", status: "supported" },
  { op: "renameTableStyle", status: "supported" },
  { op: "deleteTableStyle", status: "supported" },
  { op: "setStyleProperty", status: "supported" },
  // ── the v62 re-capture (2026-08-26): the 23 formerly-unclassified ──
  // story-addressed doors
  { op: "insertTable", status: "supported", note: "standalone story-addressed door (v37+); mints a STRUCTURED ElementId::Table ({story_id, table_id})" },
  { op: "insertAnchoredFrame", status: "supported", note: "proto 52, the plugin-doc inline-image door; imageUri optional" },
  { op: "insertHyperlink", status: "supported", note: "proto 53, plugin-doc; contiguous char offsets" },
  { op: "setFieldValue", status: "supported", note: "v43 D-01; re-resolves a placeholder field at its enumerated offset (the probe inserts one first)" },
  // path topology (v57 join/close)
  { op: "closePath", status: "supported", note: "requires an OPEN subpath" },
  { op: "joinPaths", status: "supported", note: "welds otherId INTO elementId; both must be open paths" },
  // planar region verbs (v57, B-22)
  { op: "pathfinderDivide", status: "supported" },
  { op: "pathfinderTrim", status: "supported" },
  { op: "pathfinderMerge", status: "supported" },
  { op: "pathfinderCrop", status: "supported" },
  { op: "pathfinderOutline", status: "supported" },
  { op: "pathfinderMinusBack", status: "supported" },
  { op: "pathfinderFaces", status: "supported", note: "faces are engine-minted ids — read them via requestPlanarRegions, never guess the format" },
  // nesting + z-order
  { op: "pasteInto", status: "supported" },
  { op: "releaseFrom", status: "supported" },
  { op: "reorderElement", status: "supported", note: "ZOrderTarget verb or {index}" },
  // opacity mask + text-on-a-path (v58: C-28 / C-29)
  { op: "applyOpacityMask", status: "supported", note: "lossless only via .paged — .idml export reports the mask as a named loss" },
  { op: "releaseOpacityMask", status: "supported" },
  { op: "attachTextToPath", status: "supported", note: "requires a story flowing into NO frame (a story belongs to exactly one flow)" },
  { op: "detachTextFromPath", status: "supported" },
  // image content (v43 D-14 / v50 C-1)
  { op: "placeImage", status: "supported", note: "elementId is the BARE self id; an unreachable uri still applies (link only)" },
  { op: "replaceImageBytes", status: "supported", note: "bare self id + decoded-on-apply image bytes" },
  // batch handle binding (v34)
  { op: "bindCreated", status: "supported", note: "only meaningful inside a batch — binds the batch's most recent createdId for $h:<handle> refs; probed as insert→bind→write" },
];

export function expectedStatus(op: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.op === op);
}
