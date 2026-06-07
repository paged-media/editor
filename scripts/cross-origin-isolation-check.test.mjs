#!/usr/bin/env node
// Unit test for the boot-time cross-origin-isolation check (W0.17).
//
// The check module is pure (env injected), so it tests without a browser via
// node's built-in test runner. We import the SOURCE .ts through a tiny inline
// transpile (strip types) — but simpler and dependency-free: we re-implement
// nothing and instead drive the module's pure exports by loading it with the
// TS-aware loader node 24 ships (`--experimental-strip-types`). The npm script
// runs this with that flag.
//
// Run: `node --experimental-strip-types scripts/cross-origin-isolation-check.test.mjs`
//   (wired as `pnpm --filter paged-canvas test:boot` below isn't added to avoid
//    colliding with the sibling's Playwright ownership; invoke directly in CI.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const modPath = resolve(
  here,
  "..",
  "apps",
  "canvas",
  "src",
  "boot",
  "cross-origin-isolation-check.ts",
);

const { inspectCrossOriginIsolation, assertCrossOriginIsolated } = await import(
  modPath
);

test("inspect: reports isolated when crossOriginIsolated is true", () => {
  const r = inspectCrossOriginIsolation({
    crossOriginIsolated: true,
    hasSharedArrayBuffer: true,
    isProd: true,
  });
  assert.equal(r.isolated, true);
  assert.equal(r.hasSharedArrayBuffer, true);
  assert.equal(r.isProd, true);
});

test("inspect: reports NOT isolated when crossOriginIsolated is false", () => {
  const r = inspectCrossOriginIsolation({
    crossOriginIsolated: false,
    hasSharedArrayBuffer: false,
    isProd: true,
  });
  assert.equal(r.isolated, false);
});

test("assert: stays silent when isolated", () => {
  let warned = false;
  assertCrossOriginIsolated({
    env: { crossOriginIsolated: true, isProd: true },
    onWarn: () => {
      warned = true;
    },
  });
  assert.equal(warned, false, "must not warn when cross-origin isolated");
});

test("assert: warns loudly in prod when NOT isolated", () => {
  let message = "";
  let reportSeen = null;
  assertCrossOriginIsolated({
    env: { crossOriginIsolated: false, hasSharedArrayBuffer: false, isProd: true },
    onWarn: (msg, report) => {
      message = msg;
      reportSeen = report;
    },
  });
  assert.match(message, /CROSS-ORIGIN ISOLATION MISSING/);
  assert.match(message, /Cross-Origin-Embedder-Policy: require-corp/);
  assert.ok(reportSeen && reportSeen.isolated === false);
});

test("assert: warns in dev too (softer) when NOT isolated", () => {
  let warned = false;
  assertCrossOriginIsolated({
    env: { crossOriginIsolated: false, isProd: false },
    onWarn: () => {
      warned = true;
    },
  });
  assert.equal(warned, true, "dev should still warn if a proxy stripped headers");
});
