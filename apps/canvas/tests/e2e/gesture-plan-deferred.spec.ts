// E2E gesture suite — deferred plan items. The gesture test plan
// (thoughts/docs/paged/tests/gestures.md §4.6) specifies twelve E2E
// scenarios; the implemented ones live in the gesture-*.spec.ts
// siblings. The rest target features the editor does not ship yet —
// each is a test.fixme carrying its plan ID so the suite documents
// the full plan and flips loudly (fixme passes = failure) the day
// the feature lands. Wire the real test then, delete the stub.

import { test } from "@playwright/test";

test.describe("gestures.md — deferred E2E scenarios", () => {
  test.fixme(
    "E2E-02 — gridify: arrow keys mid-drag split the draw into N×M frames (DR-05/06/07)",
    async () => {
      // Not implemented: the draw handlers (packages/tools/src/
      // handlers/rectangle-tool.ts) have no arrow-key listener and
      // insertFrame lands a single frame per commit.
    },
  );

  test.fixme(
    "E2E-03 — pen tool: 5-point path, one Alt-broken handle, close path (DR-08…11)",
    async () => {
      // Not implemented: the Pen tool is registered (group "pen" in
      // packages/tools/src/built-in-tools.ts) but carries no gesture
      // handler — only pathEdit on EXISTING paths is wired.
    },
  );

  test.fixme(
    "E2E-05 — thread two text frames; verify reflow indicator (TH-01…04)",
    async () => {
      // Not implemented: no threading mutation exists on the wire
      // (packages/client/src/protocol.ts) and ports are not hittable.
    },
  );

  test.fixme(
    "E2E-06 — drag guide from ruler; snap a frame to it; drag it back to delete (GD-01…03)",
    async () => {
      // Partially implemented: ruler guides parse from IDML and act
      // as snap targets (tests/ruler-guides.spec.ts), but there is no
      // create/move/delete guide gesture or mutation.
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
