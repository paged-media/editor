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
  // Their deferral stubs were removed when the real suites landed.

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
    "E2E-08 — spacebar pan + ctrl-wheel zoom DURING an active move gesture (PZ-01/04)",
    async () => {
      // Not implemented: the Hand tool pans via forcePan but there is
      // no spring-loaded Space pan, and mid-gesture camera changes
      // don't re-derive the document-space delta (the plan's classic
      // bug source, PZ-04).
    },
  );

  test.fixme(
    "E2E-09 — floating/split-pane torture: run E2E-01 inside a floated canvas pane",
    async () => {
      // The plan names Dockview; the shell has since moved to the
      // cockpit layout (no floating canvas pane yet). Re-spec against
      // the cockpit's pane model when float/split ships (plan IN-08).
    },
  );

  test.fixme(
    "E2E-10 — browser zoom 80%/125% + DPR variation (IN-06)",
    async () => {
      // Needs a deviceScaleFactor/page-zoom Playwright project matrix
      // — deliberately not bolted onto the single-config suite yet
      // (playwright.config.ts is pinned for the fidelity gate).
    },
  );

  test.fixme(
    "E2E-11 — window blur / pointer-capture loss mid-drag aborts the gesture (GSM-07, INV-8)",
    async () => {
      // Not implemented: ViewportCanvas wires pointercancel to the
      // pointer-up path but has no window blur listener; a blurred
      // mid-drag session currently stays open until the next event.
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
