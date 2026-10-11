#!/usr/bin/env node
// Unit test for the module door's editor half (ADR 223):
// apps/canvas/src/plugin-modules.ts — what the editor answers a bundle that
// asks `host.modules` for one of its declared wasm artifacts — and
// apps/canvas/scripts/module-index.mjs — the module manifest the build
// generates from the installed @paged-media packages (the same index
// modules-sync.mjs hosts modules by, ADR 220).
//
// Run: `node --experimental-strip-types scripts/modules.test.mjs`
//   (root script `pnpm test:modules`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = resolve(here, "..", "apps", "canvas");
const { createEditorModulesBackend } = await import(resolve(canvas, "src", "plugin-modules.ts"));
const { buildModuleManifest } = await import(resolve(canvas, "scripts", "module-index.mjs"));

const SRI = "sha384-" + "A".repeat(64);
const manifest = (host) => ({
  host,
  packages: {
    "@paged-media/data": {
      version: "0.1.0-canary.14",
      files: {
        "bin/duckdb-engine.wasm": { integrity: SRI, version: "0.1.0-canary.14", fs: "/repo/node_modules/.pnpm/x/bin/duckdb-engine.wasm" },
        "bin/data_js_bg.wasm": { integrity: SRI, version: "0.1.0-canary.14" },
      },
    },
  },
  plugins: { "media.paged.data": { package: "@paged-media/data", base: "" } },
});
const duck = { name: "duckdb-engine", path: "bin/duckdb-engine.wasm" };

test("a hosted build answers the module host, with integrity", () => {
  const b = createEditorModulesBackend(manifest("https://modules.paged.media/"), "https://playground.example");
  assert.deepEqual(b.url("media.paged.data", duck), {
    url: "https://modules.paged.media/@paged-media/data/0.1.0-canary.14/bin/duckdb-engine.wasm",
    integrity: SRI,
  });
});

test("dev answers the installed file under /@fs/; a plain build answers null", () => {
  const dev = createEditorModulesBackend(manifest(null), "http://127.0.0.1:5180");
  assert.deepEqual(dev.url("media.paged.data", duck), {
    url: "http://127.0.0.1:5180/@fs/repo/node_modules/.pnpm/x/bin/duckdb-engine.wasm",
    integrity: SRI,
  });
  // No fs path (a production build that is not hosted): the bundle's own copy.
  assert.equal(dev.url("media.paged.data", { name: "data-engine", path: "bin/data_js_bg.wasm" }), null);
});

test("only declared, listed artifacts of known plugins are answered", () => {
  const b = createEditorModulesBackend(manifest("https://modules.paged.media"), "https://x.example");
  assert.equal(b.url("media.paged.other", duck), null);
  assert.equal(b.url("media.paged.data", { name: "x", path: "bin/other.wasm" }), null);
  assert.equal(b.url("media.paged.data", { name: "x", path: "../../etc/x.wasm" }), null);
  // a path that normalises onto a listed file is the same file
  assert.equal(
    b.url("media.paged.data", { name: "x", path: "./bin/../bin/duckdb-engine.wasm" })?.url,
    "https://modules.paged.media/@paged-media/data/0.1.0-canary.14/bin/duckdb-engine.wasm",
  );
});

test("the build manifest lists each plugin's declared wasm with sha384 and host version", () => {
  const app = mkdtempSync(join(tmpdir(), "paged-modules-app-"));
  const wasm = Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  const sri384 = "sha384-" + createHash("sha384").update(wasm).digest("base64");
  const pkg = (dir, name, version, manifestJson) => {
    mkdirSync(join(dir, "bin"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }));
    writeFileSync(join(dir, "bin", "engine.wasm"), wasm);
    if (manifestJson) writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifestJson));
  };
  const scope = join(app, "node_modules", "@paged-media");
  mkdirSync(scope, { recursive: true });
  // published: the real dir is inside the pnpm store
  const store = join(app, "node_modules", ".pnpm", "@paged-media+x@1.0.0", "node_modules", "@paged-media", "x");
  pkg(store, "@paged-media/x", "1.0.0", {
    id: "media.paged.x",
    capabilities: {
      wasm: [
        { name: "engine", path: "bin/engine.wasm", purpose: "compute" },
        { name: "absent", path: "bin/absent.wasm", purpose: "compute" },
      ],
    },
  });
  symlinkSync(store, join(scope, "x"));
  // linked from a source checkout: the version carries the content hash
  const linked = join(app, "checkout", "y");
  pkg(linked, "@paged-media/y", "0.1.0", {
    id: "media.paged.y",
    capabilities: { wasm: [{ name: "engine", path: "bin/engine.wasm", purpose: "compute" }] },
  });
  symlinkSync(linked, join(scope, "y"));
  // not a plugin: no manifest
  pkg(join(scope, "z"), "@paged-media/z", "2.0.0");

  const m = buildModuleManifest({ app, host: "https://modules.paged.media" });
  assert.equal(m.host, "https://modules.paged.media");
  assert.deepEqual(Object.keys(m.plugins).sort(), ["media.paged.x", "media.paged.y"]);
  assert.deepEqual(m.plugins["media.paged.x"], { package: "@paged-media/x", base: "" });
  assert.deepEqual(m.packages["@paged-media/x"], {
    version: "1.0.0",
    files: { "bin/engine.wasm": { integrity: sri384, version: "1.0.0" } },
  });
  const y = m.packages["@paged-media/y"].files["bin/engine.wasm"];
  assert.equal(y.version, "0.1.0+" + createHash("sha256").update(wasm).digest("hex").slice(0, 12));
  assert.equal(m.packages["@paged-media/z"], undefined);
  // dev adds the absolute path the dev server serves under /@fs/
  const dev = buildModuleManifest({ app, dev: true });
  assert.equal(dev.host, null);
  assert.match(dev.packages["@paged-media/x"].files["bin/engine.wasm"].fs, /\/bin\/engine\.wasm$/);
});
