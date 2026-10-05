#!/usr/bin/env node
// Unit test for the page's network wall (D-03, ADR 218):
// apps/canvas/src/boot/network-policy.ts — origin parsing, the connect-src it
// builds, the `_headers` rewrite — plus the lock-step between the committed
// `public/_headers` floor and the module. Pure module, node's test runner,
// loaded with `--experimental-strip-types` like the cross-origin-isolation
// check.
//
// Run: `node --experimental-strip-types scripts/network-policy.test.mjs`
//   (root script `pnpm test:network-policy`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = resolve(here, "..", "apps", "canvas");
const {
  CONNECT_SRC_FLOOR,
  connectSrc,
  parseDataOrigins,
  rewriteHeadersCsp,
  wallAdmits,
} = await import(resolve(canvas, "src", "boot", "network-policy.ts"));

test("no configured origins: the floor, exactly", () => {
  assert.deepEqual(parseDataOrigins(undefined), []);
  assert.deepEqual(parseDataOrigins("  "), []);
  assert.equal(connectSrc([]), "connect-src 'self' blob: data:");
  assert.equal(connectSrc([]), CONNECT_SRC_FLOOR);
});

test("exact https origins are admitted, deduplicated, in order", () => {
  const o = parseDataOrigins("https://data.example.com, https://api.example.org:8443 https://data.example.com/");
  assert.deepEqual(o, ["https://data.example.com", "https://api.example.org:8443"]);
  assert.equal(
    connectSrc(o),
    "connect-src 'self' blob: data: https://data.example.com https://api.example.org:8443",
  );
  // Local development may list a loopback http origin.
  assert.deepEqual(parseDataOrigins("http://127.0.0.1:8765"), ["http://127.0.0.1:8765"]);
});

test("anything wider than an exact origin fails the build", () => {
  for (const bad of [
    "https:",
    "*",
    "https://*.example.com",
    "http://data.example.com",
    "https://data.example.com/path",
    "https://data.example.com/?q=1",
    "https://user:pw@data.example.com",
    "data.example.com",
    "ws://data.example.com",
  ]) {
    assert.throws(() => parseDataOrigins(bad), /PAGED_DATA_ORIGINS/, bad);
  }
});

test("the _headers rewrite replaces the policy line and refuses a file without one", () => {
  const before = "/*\n  X-Other: 1\n  Content-Security-Policy: connect-src 'self' blob: data:\n";
  const after = rewriteHeadersCsp(before, connectSrc(["https://data.example.com"]));
  assert.equal(
    after,
    "/*\n  X-Other: 1\n  Content-Security-Policy: connect-src 'self' blob: data: https://data.example.com\n",
  );
  assert.throws(() => rewriteHeadersCsp("/*\n  X-Other: 1\n", CONNECT_SRC_FLOOR), /no Content-Security-Policy/);
});

test("wallAdmits: self and listed origins only", () => {
  assert.equal(wallAdmits("https://a.test", [], "https://editor.test"), false);
  assert.equal(wallAdmits("https://editor.test", [], "https://editor.test"), true);
  assert.equal(wallAdmits("https://a.test", ["https://a.test"]), true);
});

test("lock-step: the committed public/_headers ships the floor; vite builds from the module", () => {
  const headers = readFileSync(resolve(canvas, "public", "_headers"), "utf8");
  const line = headers.split("\n").find((l) => /^\s*Content-Security-Policy:/.test(l));
  assert.ok(line, "public/_headers must carry a Content-Security-Policy line");
  assert.equal(line.replace(/^\s*Content-Security-Policy:\s*/, ""), CONNECT_SRC_FLOOR);
  const vite = readFileSync(resolve(canvas, "vite.config.ts"), "utf8");
  assert.match(vite, /parseDataOrigins\(process\.env\[DATA_ORIGINS_ENV\]\)/);
  assert.doesNotMatch(vite, /connect-src 'self' blob: data: https:/);
});
