// E2E gesture suite — deferred plan items. The gesture test plan
// (thoughts/docs/paged/tests/gestures.md §4.6) specifies twelve E2E
// scenarios; the implemented ones live in the gesture-*.spec.ts
// siblings. The rest target features the editor does not ship yet —
// each is a test.fixme carrying its plan ID so the suite documents
// the full plan and flips loudly (fixme passes = failure) the day
// the feature lands. Wire the real test then, delete the stub.

import { test } from "@playwright/test";

test.describe("gestures.md — deferred E2E scenarios", () => {
  // E2E-02 (gridify) is now LIVE in gesture-gridify.spec.ts (W2.7).
  // E2E-03 (pen tool) is now LIVE in gesture-pen.spec.ts (W2.5).
  // E2E-06 (ruler guides) is now LIVE in gesture-guides.spec.ts (W2.8).
  // E2E-08 (pan/zoom mid-gesture), E2E-09 (floating pane), E2E-10 (DPR
  // variation), and E2E-11 (pointer-capture loss / blur) are now LIVE
  // in gesture-cross-cutting.spec.ts (W2.3 — E2E-11 fixed a real abort
  // bug in ViewportCanvas). Their deferral stubs were removed when the
  // real suites landed.

  test.fixme(
    "E2E-05 — thread two text frames; verify reflow indicator (TH-01…04)",
    async () => {
      // SUPERSEDED by gesture-threading.spec.ts (W2.9): TH-01 (out-port
      // → link an empty text frame), TH-02 (out-port → draw+link a new
      // frame), and TH-03 (Esc clears the loaded cursor) are now the
      // real implementation. TH-04's overset BADGE leg is fixme'd there
      // on the overset read-surface gap (no overset fixture +
      // unverified incremental-rebuild overset). This E2E-05 stub stays
      // until the visual "reflow indicator" (VR-08 chain arrows between
      // linked frames) is wired — TH-01…03 assert the link at the
      // channel + port-glyph level, not the inter-frame reflow line.
    },
  );

  test.fixme(
    "E2E-12 — reload after commits → editor-server round-trip → document identical (IT-04)",
    async () => {
      // Not implemented: the canvas app has no editor-server
      // persistence path — committed Operations live only in the
      // worker's in-memory document.
    },
  );
});
