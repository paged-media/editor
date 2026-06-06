// W2.8 — shell-local copy of the canvas page-layout convention.
//
// The guide controller (shell) must resolve a document-pt pointer to
// a page + page-local coordinate, the same way the canvas viewport
// does. The authoritative layout lives in `apps/canvas/src/ui/layout.ts`
// (the app owns page geometry), but shell cannot import from apps, so
// the ONE convention the controller needs — pages stacked vertically
// at x=0 with a fixed 24 pt gap — is mirrored here. If the app's
// stacking ever changes (spreads side-by-side, columns), both must
// move together; this file names that coupling explicitly.

export interface ShellPageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mirror of `apps/canvas/src/ui/layout.ts` `layoutPages`. */
export function layoutPageRects(
  pageSizesPt: ReadonlyArray<readonly [number, number]>,
  gapPt = 24,
): ShellPageRect[] {
  const out: ShellPageRect[] = [];
  let y = 0;
  for (const [w, h] of pageSizesPt) {
    out.push({ x: 0, y, w, h });
    y += h + gapPt;
  }
  return out;
}
