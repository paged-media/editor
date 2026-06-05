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
// update via the same run when core lands new ops.

export type CapabilityStatus = "supported" | "unsupported";

export interface Capability {
  op: string;
  status: CapabilityStatus;
  note?: string;
}

export const CAPABILITIES: Capability[] = [
  // ── text ops ──────────────────────────────────────────────────
  { op: "insertText", status: "supported" },
  { op: "deleteRange", status: "supported" },
  { op: "applyStyle", status: "unsupported", note: "notImplemented stub" },
  { op: "insertField", status: "unsupported", note: "notImplemented stub" },
  // ── frame / page structure ────────────────────────────────────
  // MoveFrame is a notImplemented stub — frame moves ride the
  // translate gesture (commitGesture), not this mutation. resize
  // goes through SetProperty(frameBounds), which IS wired.
  {
    op: "moveFrame",
    status: "unsupported",
    note: "notImplemented stub — use translate gesture",
  },
  { op: "resizeFrame", status: "supported" },
  { op: "linkFrames", status: "unsupported", note: "notImplemented stub" },
  { op: "unlinkFrames", status: "unsupported", note: "notImplemented stub" },
  { op: "insertPage", status: "supported" },
  { op: "deletePage", status: "supported" },
  { op: "resizePage", status: "supported" },
  { op: "insertFrame", status: "supported" },
  { op: "deleteFrame", status: "supported" },
  { op: "insertLine", status: "supported" },
  { op: "insertPath", status: "supported" },
  // ── document settings ─────────────────────────────────────────
  { op: "setDocumentDefaults", status: "supported" },
  { op: "setColorSettings", status: "supported" },
  { op: "setProofSetup", status: "supported" },
  { op: "importSwatchLibrary", status: "supported" },
  { op: "setInkSetting", status: "supported" },
  { op: "setUseStandardLabForSpots", status: "supported" },
  // ── path topology ─────────────────────────────────────────────
  { op: "pathPointInsert", status: "supported" },
  { op: "pathPointRemove", status: "supported" },
  { op: "pathOpenAt", status: "supported" },
  { op: "pathPointCurveType", status: "supported" },
  { op: "pathPointSet", status: "supported" },
  { op: "batch", status: "supported" },
  // ── layers ────────────────────────────────────────────────────
  { op: "layerSetVisible", status: "supported" },
  { op: "layerSetLocked", status: "supported" },
  { op: "layerSetPrintable", status: "supported" },
  { op: "layerSetName", status: "supported" },
  { op: "layerMove", status: "supported" },
  { op: "layerInsert", status: "supported" },
  { op: "layerRemove", status: "supported" },
  // ── properties / boolean ──────────────────────────────────────
  { op: "setElementProperty", status: "supported" },
  { op: "pathfinderBoolean", status: "supported" },
  // ── colour resources ──────────────────────────────────────────
  { op: "createSwatch", status: "supported" },
  { op: "editSwatch", status: "supported" },
  { op: "deleteSwatch", status: "supported" },
  { op: "createGradient", status: "supported" },
  { op: "editGradient", status: "supported" },
  { op: "deleteGradient", status: "supported" },
  { op: "createColorGroup", status: "supported" },
  { op: "editColorGroup", status: "supported" },
  { op: "deleteColorGroup", status: "supported" },
  // ── styles ────────────────────────────────────────────────────
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
