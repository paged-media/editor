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

// The chapter runner — how a document too big for one test gets built.
//
// One monolithic spec at annual scale would be a two-hour test where a
// red at minute 90 throws everything away. So the build is CHAPTERED:
// each chapter spec loads the previous chapter's `.paged` checkpoint
// through the ordinary open door, authors its own pages, saves the next
// checkpoint, and writes a ledger fragment. Playwright runs the spec
// files alphabetically in one worker (`workers: 1`), so the numeric
// filename prefixes ARE the build order, and a retried chapter rebuilds
// only itself from its input checkpoint.
//
// The reload between chapters is not overhead — it is a per-chapter
// container round-trip regression test. Two consequences, enforced by
// convention:
//
//   · NO module may hold an element id across a chapter boundary — a
//     reload can re-mint ids. Cross-chapter references go by NAME
//     (styles/swatches/layers via the throwing lookups) or by geometry
//     re-discovery (`storyOf`, hitTest).
//   · Anything that must survive has to be PERSISTED before the
//     checkpoint save: SceneLayer render state (web renders, sheet
//     grids, image sessions) is cleared by a reload, by design.
//
// `SHOWCASE_FROM=<prefix>` skips chapters below the prefix when their
// checkpoint already exists — the iteration loop for working on one
// chapter without rebuilding the world. CI never sets it.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import type { CoverageClaim } from "./coverage";
import { ShowcaseDoc } from "./driver";
import { Ledger, writeFragment, type ChapterFragment } from "./ledger";
import { ANNUAL_PAGES } from "./names-annual";
import type { SpreadSpec } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** `editor/apps/canvas` */
export const APP_ROOT = pathResolve(__dirname, "..", "..");
/** `~/paged` — the workspace of side-by-side clones. */
export const WORKSPACE = pathResolve(APP_ROOT, "..", "..", "..");
export const CORE = pathResolve(WORKSPACE, "core");
export const REGISTRY = pathResolve(WORKSPACE, "state", "registry", "features");
export const CORPUS_FONTS = pathResolve(CORE, "corpus", "fonts");
export const OUT = pathResolve(APP_ROOT, "showcase");
export const CHECKPOINTS = join(OUT, "checkpoints");
export const LEDGER_DIR = join(OUT, "ledger");

/** The base fixture the FIRST chapter loads — the annual's 134-page
 *  masters/styles/conditions/navigation battery from paged-gen. */
export const BASE_IDML = pathResolve(
  CORE,
  "corpus",
  "generated",
  "annual-base.idml",
);

/**
 * The base fixture is generated, not committed (core gitignores
 * `corpus/generated/*.idml`), so regenerate it rather than failing on a
 * fresh clone. Same script core's own CI runs.
 */
export function ensureBaseFixture(fixture: string): void {
  if (existsSync(fixture)) return;
  const script = pathResolve(CORE, "scripts", "regen-fixtures.sh");
  if (!existsSync(script)) {
    throw new Error(
      `${fixture} is missing and core is not checked out at ${CORE}. ` +
        `The showcase needs the engine repo beside the editor.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log("[showcase] generating base fixture via paged-gen…");
  execFileSync("bash", [script], { cwd: CORE, stdio: "inherit" });
  if (!existsSync(fixture)) {
    throw new Error(
      `regen-fixtures.sh ran but ${fixture} is still absent — is the ` +
        `sample registered in paged-gen's SAMPLES list?`,
    );
  }
}

export interface ChapterSpec {
  /** Numeric-prefixed id — also the spec filename stem and the build order. */
  readonly id: string;
  readonly title: string;
  readonly modules: SpreadSpec[];
  /** The chapter this one's checkpoint follows (null ⇒ loads the base fixture). */
  readonly after: string | null;
  /** Expected page count on entry (the reload assertion). */
  readonly expectPages: number;
  /**
   * Minutes this chapter may run. Default 40 (see chapterTest). A chapter
   * that exports the WHOLE book in-module — a full PDF or IDML pass over
   * 134 authored pages — buys its own budget rather than borrowing from
   * the authoring headroom.
   */
  readonly budgetMinutes?: number;
}

/**
 * The chapter set is DISCOVERED from the spec filenames, not declared
 * in a central manifest — so parallel chapter authors never contend on
 * one file, and the build order is exactly what `ls chapters/` shows.
 * `900-assemble` is the terminal spec, never a chapter.
 */
export function discoverChapterIds(): string[] {
  const dir = pathResolve(__dirname, "chapters");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".spec.ts") && !f.startsWith("900-"))
    .map((f) => f.replace(/\.spec\.ts$/, ""))
    .sort();
}

/**
 * Declare a chapter spec file: `id` must equal the filename stem; the
 * predecessor (whose checkpoint this chapter loads) is computed from
 * the discovered order.
 */
export function annualChapter(decl: {
  id: string;
  title: string;
  modules: SpreadSpec[];
  budgetMinutes?: number;
}): void {
  const ids = discoverChapterIds();
  const at = ids.indexOf(decl.id);
  if (at < 0) {
    throw new Error(
      `chapter id ${decl.id} does not match any chapters/*.spec.ts filename`,
    );
  }
  chapterTest({
    id: decl.id,
    title: decl.title,
    modules: decl.modules,
    after: at === 0 ? null : ids[at - 1],
    expectPages: ANNUAL_PAGES,
    budgetMinutes: decl.budgetMinutes,
  });
}

export function checkpointPath(chapterId: string): string {
  return join(CHECKPOINTS, `after-${chapterId}.paged`);
}

function soloCheckpointPath(chapterId: string): string {
  return join(CHECKPOINTS, `after-${chapterId}.solo.paged`);
}

function chapterInput(spec: ChapterSpec): string {
  if (isSolo(spec)) return BASE_IDML;
  return spec.after === null ? BASE_IDML : checkpointPath(spec.after);
}

/**
 * SOLO mode — `SHOWCASE_SOLO=<id>` builds ONE chapter directly on the
 * base fixture instead of its predecessor's checkpoint. Sound because
 * no two chapters share pages: a chapter's own pages are identical in
 * the base and in any checkpoint. What differs: live sections (folios
 * stay descriptive — modules must never assert folio TEXT) and other
 * chapters' content (absent). Solo outputs carry a `.solo` marker so
 * the real chain and the assembly never read them.
 */
function isSolo(spec: ChapterSpec): boolean {
  return process.env.SHOWCASE_SOLO === spec.id;
}

/** `SHOWCASE_FROM=060` ⇒ chapters with a numeric prefix below 060 skip
 *  when their own checkpoint exists (their work is already on disk). */
function shouldSkip(spec: ChapterSpec): string | null {
  const from = process.env.SHOWCASE_FROM;
  if (!from) return null;
  const prefix = spec.id.split("-")[0];
  if (prefix >= from) return null;
  if (!existsSync(checkpointPath(spec.id))) return null;
  return `SHOWCASE_FROM=${from} and after-${spec.id}.paged exists`;
}

/**
 * Run one chapter end to end: load the input checkpoint, run the
 * modules with per-module pixel assertions, save this chapter's
 * checkpoint + ledger fragment, and sample earlier pages for the
 * incremental round-trip regression.
 */
export async function runChapter(page: Page, spec: ChapterSpec): Promise<void> {
  const skip = shouldSkip(spec);
  if (skip) {
    test.skip(true, skip);
    return;
  }
  const input = chapterInput(spec);
  if (spec.after === null || isSolo(spec)) {
    ensureBaseFixture(input);
  } else if (!existsSync(input)) {
    throw new Error(
      `chapter ${spec.id} needs ${input} — run the earlier chapters first ` +
        `(the showcase project runs them in filename order).`,
    );
  }
  mkdirSync(CHECKPOINTS, { recursive: true });

  await openCanvas(page);
  const doc = new ShowcaseDoc(page);
  const ledger = new Ledger();
  doc.ledger = ledger;

  // Fonts BEFORE the document: RegisterFont seeds shaping at LOAD —
  // register after and every styled run keeps its substitute (pink
  // marker included). The fidelity tier's preloadPackFonts learned
  // this first; the annual re-learned it from a cover set in the
  // fallback face.
  await doc.registerFonts(CORPUS_FONTS);
  const pageCount = await doc.load(input);
  expect(
    pageCount,
    `chapter ${spec.id} expected to open a ${spec.expectPages}-page document`,
  ).toBe(spec.expectPages);

  const gpu = await doc.gpuActive();
  const gpuReason = gpu ? "" : await doc.gpuReason();
  // eslint-disable-next-line no-console
  console.log(
    `[${spec.id}] WebGPU: ${gpu ? "active" : `NOT ACTIVE — ${gpuReason}`}`,
  );

  const claims: CoverageClaim[] = [];
  const notes: string[] = [];

  for (const spread of spec.modules) {
    ledger.enterModule(spread.id);
    const pageIds = await Promise.all(spread.pages.map((i) => doc.pageId(i)));
    // Snapshot BEFORE — a module cannot mark its own homework.
    const before = await doc.renderPage(spread.pages[0]);

    const report = await spread.build({
      page,
      doc,
      pageIndexes: spread.pages,
      pageIds,
    });

    claims.push({
      module: spread.id,
      title: report.title,
      pages: spread.pages.map((i) => i + 1),
      covers: report.covers,
      notes: report.notes,
    });
    for (const n of report.notes ?? []) {
      notes.push(`${spread.id}: ${n}`);
      // eslint-disable-next-line no-console
      console.log(`[${spec.id}] ${spread.id} note — ${n}`);
    }

    if (spread.needsGpu && !gpu) {
      notes.push(
        `${spread.id}: pixel assertion skipped — no GPU render path: ${gpuReason}`,
      );
    } else {
      await doc.expectRenderChanged(spread.pages[0], before);
    }
    // eslint-disable-next-line no-console
    console.log(
      `[${spec.id}] ${spread.id} — ${report.title} ` +
        `(${report.elements.length} elements, ${report.covers.length} rows)`,
    );
  }

  // ── checkpoint ────────────────────────────────────────────────────
  const bytes = await doc.exportPaged();
  writeFileSync(
    isSolo(spec) ? soloCheckpointPath(spec.id) : checkpointPath(spec.id),
    bytes,
  );

  // ── incremental round-trip regression ─────────────────────────────
  // The input checkpoint already proved THIS chapter's predecessors
  // reload; sampling a few of their pages proves their content is still
  // painting after passing through another save/load generation. Cheap
  // (four renders), and it catches "survived the container but stopped
  // painting" the moment it happens instead of at assembly.
  const finalCount = await doc
    .refreshPages()
    .then((pages) => pages.length);
  const owned = new Set(spec.modules.flatMap((m) => m.pages));
  const earlier = isSolo(spec)
    ? []
    : [...Array(finalCount).keys()].filter((i) => !owned.has(i));
  const samples = earlier.filter((_, k) => k % Math.ceil(earlier.length / 4 || 1) === 0).slice(0, 4);
  for (const i of samples) {
    const png = await doc.renderPage(i, 612);
    // A uniform empty page compresses to a few hundred bytes; content
    // is far larger. Fixture pages that are DESIGNED empty stay above
    // the floor once their master furniture paints.
    expect(
      png.length,
      `page ${i + 1} went blank after chapter ${spec.id}'s checkpoint cycle`,
    ).toBeGreaterThan(600);
  }

  // A chapter that RUNS invalidates every LATER checkpoint — they were
  // built on a document that no longer exists, and a resumed run that
  // picked one up would chain stale content (measured: cascaded specs
  // spent 17 minutes building on a predecessor from an older run).
  if (!isSolo(spec)) {
    const ids = discoverChapterIds();
    for (const later of ids.slice(ids.indexOf(spec.id) + 1)) {
      const stale = checkpointPath(later);
      if (existsSync(stale)) unlinkSync(stale);
      const staleFragment = join(LEDGER_DIR, `${later}.json`);
      if (existsSync(staleFragment)) unlinkSync(staleFragment);
    }
  }

  const fragment: ChapterFragment = {
    chapter: isSolo(spec) ? `${spec.id}.solo` : spec.id,
    pageCount: finalCount,
    gpu,
    gpuReason,
    claims,
    notes,
    ops: Object.fromEntries(ledger.ops),
    paths: Object.fromEntries(ledger.paths),
  };
  writeFragment(LEDGER_DIR, fragment);
}

/** Declare the standard one-test chapter spec file body. */
export function chapterTest(spec: ChapterSpec): void {
  test.describe(`annual ${spec.id}`, () => {
    // 40 min. Measured, not guessed: in-chain mutation cost is ~3.8 s
    // per op against the 74-page authored document (vs ~1 s solo) —
    // per-mutation recompose scales with document CONTENT, which is
    // itself a finding the annual records. The object chapter's ~400
    // ops therefore legitimately need ~25 min; 40 leaves headroom
    // without hiding a real hang (the driver's 90 s stall classifier
    // catches those).
    test.setTimeout((spec.budgetMinutes ?? 40) * 60 * 1000);
    test(`${spec.title} @feat:package-anatomy.paged-container @level:happy`, async ({
      page,
    }) => {
      await runChapter(page, spec);
    });
  });
}
