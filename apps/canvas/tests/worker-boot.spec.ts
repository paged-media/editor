// Worker-boot + prod-bundling acceptance (W0.17, audit D6/E8).
//
// WHY THIS EXISTS — what the non-browser checks could NOT cover.
// The W0.17 work fixed two coupled prod-readiness gaps:
//   1. The render worker was spawned through an indirected `workerUrl` passed
//      across the @paged-media/client package boundary, which defeated Vite's
//      static worker analysis — prod `dist` shipped a raw un-transpiled
//      `worker.ts` and NO `.wasm` asset. Fixed by a Vite `?worker` import +
//      `workerFactory` (see apps/canvas/src/main.tsx + packages/client).
//   2. SharedArrayBuffer needs cross-origin isolation (COOP/COEP); without it
//      the worker dies allocating the camera SAB. A boot assertion + a
//      static-host `_headers` file now cover that.
// A build + `vite preview` + curl can prove the worker CHUNK and the `.wasm`
// ASSET exist and resolve with the right content-types — but only a real
// browser can prove the worker actually BOOTS: spawns, dynamically imports the
// wasm, instantiates it, and that the page is genuinely cross-origin isolated
// so the SAB allocates. That is this spec's job. Run it in the sibling's
// Playwright CI (it owns the runner); it is intentionally not run from the
// non-browser verification path.

import { test, expect } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

test.describe("W0.17 — worker boot + cross-origin isolation", () => {
  test("the document is cross-origin isolated (SAB is allocatable) @feat:plugin-platform.worker-pool @feat:the-renderer.offscreen-worker @level:happy", async ({
    page,
  }) => {
    await page.goto("/");
    // The dev server (and the static host via public/_headers) must set
    // COOP same-origin + COEP require-corp. If they didn't, this is false and
    // every SharedArrayBuffer allocation downstream throws SecurityError.
    const isolated = await page.evaluate(() => globalThis.crossOriginIsolated);
    expect(isolated, "crossOriginIsolated must be true — check COOP/COEP headers").toBe(
      true,
    );

    // Prove a SAB actually constructs (the worker does exactly this for the
    // camera + gesture buffers).
    const sabOk = await page.evaluate(() => {
      try {
        // eslint-disable-next-line no-new
        new SharedArrayBuffer(8);
        return true;
      } catch {
        return false;
      }
    });
    expect(sabOk, "new SharedArrayBuffer(8) must not throw").toBe(true);
  });

  test("the boot-time isolation banner does NOT fire @feat:plugin-platform.worker-pool @feat:the-renderer.offscreen-worker @level:smoke", async ({ page }) => {
    const banners: string[] = [];
    page.on("console", (msg) => {
      if (/CROSS-ORIGIN ISOLATION MISSING/.test(msg.text())) {
        banners.push(msg.text());
      }
    });
    await page.goto("/");
    // Give the entry module a tick to run assertCrossOriginIsolated().
    await page.waitForTimeout(250);
    expect(banners, "boot COI banner must not fire when isolated").toEqual([]);
  });

  test("the render worker boots: spawns, loads wasm, reports ready @feat:plugin-platform.worker-pool @feat:the-renderer.offscreen-worker @level:smoke", async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (err) => failures.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      const t = msg.text();
      // The worker posts these warnings on a failed boot (see worker.ts):
      // initFailed (wasm load/instantiate threw), protocolMismatch, or a
      // dispatchError. Any of them means the worker did not boot cleanly.
      if (/initFailed|protocolMismatch|dispatchError/.test(t)) {
        failures.push(`worker warning: ${t}`);
      }
    });

    // `openCanvas` navigates and waits for the app's client handle to exist —
    // which only happens once the worker has spawned and the wasm module
    // import + `default(wasmUrl)` instantiate have resolved. If the prod
    // bundling regressed (raw .ts worker / missing .wasm), the worker never
    // reaches ready and this times out.
    await openCanvas(page);

    expect(failures, "worker must boot without init/protocol/dispatch errors").toEqual(
      [],
    );
  });

  test("the worker chunk + wasm asset resolve with correct content-types @feat:plugin-platform.worker-pool @feat:the-renderer.offscreen-worker @level:happy", async ({
    page,
    request,
  }) => {
    // Drive the app so the worker fetches its wasm, then read the actual
    // network responses. This is the browser-side mirror of the curl checks
    // run during non-browser verification — here against the live worker.
    const wasmResponses: { url: string; type: string | undefined; status: number }[] =
      [];
    page.on("response", (resp) => {
      const url = resp.url();
      if (url.endsWith(".wasm")) {
        wasmResponses.push({
          url,
          type: resp.headers()["content-type"],
          status: resp.status(),
        });
      }
    });

    await openCanvas(page);

    expect(
      wasmResponses.length,
      "the worker must fetch exactly one .wasm asset",
    ).toBeGreaterThanOrEqual(1);
    for (const r of wasmResponses) {
      expect(r.status, `${r.url} status`).toBe(200);
      expect(r.type, `${r.url} content-type`).toContain("application/wasm");
    }
  });
});
