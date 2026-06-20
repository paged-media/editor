# Demo capture (live-app demos for docs/website)

Turns the journey tests into **always-current demo recordings**. rrweb records the
editor's DOM chrome while a journey drives it; the editor frame-tap
(`CanvasClient.startFrameTap`/`onFrame`, in `packages/client`) bridges the WebGPU
document canvas in as rrweb Custom events. The captured `*.rrweb.json` replays
faithfully on docs/website (`@paged-media/demo-replay`'s `<DemoPlayer>`) with **no
WebGPU needed to watch**. No hand-recorded screencasts; demos regenerate per
release from the same tests that gate the app.

## Pieces

- `showcase.manifest.json` — the curated hero journeys to publish + the canvas selector.
- `capture.ts` — `startCapture` / `step` / `finishCapture`: inject rrweb, run the
  frame-tap, serialize the session. Tags mirror `@paged-media/demo-replay/types`.

## Wiring (CI)

1. **Build a capture variant** of the editor that keeps `window.__canvas` and the
   frame-tap (both are stripped from prod). The frame-tap is inert unless
   `startFrameTap(fps)` is called, so it has zero effect on normal builds.
2. **Add a `demo-capture` Playwright project** (in `playwright.config.ts`) that, per
   manifest entry: loads the editor (COOP/COEP from the dev server), `startCapture`,
   runs that journey's `Designer` steps (call `step(page, label)` at each
   `test.step`), `finishCapture`, and writes `out/demos/<id>.rrweb.json`.

   ```ts
   import { startCapture, step, finishCapture } from "./capture";
   import manifest from "./showcase.manifest.json";
   for (const d of manifest.demos) {
     test(`capture ${d.id}`, async ({ page }) => {
       await openEditor(page);                 // existing journey bootstrap
       await startCapture(page, { canvasSelector: manifest.canvasSelector });
       await runJourney(page, d.journey, (label) => step(page, label)); // Designer steps
       const session = await finishCapture(page);
       writeFileSync(`out/demos/${d.id}.rrweb.json`, JSON.stringify({ meta: d, ...session }));
     });
   }
   ```

3. **Upload** `out/demos/*.rrweb.json` as **GitHub Release assets** on this repo.
   docs/website pull them (their `sources.pin` → `demos`, currently `enabled:false`;
   flip it once the first release ships assets). Size knobs live in the frame-tap
   (`fps`, webp quality) — keep each session within a few MB (crop/dedup as needed).

## Status

Helper + manifest are ready. The capture Playwright project + the release-asset
upload + the capture editor build are the CI wiring left to land. Vendor the rrweb
UMD bundle (instead of the CDN default in `capture.ts`) for hermetic CI.
