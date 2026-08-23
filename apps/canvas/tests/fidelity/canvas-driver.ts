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

// Playwright driver for the canvas app.
//
// Encapsulates the file-input → loadDocument → requestSnapshot dance
// so the spec file stays focused on diff orchestration.
//
// The dev-mode global `window.__canvas` (set in CanvasApp.tsx)
// exposes the live CanvasClient and DocumentHandle; the driver calls
// real client methods through `page.evaluate(...)` so we exercise
// the same code path the React UI uses.

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { expect, type Page } from "@playwright/test";

import { FIDELITY_DPI } from "./fixtures";
import { loadPackFonts } from "./fonts";

// FOGRA39 ICC profile — same one `corpus/idml/test.sh` hands to
// `pdftoppm -defaultcmykprofile`. Without this the canvas's naive
// CMYK→RGB conversion lands ~10 ΔE off the reference PDF on every
// page (uniform-coloured backgrounds dominate the metric).
const FOGRA39_PATH =
  "/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc";
function fogra39Path(): string | null {
  return existsSync(FOGRA39_PATH) ? FOGRA39_PATH : null;
}

/**
 * Whether a CMYK working profile can be registered on THIS machine.
 *
 * The path above is an Adobe installation directory, so the answer is
 * yes on a designer's Mac with Creative Cloud and no on a bare Linux
 * runner — and FOGRA39 is licensed by ECI, so it cannot simply be
 * committed to the repo to make the answer uniform. A spec that asserts
 * profile-dependent behaviour has to ask first; otherwise it encodes
 * "an Adobe install is present" as if it were a property of the editor,
 * and fails everywhere that isn't the machine it was written on.
 */
export function cmykProfileAvailable(): boolean {
  return fogra39Path() !== null;
}

/**
 * Convert an absolute filesystem path to a `/@fs/<absolute>` URL the
 * Vite dev server can stream. Vite is configured (vite.config.ts
 * `server.fs.allow`) to expose the repo root + `/tmp` + the system
 * font profile directory, so this works for IDMLs, TTFs, and the
 * Coated FOGRA39 profile alike.
 */
function vitePathFor(absPath: string): string {
  return "/@fs" + absPath;
}

export interface CanvasPageMeta {
  pageId: string;
  widthPt: number;
  heightPt: number;
}

export interface LoadedDocument {
  pageCount: number;
  pages: CanvasPageMeta[];
}

/**
 * Compute the snapshot width in pixels that matches `pdftoppm -r DPI`
 * output: width_px = round(width_pt × DPI / 72).
 */
export function snapshotWidthPx(widthPt: number, dpi = FIDELITY_DPI): number {
  return Math.round((widthPt * dpi) / 72);
}

/**
 * Navigate the page to the canvas app root, wait until the worker is
 * up and `window.__canvas` is populated.
 */
export async function openCanvas(page: Page): Promise<void> {
  // A3 — `File ▸ New` and `File ▸ Open` now ask before discarding an
  // EDITED document, and Playwright auto-DISMISSES dialogs when nothing
  // is listening. Without a handler the confirm is declined, the command
  // returns early, and the document is silently never replaced — which
  // took publish.journey down, where the failure then read as a renderer
  // fault (0 changed pixels) rather than a New that never happened.
  //
  // Accepts ONLY the discard prompt, by message. A blanket accept-all
  // would swallow a dialog some future test did not expect, and this
  // helper is used by nearly every spec in the suite. The guard's own
  // behaviour is asserted in unsaved-work.spec.ts, which does not use
  // this path.
  page.on("dialog", (d) => {
    if (d.type() === "confirm" && d.message().includes("unsaved edits")) {
      void d.accept();
    } else {
      void d.dismiss();
    }
  });
  await page.goto("/");
  // Pull console output into the Playwright test log so render
  // panics surface in the test report instead of vanishing.
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      // eslint-disable-next-line no-console
      console.log(`[browser:${t}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log(`[browser:pageerror] ${err.message}`);
  });
  await page.waitForFunction(
    () =>
      Boolean(
        (globalThis as unknown as { __canvas?: { client: unknown } }).__canvas
          ?.client,
      ),
    null,
    { timeout: 30_000 },
  );
  if ((process.env.BACKEND ?? "").toLowerCase() === "gpu") {
    // The Vello readback path lives on the worker's SurfacePresenter,
    // which only exists after `attachCanvas`. The fidelity driver
    // bypasses the React UI (so ViewportCanvas never mounts), so we
    // attach a synthetic 1×1 OffscreenCanvas directly. The render
    // target for the PNG readback is a separate texture; the
    // attached canvas is only needed to seed the wgpu device+queue.
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              attachCanvas: (
                canvas: OffscreenCanvas,
                dpr: number,
                cssW: number,
                cssH: number,
              ) => void;
            };
          };
        }
      ).__canvas;
      const offscreen = new OffscreenCanvas(1, 1);
      c.client.attachCanvas(offscreen, 1, 1, 1);
      // Give the worker a tick to receive the transfer + run initGpu.
      await new Promise<void>((r) => setTimeout(r, 500));
    });
  }
}

/**
 * Drop an IDML file into the canvas's file input. Resolves once the
 * worker has parsed + built the document and `__canvas.handle` is
 * populated. Returns the DocumentHandle data we care about.
 *
 * Pre-populates the worker's font registry with the per-pack
 * substitution map (see `loadPackFonts`) so the renderer paints with
 * the same fonts the reference PDF was exported with — without this,
 * ΔE is dominated by font-shape drift on every pack whose declared
 * fonts aren't Inter.
 */
export async function loadIdml(
  page: Page,
  idmlPath: string,
  packName?: string,
): Promise<LoadedDocument> {
  if (packName) {
    await preloadPackFonts(page, packName);
  }
  // Fetch bytes via Vite's `/@fs/` route inside the browser context
  // instead of pushing them across the page.evaluate boundary. Some
  // envato packs reach 100–218 MB; serialising those as base64
  // strings exceeds the browser tab's RPC payload budget and the
  // context closes mid-evaluate. Direct fetch keeps the bytes
  // streaming + decoded inside the browser, never touching the
  // Playwright RPC.
  const idmlUrl = vitePathFor(idmlPath);
  const fontUrl = vitePathFor(defaultFontPathFor(packName));
  const fogra39 = fogra39Path();
  const cmykUrl = fogra39 ? vitePathFor(fogra39) : null;

  // Bypass the React `onChange` path: invoking
  // `__canvas.client.loadDocument` directly lets us hand in the CMYK
  // ICC profile (the React flow doesn't accept one). The React UI
  // won't update visually for this load — fine, the test only needs
  // snapshots. After load resolves the worker's wasm side is idle,
  // so subsequent `requestSnapshot` calls run cleanly without the
  // navigator pre-fetch loop in flight.
  const data = await page.evaluate(
    async ({ idmlUrl, fontUrl, cmykUrl }) => {
      const fetchBytes = async (url: string): Promise<Uint8Array> =>
        new Uint8Array(await (await fetch(url)).arrayBuffer());
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              loadDocument: (
                bytes: Uint8Array,
                font?: Uint8Array,
                cmykIccProfile?: Uint8Array,
              ) => Promise<{
                pageCount: number;
                pageIds: string[];
                pageSizesPt: [number, number][];
              }>;
            };
          };
        }
      ).__canvas;
      const [idml, font, icc] = await Promise.all([
        fetchBytes(idmlUrl),
        fetchBytes(fontUrl),
        cmykUrl ? fetchBytes(cmykUrl) : Promise.resolve(undefined),
      ]);
      return await c.client.loadDocument(idml, font, icc);
    },
    { idmlUrl, fontUrl, cmykUrl },
  );
  // Tag the path used (file name) so the trace report references the
  // pack — the file input would otherwise carry this for us.
  void basename(idmlPath);
  return {
    pageCount: data.pageCount,
    pages: data.pageIds.map((id, i) => ({
      pageId: id,
      widthPt: data.pageSizesPt[i][0],
      heightPt: data.pageSizesPt[i][1],
    })),
  };
}

/**
 * Resolve the per-pack default font path. Falls back to the
 * `_default/fonts.sh` default font when the pack has no sidecar.
 */
function defaultFontPathFor(packName: string | undefined): string {
  if (!packName) return loadPackFonts("_default").defaultFontPath;
  return loadPackFonts(packName).defaultFontPath;
}

/**
 * Read the pack's fonts.sh sidecar, fetch each declared font, and
 * register it with the worker. Also seeds Inter.ttf as the worker's
 * default font (mirroring the dev-shell behaviour). Idempotent across
 * packs because we `clearFontRegistry` first.
 */
async function preloadPackFonts(page: Page, packName: string): Promise<void> {
  const pack = loadPackFonts(packName);
  // Fetch each TTF via /@fs/ — same rationale as loadIdml above.
  const entries = pack.mappings.map((m) => ({
    family: m.family,
    style: m.style,
    url: vitePathFor(m.ttfPath),
  }));
  await page.evaluate(
    async ({ entries }) => {
      const fetchBytes = async (url: string): Promise<Uint8Array> =>
        new Uint8Array(await (await fetch(url)).arrayBuffer());
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              clearFontRegistry: () => Promise<void>;
              registerFont: (
                family: string,
                bytes: Uint8Array,
                style?: string | null,
              ) => Promise<void>;
            };
          };
        }
      ).__canvas;
      await c.client.clearFontRegistry();
      for (const e of entries) {
        const bytes = await fetchBytes(e.url);
        await c.client.registerFont(e.family, bytes, e.style);
      }
    },
    { entries },
  );
}

/**
 * Register a named set of fonts with the worker, for specs that load a
 * fixture outside the pack lanes.
 *
 * A spec that skips this does not render without fonts — it renders with
 * the engine's catch-all default standing in for whatever the document
 * asked for. That used to be invisible. Since protocol 62 the resolver
 * reports a substitution (`resolve_font_traced`), the PDF pipeline
 * promotes it to a `font_substituted` PreflightFinding, and a fixture
 * whose fonts were never registered no longer looks clean — correctly,
 * because it never was. Specs that mean to assert the CLEAN path have to
 * supply the faces the fixture declares.
 *
 * Fetched through `/@fs/` for the same reason `loadIdml` does: the bytes
 * have to reach the worker from the dev server, not from Node.
 */
export async function preloadFonts(
  page: Page,
  fonts: { family: string; style?: string | null; ttfPath: string }[],
): Promise<void> {
  const entries = fonts.map((f) => ({
    family: f.family,
    style: f.style ?? null,
    url: vitePathFor(f.ttfPath),
  }));
  await page.evaluate(
    async ({ entries }) => {
      const fetchBytes = async (url: string): Promise<Uint8Array> =>
        new Uint8Array(await (await fetch(url)).arrayBuffer());
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              registerFont: (
                family: string,
                bytes: Uint8Array,
                style?: string | null,
              ) => Promise<void>;
            };
          };
        }
      ).__canvas;
      for (const e of entries) {
        await c.client.registerFont(e.family, await fetchBytes(e.url), e.style);
      }
    },
    { entries },
  );
}

/**
 * Request a CPU-snapshot PNG of a single page. `dpi` is passed
 * directly to the worker (winning over `target_width_px`) so the
 * resulting PNG matches `pdftoppm -r <dpi>` output dimension-for-
 * dimension — sub-pixel drift in the back-computed DPI was otherwise
 * shifting every glyph one pixel and dominating ΔE.
 *
 * When `BACKEND=gpu` is set in the env, routes through the Vello GPU
 * readback path (sub-phase D) instead. Requires a headed Chromium
 * with `--enable-unsafe-webgpu` — the GPU init returns null in
 * headless mode and we fall back to the snapshot tier.
 */
export async function snapshotPagePng(
  page: Page,
  pageId: string,
  targetWidthPx: number,
  dpi: number = FIDELITY_DPI,
): Promise<Uint8Array> {
  // PNGs come back as base64 strings, not `number[]`. A 200 KB PNG
  // as a JS number array is ~200K boxed Number objects (~6–8 MB
  // heap) and the page.evaluate serialisation cost scales with that.
  // Base64 keeps the encoded size at ~1.33× the binary — small
  // enough that 61 packs × 10–15 pages no longer saturate the
  // worker's default Node heap.
  const backend = (process.env.BACKEND ?? "cpu").toLowerCase();
  if (backend === "gpu") {
    const b64 = await page.evaluate(
      async ({ pageId, dpi }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                requestVelloPng: (
                  pageId: string,
                  dpi: number,
                ) => Promise<Uint8Array | null>;
              };
            };
          }
        ).__canvas;
        const bytes = await c.client.requestVelloPng(pageId, dpi);
        if (!bytes) return null;
        // btoa needs a binary string; do it in 32 KB chunks so the
        // String.fromCharCode call stays under the argument-count cap.
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode.apply(
            null,
            bytes.subarray(i, i + CHUNK) as unknown as number[],
          );
        }
        return btoa(bin);
      },
      { pageId, dpi },
    );
    if (b64) return Buffer.from(b64, "base64");
    // Fall through to CPU path when GPU returns null (e.g. headless).
  }
  const b64 = await page.evaluate(
    async ({ pageId, targetWidthPx, dpi }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              requestSnapshot: (
                pageId: string,
                targetWidthPx: number,
                dpi?: number,
              ) => Promise<{ pngBytes: number[] }>;
            };
          };
        }
      ).__canvas;
      const snap = await c.client.requestSnapshot(pageId, targetWidthPx, dpi);
      // `pngBytes` is still a `number[]` on the wire (the wasm/JSON
      // channel hasn't been changed); convert to base64 in the
      // browser context before crossing the page.evaluate boundary.
      const arr = snap.pngBytes;
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < arr.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, arr.slice(i, i + CHUNK));
      }
      return btoa(bin);
    },
    { pageId, targetWidthPx, dpi },
  );
  return Buffer.from(b64, "base64");
}

/**
 * Cockpit — open a registered panel as the active right-dock tab
 * (the panel-rail / Window-menu path). Replaces the dockview-era
 * idiom of clicking the always-mounted tab by title text: the
 * cockpit only mounts a panel when something opens it.
 */
export async function openPanel(page: Page, panelId: string): Promise<void> {
  await page.waitForFunction(
    () =>
      Boolean(
        (globalThis as unknown as { __canvas?: { openPanel?: unknown } })
          .__canvas?.openPanel,
      ),
    null,
    { timeout: 10_000 },
  );
  await page.evaluate((id) => {
    (
      globalThis as unknown as {
        __canvas: { openPanel: (id: string) => void };
      }
    ).__canvas.openPanel(id);
  }, panelId);
}

/**
 * Fit page 1 and wait until the camera has actually stopped there.
 *
 * `Home` LOOKS like a deterministic "fit page 1" primitive and twenty
 * spec files treat it as one. It is conditional twice over, and both
 * conditions produce a green-then-flaky test rather than an honest
 * failure:
 *
 *   1. `useKeyboardShortcuts` DROPS every page-navigation key while the
 *      canvas is unmeasured (`vw < 10 || vh < 10`). Press Home before
 *      the viewport has laid out and nothing happens at all — no error,
 *      no camera change, and whatever the test does next runs against
 *      an arbitrary camera.
 *   2. It NO-OPS when the target page is already current
 *      (`target === currentIdx`). So "press Home and wait for the camera
 *      to change" hangs forever in exactly the case where the camera is
 *      already right.
 *
 * And a third, found the hard way on 2026-08-23: the fit ANIMATES.
 * A test that reads the camera, then clicks, gets a camera from one
 * animation frame and a pointer landing on another — which showed up as
 * a placement several points from its click, by a different amount every
 * run.
 *
 * So this asserts the END STATE rather than the transition: wait for a
 * measured viewport, press Home, then wait for two identical camera
 * reads. All three conditions fall out of that — an unmeasured viewport
 * is waited for rather than raced, a no-op is already settled and
 * returns immediately, and the animation is allowed to finish.
 */
export async function fitFirstPage(page: Page): Promise<void> {
  const readCamera = () =>
    page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas?: {
              client?: {
                camera?: {
                  read: () => { scale: number; tx: number; ty: number };
                };
              };
            };
          }
        ).__canvas?.client?.camera?.read() ?? null,
    );

  // 1. A MEASURED viewport, or the keypress is dropped on the floor.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.querySelector("[data-paged-viewport]");
          if (!el) return 0;
          const r = el.getBoundingClientRect();
          return Math.min(r.width, r.height);
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(10);

  await page.keyboard.press("Home");

  // 2 + 3. Settled: two identical reads. A no-op is already settled, so
  // this returns immediately rather than waiting for a change that is
  // never coming.
  await expect
    .poll(
      async () => {
        const first = await readCamera();
        await page.waitForTimeout(120);
        const second = await readCamera();
        if (!first || !second) return false;
        return (
          first.scale === second.scale &&
          first.tx === second.tx &&
          first.ty === second.ty &&
          first.scale > 0
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}
