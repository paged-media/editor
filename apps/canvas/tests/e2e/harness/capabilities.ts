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
];

export function expectedStatus(op: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.op === op);
}
