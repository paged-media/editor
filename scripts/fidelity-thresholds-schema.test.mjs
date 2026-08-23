#!/usr/bin/env node
// Schema sanity check for corpus/config/canvas-fidelity-thresholds.json.
//
// The fidelity gate (apps/canvas/tests/fidelity.spec.ts) trusts this file
// blind: a missing field or a junk value silently weakens or breaks the gate
// rather than failing loudly. This cheap structural check asserts every entry
// is well-formed BEFORE a run depends on it. Pairs with BAKE_GOVERNANCE.md.
//
// Run: `node scripts/fidelity-thresholds-schema.test.mjs`
//   (wired as the root `test:thresholds` npm script.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// repo root → corpus is a symlink to ~/paged/corpus.
const THRESHOLDS_PATH = resolve(
  here,
  "..",
  "corpus",
  "config",
  "canvas-fidelity-thresholds.json",
);
const MANIFEST_PATH = resolve(here, "..", "corpus", "config", "manifest.json");

// Both inputs live in the SEPARATE paged-media/corpus repo (locally a
// `corpus` symlink → ~/paged/corpus). The corpus-free CI jobs (the static
// `checks` job; the playwright job's sparse checkout only pulls
// `config/overrides`) don't carry these JSONs, so skip gracefully when
// they're absent rather than ENOENT-failing — the guard still runs in
// full locally and anywhere corpus is present. Same skip-when-absent
// contract as core's corpus/generated/diff.sh.
if (!existsSync(THRESHOLDS_PATH) || !existsSync(MANIFEST_PATH)) {
  // eslint-disable-next-line no-console
  console.log(
    "[thresholds] corpus/config thresholds + manifest absent — skipping " +
      "schema guard (corpus repo not checked out in this environment)",
  );
  process.exit(0);
}

const raw = JSON.parse(readFileSync(THRESHOLDS_PATH, "utf8"));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const manifestNames = new Set(manifest.packs.map((p) => p.name));
const gatedNames = new Set(
  manifest.packs.filter((p) => p.stage === "gated").map((p) => p.name),
);

test("top-level shape: { fixtures: [...] }", () => {
  assert.ok(raw && typeof raw === "object", "root must be an object");
  assert.ok(Array.isArray(raw.fixtures), "fixtures must be an array");
  assert.ok(raw.fixtures.length > 0, "fixtures must be non-empty");
});

test("every entry has the required fields with sane types/values", () => {
  const seen = new Set();
  for (const f of raw.fixtures) {
    const where = `fixture "${f && f.name}"`;
    assert.equal(typeof f.name, "string", `${where}: name must be a string`);
    assert.ok(f.name.length > 0, `${where}: name must be non-empty`);
    assert.ok(!seen.has(f.name), `${where}: duplicate name`);
    seen.add(f.name);

    for (const k of ["max_mean_de", "max_p99_de", "min_ssim"]) {
      assert.equal(typeof f[k], "number", `${where}: ${k} must be a number`);
      assert.ok(Number.isFinite(f[k]), `${where}: ${k} must be finite`);
      assert.ok(f[k] >= 0, `${where}: ${k} must be >= 0`);
    }
    // ΔE budgets are positive; a 0 threshold can never pass and signals a
    // bad bake. SSIM is in [0,1].
    assert.ok(f.max_mean_de > 0, `${where}: max_mean_de must be > 0`);
    assert.ok(f.max_p99_de > 0, `${where}: max_p99_de must be > 0`);
    assert.ok(
      f.min_ssim >= 0 && f.min_ssim <= 1,
      `${where}: min_ssim must be in [0,1]`,
    );
    assert.ok(f.max_p99_de >= f.max_mean_de, `${where}: p99 must be >= mean`);

    assert.equal(
      typeof f.rationale,
      "string",
      `${where}: rationale must be a string`,
    );
    assert.ok(
      f.rationale.trim().length >= 20,
      `${where}: rationale must be a real sentence, not a stub`,
    );

    // backend provenance (audit 1.10): which rasterizer the thresholds
    // were baked against. OPTIONAL — the gate does not (yet) branch on
    // it; promote-gpu is a separately scheduled decision. When present
    // it must name a real backend, so a future GPU bake can't land as a
    // typo'd free-text field.
    if (f.backend !== undefined) {
      assert.ok(
        f.backend === "cpu" || f.backend === "gpu",
        `${where}: backend must be "cpu" or "gpu" when present`,
      );
    }

    // gated-page count must be a positive integer when present.
    if (f.max_pages_with_pdf !== undefined) {
      assert.ok(
        Number.isInteger(f.max_pages_with_pdf) && f.max_pages_with_pdf > 0,
        `${where}: max_pages_with_pdf must be a positive integer`,
      );
    }

    // names must exist in the manifest (no orphan thresholds).
    assert.ok(
      manifestNames.has(f.name),
      `${where}: not present in manifest.json`,
    );
  }
});

test("every gated pack has a threshold entry (the gate would silently skip it otherwise)", () => {
  const haveThreshold = new Set(raw.fixtures.map((f) => f.name));
  for (const name of gatedNames) {
    assert.ok(
      haveThreshold.has(name),
      `gated pack "${name}" has no threshold entry`,
    );
  }
});
