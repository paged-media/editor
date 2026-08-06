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

import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Reuse an already-running Vite dev server when one is up (faster
// iteration locally); otherwise spawn one. The wasm bundle is built
// out-of-band via `npm run wasm` — Playwright does not rebuild it.
const PORT = Number(process.env.IDML_CANVAS_TEST_PORT ?? 5180);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Default Node heap (~2 GB) trips on a 61-pack sweep — the
// page.evaluate boundary briefly holds a copy of each IDML +
// PNG-per-page. Bump unless the caller already set NODE_OPTIONS.
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = "--max-old-space-size=8192";
}

// Lean CI surface (tests.yml): the published-wasm CI runs the behaviour
// surface without the Envato fidelity gate, which needs the 4.4 GB
// `corpus/envato` LFS packs + their InDesign reference PDFs + the
// `paged-diff` Rust binary (built from a `core` checkout) + poppler's
// `pdftoppm` — none of which the package-boundary runner has. Those two
// specs read `corpus/envato/manifest.json` at import time, so set
// `PAGED_CI_LEAN=1` to drop them from collection entirely rather than
// let the import throw. Local runs (no flag) keep the full surface.
const LEAN_CI = process.env.PAGED_CI_LEAN === "1";

// Specs that load a real `corpus/envato/packs/<pack>/template.idml` at
// import/beforeAll time — the same 4.4 GB tier the lean runner omits, so
// they hard-fail with "Could not find EOCD" before their own skip guards
// run. They MUST be dropped from the lean collection, exactly like the two
// fidelity specs above. COVERAGE NOTE (not a silent cap): these gesture
// specs do NOT run in lean CI — they run only in a full-corpus lane
// (local / the envato tier). Migrating them onto the license-clear
// `corpus/generated` fixtures would return them to lean CI; tracked as a
// follow-up, not done here.
const ENVATO_LEAN_DROP = [
  "content-grabber.spec.ts",
  "cross-spread-duplicate.spec.ts",
  "gesture-sab-snap.spec.ts",
  "interaction.spec.ts",
  "layers.spec.ts",
  "layers-panel.spec.ts",
  "multi-select-handles.spec.ts",
  "multi-select-snap.spec.ts",
  "resize.spec.ts",
  "rotate-scale.spec.ts",
  "ruler-guides.spec.ts",
  "translate.spec.ts",
];

const LEAN_DROP = LEAN_CI
  ? ["fidelity.spec.ts", "e2e/extensive-corpus.spec.ts", ...ENVATO_LEAN_DROP]
  : [];

export default defineConfig({
  testDir: "./tests",
  testIgnore: LEAN_DROP,
  // Single worker keeps the snapshot tier deterministic (worker pool
  // contention can race the layout cache across packs). Re-enable
  // parallelism once we've confirmed perf isn't bottlenecked by it.
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  timeout: 5 * 60_000,
  expect: {
    timeout: 30_000,
    // Journey visual baselines. A real regression moves far more than
    // 1% of pixels; the tolerance absorbs last-pixel AA noise without
    // hiding one. Caret/HUD animations are frozen for chrome shots.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
    toMatchSnapshot: { maxDiffPixelRatio: 0.01 },
  },
  // The GPU/Vello path occasionally trips a wasm-bindgen "recursive
  // use of an object" race when the prior test's worker hasn't
  // finished tearing down before this one's initGpu fires. The
  // single-test runs always pass; one retry is enough to absorb the
  // flake without masking real regressions (a real bug repeats).
  retries: 1,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1600, height: 1000 },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: __dirname,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      // The journey tier is its own project (below); keep it out of the
      // behaviour-surface suite so each runs once.
      testIgnore: [...LEAN_DROP, "journey/**"],
      use: {
        ...devices["Desktop Chrome"],
        // WebGPU lights up when BACKEND=gpu — but headless Chromium
        // doesn't ship a WebGPU adapter, so we force headed mode in
        // that case. On Linux the Vulkan flags are needed; on macOS
        // Metal works by default.
        headless: (process.env.BACKEND ?? "").toLowerCase() !== "gpu",
        launchOptions:
          (process.env.BACKEND ?? "").toLowerCase() === "gpu"
            ? {
                args: [
                  "--enable-unsafe-webgpu",
                  "--use-vulkan",
                  "--enable-features=Vulkan",
                ],
              }
            : {},
      },
    },
    {
      // GPU-backend tier — proves the WebGPU/Vello render path actually
      // engages (not the CPU fallback). Playwright's BUNDLED Chromium ships
      // WITHOUT WebGPU, so this lane uses the REAL Chrome (`channel: "chrome"`)
      // in the new headless mode (`--headless=new`), which DOES expose a
      // WebGPU adapter on a secure context (the dev server is localhost).
      // `--enable-unsafe-webgpu` opts in regardless of the blocklist; macOS
      // resolves WebGPU over Metal natively. Linux CI will need
      // `--enable-features=Vulkan` + a lavapipe ICD (follow-up).
      name: "journeys-gpu",
      testDir: "./tests/journey",
      // The FULL DTP journey surface on the editor's real default backend
      // (WebGPU/Vello) — proving every workflow runs on GPU, not just the CPU
      // fallback the bundled-Chromium `journeys` lane exercises.
      //
      // LOCAL LANE, GATING NOTHING — say so plainly, because the specs that
      // defer to it used to read as though it were a CI gate. It needs real
      // Chrome (`channel: "chrome"`) and `--use-angle=metal`, so it cannot
      // run on the Linux CI runners, and no workflow invokes it. Anything
      // that skips with "verified on journeys-gpu" is therefore verified
      // only when a human runs it on a Mac:
      //
      //     pnpm --filter paged-canvas test:journeys:gpu
      //
      // Keep it — it works, and it is the only place paged.image's GPU-only
      // kernels are render-verified end-to-end — but do not treat a green
      // `journeys` run as covering anything that defers here. Standing up a
      // GPU-capable CI lane (scheduled macOS runner, or Linux + a software
      // adapter) is the open follow-up.
      testMatch: "**/*.journey.spec.ts",
      snapshotPathTemplate:
        "{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        deviceScaleFactor: 1,
        // `--headless=new` (the new headless that ships GPU) is requested as
        // an arg; `headless:false` keeps Playwright from forcing old headless.
        headless: false,
        launchOptions: {
          args: [
            "--headless=new",
            "--enable-unsafe-webgpu",
            "--use-angle=metal",
          ],
        },
      },
    },
    {
      // The "user-journey" tier — real-user DTP workflows that assert
      // context-sensitivity (the intent→context contract) + visual
      // baselines. Separate project so it shards/gates independently.
      // `{projectName}-{platform}` in the snapshot path lets per-OS and
      // CPU-vs-GPU baselines coexist (CI commits Linux; macOS local gets
      // its own suffix).
      name: "journeys",
      testDir: "./tests/journey",
      testMatch: "**/*.journey.spec.ts",
      // The GPU-backend journey needs the real-Chrome WebGPU lane
      // (journeys-gpu); under the bundled Chromium here it would always
      // fall back to CPU. Keep it out of the default journey suite.
      testIgnore: "**/gpu-backend.journey.spec.ts",
      snapshotPathTemplate:
        "{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        headless: (process.env.BACKEND ?? "").toLowerCase() !== "gpu",
        launchOptions:
          (process.env.BACKEND ?? "").toLowerCase() === "gpu"
            ? {
                args: [
                  "--enable-unsafe-webgpu",
                  "--use-vulkan",
                  "--enable-features=Vulkan",
                ],
              }
            : {},
      },
    },
    {
      // Demo capture — records the showcase flows as rrweb sessions (with the
      // WebGPU document frames bridged in) for the docs live demos. Real Chrome
      // + new headless for a true WebGPU render, same as journeys-gpu, so the
      // captured frames look like the real product. Run via:
      //   npx playwright test --project=demo-capture
      // Writes tests/demo/out/<id>.rrweb.json; CI uploads them as release assets.
      name: "demo-capture",
      testDir: "./tests/demo",
      testMatch: "**/capture.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        deviceScaleFactor: 1,
        headless: false,
        launchOptions: {
          args: [
            "--headless=new",
            "--enable-unsafe-webgpu",
            "--use-angle=metal",
          ],
        },
      },
    },
  ],
  metadata: {
    repoRoot: REPO_ROOT,
  },
});
