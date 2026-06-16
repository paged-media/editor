// E2E op suite — the EXTENSIVE corpus mode. The opt-in pass that runs
// the document-parameterized op pass (docOpPass) over the whole
// corpus/envato/packs corpus of real InDesign documents, producing
// per-pack insight on which operations land — and which break — on
// real-world structures.
//
// Opt-in via env (regular runs stay fast — this registers ZERO tests
// when unset):
//   E2E_PACKS=all              every non-skip pack from the manifest
//   E2E_PACKS=name,name        a targeted subset (same idiom as
//                              FIDELITY_PACKS)
//   E2E_MODE=gate              flip per-pack ERROR results to hard
//                              assertions (default: advisory — collect
//                              everything, never fail a pack)
//
// Output (the deliverable): /tmp/paged-e2e-extensive/report.json plus
// report.md — a per-pack × per-op status table. One pack loaded at a
// time; ~1–3 min/pack, so E2E_PACKS=all is a nightly/manual job.

import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { listPacks } from "../fidelity/fixtures";
import { docOpPass, type OpResult } from "./harness/doc-op-pass";
import { loadFixture } from "./harness/fixtures";

const PACKS_ENV = process.env.E2E_PACKS?.trim();
const GATE = process.env.E2E_MODE === "gate";
const OUT_DIR = process.env.E2E_EXTENSIVE_OUT ?? "/tmp/paged-e2e-extensive";

interface PackReport {
  pack: string;
  pages: number;
  results: OpResult[];
  loadError?: string;
}

function selectedPacks(): { name: string; idmlPath: string }[] {
  if (!PACKS_ENV) return [];
  const all = listPacks();
  if (PACKS_ENV === "all") {
    return all
      .filter((p) => p.stage !== "skip")
      .map((p) => ({ name: p.name, idmlPath: p.idmlPath }));
  }
  const wanted = new Set(PACKS_ENV.split(/[\s,]+/).filter(Boolean));
  const picked = all.filter((p) => wanted.has(p.name));
  if (picked.length === 0) {
    throw new Error(
      `E2E_PACKS=${PACKS_ENV} matched no packs; available: ${all
        .slice(0, 6)
        .map((p) => p.name)
        .join(", ")}…`,
    );
  }
  return picked.map((p) => ({ name: p.name, idmlPath: p.idmlPath }));
}

function writeReport(reports: PackReport[]): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(reports, null, 2));

  // Aggregate op-status counts across packs.
  const ops = new Set<string>();
  for (const r of reports) for (const x of r.results) ops.add(x.op);
  const opList = [...ops].sort();
  const tally: Record<string, Record<string, number>> = {};
  for (const op of opList)
    tally[op] = { pass: 0, "render-stale": 0, error: 0, skip: 0 };
  for (const r of reports)
    for (const x of r.results) tally[x.op][x.status] += 1;

  const lines: string[] = [];
  lines.push(`# E2E extensive corpus — op pass insight`);
  lines.push("");
  lines.push(
    `Packs: ${reports.length}  ·  mode: ${GATE ? "gate" : "advisory"}`,
  );
  lines.push("");
  lines.push(`## Per-operation totals`);
  lines.push("");
  lines.push(`| op | pass | render-stale | error | skip |`);
  lines.push(`|---|---|---|---|---|`);
  for (const op of opList) {
    const t = tally[op];
    lines.push(
      `| ${op} | ${t.pass} | ${t["render-stale"]} | ${t.error} | ${t.skip} |`,
    );
  }
  lines.push("");
  lines.push(`## Per-pack`);
  lines.push("");
  for (const r of reports) {
    if (r.loadError) {
      lines.push(`- **${r.pack}** (${r.pages}p) — LOAD ERROR: ${r.loadError}`);
      continue;
    }
    const errs = r.results.filter((x) => x.status === "error");
    const stale = r.results.filter((x) => x.status === "render-stale");
    const pass = r.results.filter((x) => x.status === "pass").length;
    const flag = errs.length ? "❌" : stale.length ? "⚠️" : "✅";
    lines.push(
      `- ${flag} **${r.pack}** (${r.pages}p) — ${pass} pass, ${stale.length} render-stale, ${errs.length} error` +
        (errs.length
          ? `\n    errors: ${errs.map((e) => `${e.op} (${e.note})`).join("; ")}`
          : ""),
    );
  }
  writeFileSync(`${OUT_DIR}/report.md`, lines.join("\n"));
  // eslint-disable-next-line no-console
  console.log(`\n[extensive] report written to ${OUT_DIR}/report.{json,md}\n`);
}

const packs = selectedPacks();

if (packs.length === 0) {
  // Keep the file valid + discoverable without running anything heavy.
  test.skip("AC-E2E-EXTENSIVE — opt-in (set E2E_PACKS=all or name,name) @feat:test-corpus.capability-matrix @feat:the-renderer.snapshots @level:happy", () => {});
} else {
  test.describe("E2E extensive corpus", () => {
    const reports: PackReport[] = [];

    test.afterAll(() => {
      writeReport(reports);
    });

    for (const pack of packs) {
      test(`AC-E2E-EXTENSIVE-${pack.name} — op pass`, async ({ page }) => {
        test.setTimeout(300_000);
        await openCanvas(page);
        let report: PackReport;
        try {
          const fx = await loadFixture(page, {
            label: pack.name,
            absPath: pack.idmlPath,
            packName: pack.name,
          });
          const results = await docOpPass(page, fx, { assert: false });
          report = { pack: pack.name, pages: fx.pageCount, results };
        } catch (err) {
          report = {
            pack: pack.name,
            pages: 0,
            results: [],
            loadError: (err instanceof Error ? err.message : String(err)).slice(
              0,
              200,
            ),
          };
        }
        reports.push(report);

        const table = report.results
          .map((r) => `  ${r.op.padEnd(34)} ${r.status}`)
          .join("\n");
        // eslint-disable-next-line no-console
        console.log(
          `\n[extensive] ${pack.name} (${report.pages}p)${report.loadError ? ` LOAD ERROR: ${report.loadError}` : ""}\n${table}\n`,
        );

        if (GATE) {
          expect(report.loadError, `${pack.name} failed to load`).toBeFalsy();
          const errors = report.results.filter((r) => r.status === "error");
          expect(
            errors,
            `${pack.name} op errors:\n${errors.map((e) => `  ${e.op}: ${e.note}`).join("\n")}`,
          ).toEqual([]);
        }
      });
    }
  });
}
