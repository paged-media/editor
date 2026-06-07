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

export default defineConfig({
  testDir: "./tests",
  testIgnore: LEAN_CI ? ["fidelity.spec.ts", "e2e/extensive-corpus.spec.ts"] : [],
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
  ],
  metadata: {
    repoRoot: REPO_ROOT,
  },
});
