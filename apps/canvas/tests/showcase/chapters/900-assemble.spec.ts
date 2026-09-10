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

// Assembly — the last spec in the build order. Loads the final
// checkpoint, exports every artifact, runs the round-trip gates, and
// settles the three-axis ledger:
//
//   registry rows   claimed / excluded / unaccounted (coverage.ts +
//                   exclusions.ts)
//   mutation ops    used / missing vs the 117-op capability table
//   property paths  set / missing vs core's 160-name catalog
//
// The ratchet: coverage-baseline.json is compared BOTH ways — a run
// below baseline fails (regression), and a run above baseline fails
// until the baseline is raised (so the number can never silently rot,
// same contract as scripts/surface-coverage.mjs).

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = pathResolve(fileURLToPath(import.meta.url), "..");

import { openCanvas } from "../../fidelity/canvas-driver";
import {
  assertUcfMimetypeFirst,
  readZipText,
  zipEntryNames,
} from "../../e2e/harness/read-zip";
import {
  CORPUS_FONTS,
  LEDGER_DIR,
  OUT,
  REGISTRY,
  checkpointPath,
  discoverChapterIds,
} from "../chapter";
import { buildCoverage, loadRegistry } from "../coverage";
import { ShowcaseDoc } from "../driver";
import { storiesSharedByFrames } from "../shared-stories";
import { classifyRow, EXCLUSIONS_COMPLETE } from "../exclusions";
import {
  mergeFragments,
  opUniverse,
  propertyPathUniverse,
  readFragments,
} from "../ledger";
import { ANNUAL_PAGES } from "../names-annual";

const CORE = pathResolve(OUT, "..", "..", "..", "..", "core");

/**
 * The working CMYK space this document names (set by Ch.11's colour-
 * management page) and therefore the output intent the press pass must
 * resolve. Same string on both sides — the document stores the NAME.
 */
const PRESS_PROFILE = "Paged Default CMYK";
/**
 * The CMYK space the DOCUMENT itself names (`<ColorSetting
 * CMYKProfile=…>`), and the one InDesign converts with when it renders
 * the reference — `indesign/render.jsx` sets `doc.cmykProfile` to this
 * same string.
 *
 * The canvas has no filesystem, so a profile only exists there if the
 * host registers its BYTES. Nothing did, so every CMYK fill in the
 * annual was painted with the naive `255·(1−ink)·(1−k)` fallback:
 * Slate 65/45/30/10 came out (80, 126, 161) against InDesign's
 * (101, 122, 144) — the naive formula, digit for digit. Registering
 * the real profile before the page renders is what makes the compare
 * a comparison of LAYOUT rather than of colour management.
 */
const DOC_CMYK_PROFILE = "Coated FOGRA39 (ISO 12647-2:2004)";
const DOC_CMYK_PROFILE_PATHS = [
  "/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc",
  "/Library/Application Support/Adobe/Color/Profiles/CoatedFOGRA39.icc",
];
const BASELINE_PATH = pathResolve(
  OUT,
  "..",
  "tests",
  "showcase",
  "coverage-baseline.json",
);

interface Baseline {
  registryRowsClaimed: number;
  opsUsed: number;
  pathsUsed: number;
}

test.describe("annual assembly", () => {
  test.setTimeout(20 * 60 * 1000);

  test("assembles, exports, round-trips, and settles the ledger @feat:package-anatomy.paged-container @level:happy", async ({
    page,
  }) => {
    const chapterIds = discoverChapterIds();
    const finalCheckpoint = checkpointPath(chapterIds[chapterIds.length - 1]);
    expect(
      existsSync(finalCheckpoint),
      `final checkpoint ${finalCheckpoint} missing — the chapter specs run first`,
    ).toBe(true);
    const fragments = readFragments(LEDGER_DIR);
    expect(
      fragments.map((f) => f.chapter).sort(),
      "every chapter wrote a ledger fragment",
    ).toEqual([...chapterIds].sort());
    const merged = mergeFragments(fragments);

    mkdirSync(join(OUT, "pages"), { recursive: true });
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.registerFonts(CORPUS_FONTS);
    const pageCount = await doc.load(finalCheckpoint);
    expect(pageCount, "the finished document reopens complete").toBe(
      ANNUAL_PAGES,
    );

    const notes = [...merged.notes];

    // ── the live container ──────────────────────────────────────────
    const live = await doc.exportPaged();
    assertUcfMimetypeFirst(live, "application/vnd.adobe.indesign-idml-package");
    const entries = zipEntryNames(live);
    expect(entries).toContain("manifest.json");
    expect(entries).toContain("paged/core/model/document.pgm");
    expect(entries).toContain("designmap.xml");
    const manifest = JSON.parse(readZipText(live, "manifest.json") ?? "{}") as {
      format: string;
      pagedProtocol: number;
      parts: { path: string; plugin?: string }[];
    };
    expect(manifest.format).toBe("paged-container");
    // The doubled-prefix regression guard: a plugin part path must
    // never repeat the namespace the host already prepends.
    const doubled = manifest.parts
      .map((p) => p.path)
      .filter((p) => /^paged\/[^/]+\/paged\//.test(p));
    expect(
      doubled,
      "no plugin part carries a doubled namespace prefix",
    ).toEqual([]);
    writeFileSync(join(OUT, "showcase.paged"), live);

    const pluginParts = manifest.parts
      .map((p) => p.path)
      .filter((p) => p.startsWith("paged/") && !p.startsWith("paged/core/"));
    // eslint-disable-next-line no-console
    console.log(
      `[assemble] container: ${entries.length} entries, ${pluginParts.length} plugin part(s)`,
    );

    // ── the interchange twin + the honest-loss ledger ───────────────
    // The interchange twin is exported with a LINK BASE: every placed
    // image becomes `<Image><Link LinkResourceURI="file:…/Links/…">`
    // pointing at the folder beside the `.idml`, and the export hands
    // back the bytes an image placed from bytes needs there. IDML cannot
    // embed pixels; a resolvable link is the only way a picture reaches
    // InDesign at all.
    const linksDir = join(OUT, "Links");
    mkdirSync(linksDir, { recursive: true });
    const {
      bytes: idml,
      lost,
      links,
    } = await doc.exportIdmlWithLost({
      linkBase: linksDir,
    });
    const assetByName = new Map<string, string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else assetByName.set(entry.name, full);
      }
    };
    walk(pathResolve(__dirname, "..", "assets"));
    let unresolvableLinks = 0;
    for (const l of links) {
      const target = join(linksDir, l.fileName);
      if (l.bytes) {
        writeFileSync(target, l.bytes);
      } else if (assetByName.has(l.fileName)) {
        copyFileSync(assetByName.get(l.fileName)!, target);
      } else if (!existsSync(target)) {
        // The book's deliberately missing asset (the press chapter's
        // broken-link exhibit) stays missing — and is COUNTED, so the
        // InDesign probe can demand exactly this many missing links.
        unresolvableLinks += 1;
        notes.push(
          `link \`${l.fileName}\` has no source (${l.sourceUri || "bytes-less"}) — left unresolved`,
        );
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[assemble] links: ${links.length} written under Links/, ${unresolvableLinks} unresolvable by design`,
    );
    assertUcfMimetypeFirst(idml, "application/vnd.adobe.indesign-idml-package");
    expect(zipEntryNames(idml)).toContain("designmap.xml");
    writeFileSync(join(OUT, "showcase.idml"), idml);
    for (const l of lost) notes.push(`idml export lost: ${l}`);

    // ── the model's own account, for the InDesign probe ──────────────
    // InDesign's overset count is only a finding against the model's:
    // the book carries deliberate overset exhibits, and a face that is
    // substituted oversets for a reason that has nothing to do with
    // IDML. The probe reads this beside the export.
    const modelStories = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              executeScript: (
                s: string,
              ) => Promise<{ output: string[]; error: string | null }>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.executeScript("paged.stories()");
      const rows = JSON.parse(reply.output[0] ?? "[]") as Array<{
        selfId?: string;
        overset?: boolean;
      }>;
      const oversetRows = rows.filter((r) => r.overset);
      return {
        stories: rows.length,
        overset: oversetRows.length,
        // The ids too, so an InDesign probe can say WHICH stories it
        // oversets that the engine does not (and the reverse).
        oversetIds: oversetRows.map((r) => r.selfId ?? ""),
      };
    });
    mkdirSync(join(OUT, "indesign"), { recursive: true });
    writeFileSync(
      join(OUT, "indesign", "model.json"),
      JSON.stringify(
        {
          stories: modelStories.stories,
          oversetStories: modelStories.overset,
          oversetIds: modelStories.oversetIds,
          links: links.length,
          unresolvableLinks,
          lost,
        },
        null,
        2,
      ),
    );
    notes.push(
      `model: ${modelStories.stories} stories, ${modelStories.overset} overset`,
    );

    // ── the born-shared oracle ──────────────────────────────────────
    // Two unthreaded frames on one story were born that way (the story
    // minter, on a document with sparse ids, named sibling mints in one
    // batch after the same number). The chart wall printed its labels
    // into its prose for a whole build and nothing here could see it;
    // InDesign could. A thread has one head; anything else fails.
    const shared = storiesSharedByFrames(idml);
    notes.push(`stories threaded across frames: ${shared.threads.length}`);
    expect(
      shared.bornShared.map(
        (s) =>
          `${s.story} ← ${s.frames.join(", ")} (${s.heads.length} heads) on ${s.spreads.join(", ")}`,
      ),
      "no two unthreaded frames share a story — frames born on one story",
    ).toEqual([]);
    // Loss is legitimate ONLY for `.paged`-native constructs (opacity
    // masks and kin). Anything else in the list is a silent-loss
    // regression. The allow-list grows only with a written reason.
    //
    // Orphan stories — a story no frame flows — are the second entry:
    // InDesign discards such a story on open (measured 2026-09-05), so
    // the exporter drops it and the ledger names it. The annual carries
    // six (exhibit leftovers: a deleted table's story, a released
    // anchored frame's); they are junk, not silent loss, and a repair
    // chapter deleting them is the book-side answer.
    const allowedLoss = [/opacity/i, /referenced by no frame/];
    const unexpectedLoss = lost.filter(
      (l) => !allowedLoss.some((re) => re.test(l)),
    );
    expect(
      unexpectedLoss,
      "IDML export reported losses outside the known .paged-native set",
    ).toEqual([]);

    // ── PDF, both flavours ──────────────────────────────────────────
    const pdf = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              exportPdf: (
                o: unknown,
              ) => Promise<{ bytes: Uint8Array; diagnostics: string[] }>;
            };
          };
        }
      ).__canvas;
      const out = await c.client.exportPdf({ standard: "pdf17" });
      let s = "";
      for (const b of out.bytes) s += String.fromCharCode(b);
      return { b64: btoa(s), diagnostics: out.diagnostics };
    });
    const pdfBytes = Buffer.from(pdf.b64, "base64");
    expect(pdfBytes.subarray(0, 5).toString("latin1"), "PDF magic").toBe(
      "%PDF-",
    );
    writeFileSync(join(OUT, "showcase.pdf"), pdfBytes);
    for (const d of pdf.diagnostics) notes.push(`pdf export: ${d}`);

    // The PRESS pass — PDF/X-4 with marks and bleed, the export the
    // press chapter promises "at assembly". The reading copy above
    // stays pdf17; this one carries the prepress furniture.
    //
    // First, the output intent. The colour chapter set this document's
    // working CMYK space to a profile it registered LIVE — and that
    // registry is session state, so a checkpoint boundary drops the
    // bytes while the document keeps the name. X-4 refuses without a
    // resolvable intent ("PDF/X-4 requires an output intent profile"),
    // which is the honest engine behaviour and a finding of its own:
    // the profile a document names must be re-registered by whoever
    // opens it. So the assembly re-registers the same profile under
    // the same name before asking for the press pass.
    const iccB64 = readFileSync(
      pathResolve(CORE, "corpus", "profiles", "default_cmyk.icc"),
    ).toString("base64");
    await page.evaluate(
      async ({ name, b64 }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                registerColorProfile: (
                  n: string,
                  bytes: Uint8Array,
                ) => Promise<void>;
              };
            };
          }
        ).__canvas;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        await c.client.registerColorProfile(name, bytes);
      },
      { name: PRESS_PROFILE, b64: iccB64 },
    );
    notes.push(
      `output intent — re-registered ${PRESS_PROFILE} for the press pass ` +
        `(the live profile registry is session state; a reopened document ` +
        `names a profile whose bytes it does not carry)`,
    );
    const press = await page.evaluate(async (profile: string) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              exportPdf: (
                o: unknown,
              ) => Promise<{ bytes: Uint8Array; diagnostics: string[] }>;
            };
          };
        }
      ).__canvas;
      const out = await c.client.exportPdf({
        standard: "pdfx4",
        outputIntentProfile: profile,
        outputCondition: "Paged Default CMYK (coated, core corpus)",
        cropMarks: true,
        registrationMarks: true,
        colorBars: true,
        pageInfo: true,
        marksOffsetPt: 9,
        bleedOverridePt: [9, 9, 9, 9],
        title: "The Paged Annual, Volume One",
      });
      let s = "";
      for (const b of out.bytes) s += String.fromCharCode(b);
      return { b64: btoa(s), diagnostics: out.diagnostics };
    }, PRESS_PROFILE);
    const pressBytes = Buffer.from(press.b64, "base64");
    expect(pressBytes.subarray(0, 5).toString("latin1"), "PDF/X-4 magic").toBe(
      "%PDF-",
    );
    writeFileSync(join(OUT, "showcase-pressready.pdf"), pressBytes);
    for (const d of press.diagnostics) notes.push(`pdfx4 export: ${d}`);

    // ── colour-manage the page renders ──────────────────────────────
    // The document names Coated FOGRA39; give the canvas its bytes so
    // the PNGs below are converted the way InDesign converts them.
    const docProfilePath = DOC_CMYK_PROFILE_PATHS.find((p) => existsSync(p));
    if (docProfilePath) {
      const docIccB64 = readFileSync(docProfilePath).toString("base64");
      await page.evaluate(
        async ({ name, b64 }) => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                client: {
                  registerColorProfile: (
                    n: string,
                    bytes: Uint8Array,
                  ) => Promise<void>;
                };
              };
            }
          ).__canvas;
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          await c.client.registerColorProfile(name, bytes);
        },
        { name: DOC_CMYK_PROFILE, b64: docIccB64 },
      );
      // Registering the bytes is not enough: the model binds its
      // active profile at LOAD, so a post-load registration only
      // becomes the working space on the next setColorSettings.
      // RelativeColorimetric + BPC is the calibrated default the
      // native gate uses, so both lanes convert alike.
      await doc.mutate("setColorSettings", {
        cmykProfileName: DOC_CMYK_PROFILE,
        rgbPolicy: null,
        intent: "RelativeColorimetric",
        bpc: true,
      });
      notes.push(
        `colour management — registered ${DOC_CMYK_PROFILE} from ` +
          `${docProfilePath} and made it the working space before the ` +
          `page renders`,
      );
    } else {
      notes.push(
        `colour management — ${DOC_CMYK_PROFILE} not installed on this ` +
          `host; the page renders fall back to naive CMYK math and will ` +
          `not match an InDesign export's colour`,
      );
    }

    // ── one render per page ─────────────────────────────────────────
    for (let i = 0; i < ANNUAL_PAGES; i += 1) {
      const png = await doc.renderPage(i, 1224);
      expect(png.length, `page ${i + 1} rendered no bytes`).toBeGreaterThan(0);
      writeFileSync(
        join(OUT, "pages", `page-${String(i + 1).padStart(3, "0")}.png`),
        png,
      );
    }

    // ── the baked twin stands on its own — HARD gate ────────────────
    const reloaded = await doc.load(join(OUT, "showcase.idml"));
    expect(reloaded, "the baked twin reopens with every page").toBe(
      ANNUAL_PAGES,
    );
    // The HARD blank gate covers pages a module OWNS (its claims name
    // them 1-based); fixture pages no chapter has landed on yet are
    // reported, not failed — the appendix chapter closes ownership of
    // all 134 and with it this gate.
    const ownedPages = new Set(
      merged.claims.flatMap((c) => c.pages.map((n) => n - 1)),
    );
    const blankOwned: number[] = [];
    const blankUnowned: number[] = [];
    for (let i = 0; i < ANNUAL_PAGES; i += 1) {
      const png = await doc.renderPage(i, 612);
      if (png.length < 1500) {
        (ownedPages.has(i) ? blankOwned : blankUnowned).push(i + 1);
      }
    }
    expect(
      blankOwned,
      "module-owned pages blank after the IDML round-trip — their content did not bake to native",
    ).toEqual([]);
    if (blankUnowned.length > 0) {
      notes.push(
        `pages not yet owned by any chapter render blank after round-trip: ` +
          `${blankUnowned.length} of ${ANNUAL_PAGES}`,
      );
    }

    // ── axis a: registry rows ───────────────────────────────────────
    const coverage = buildCoverage(REGISTRY, merged.claims);
    expect(
      coverage.unknown,
      `claimed registry rows that do not exist:\n${coverage.unknown.join("\n")}`,
    ).toEqual([]);
    expect(
      coverage.notShipped,
      `claimed rows the registry does not mark shipped:\n${coverage.notShipped.join("\n")}`,
    ).toEqual([]);
    // Closure over the WHOLE registry: every shipped row claimed or
    // excluded-with-reason. Report-only until the annual lands.
    const registry = loadRegistry(REGISTRY);
    const claimed = new Set(merged.claims.flatMap((c) => c.covers));
    const unaccounted: string[] = [];
    const excludedCount = { value: 0 };
    for (const row of registry.values()) {
      if (!row.shipped || claimed.has(row.id)) continue;
      if (classifyRow(row.id)) {
        excludedCount.value += 1;
        continue;
      }
      unaccounted.push(row.id);
    }
    if (EXCLUSIONS_COMPLETE) {
      expect(
        unaccounted,
        `shipped registry rows neither claimed nor excluded:\n${unaccounted.join("\n")}`,
      ).toEqual([]);
    } else if (unaccounted.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[assemble] registry closure (not yet armed): ${unaccounted.length} shipped rows unaccounted`,
      );
    }

    // ── axis b: mutation ops ────────────────────────────────────────
    const ops = opUniverse();
    const opsUsed = [...merged.ops.keys()].filter((o) => ops.includes(o));
    const opsMissing = ops.filter((o) => !merged.ops.has(o));
    const opsTransient = [...merged.ops.entries()]
      .filter(([, u]) => u.transient)
      .map(([op]) => op)
      .sort();

    // ── axis c: property paths ──────────────────────────────────────
    const paths = propertyPathUniverse(CORE);
    const pathsUsed = [...merged.paths.keys()].filter((p) => paths.includes(p));
    const pathsMissing = paths.filter((p) => !merged.paths.has(p));

    // ── the report ──────────────────────────────────────────────────
    const report = {
      ...coverage,
      notes,
      registryClosure: {
        armed: EXCLUSIONS_COMPLETE,
        excluded: excludedCount.value,
        unaccounted,
      },
      ops: {
        universe: ops.length,
        used: opsUsed.length,
        missing: opsMissing,
        transient: opsTransient,
      },
      propertyPaths: {
        universe: paths.length,
        used: pathsUsed.length,
        missing: pathsMissing,
      },
      idmlLost: lost,
    };
    writeFileSync(
      join(OUT, "showcase.coverage.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[assemble] ledger: rows ${coverage.claimedRows} · ` +
        `ops ${opsUsed.length}/${ops.length} · paths ${pathsUsed.length}/${paths.length}`,
    );

    // ── the both-ways ratchet ───────────────────────────────────────
    const current: Baseline = {
      registryRowsClaimed: coverage.claimedRows,
      opsUsed: opsUsed.length,
      pathsUsed: pathsUsed.length,
    };
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
      // eslint-disable-next-line no-console
      console.log(
        `[assemble] seeded coverage baseline: ${JSON.stringify(current)}`,
      );
    } else {
      const baseline = JSON.parse(
        readFileSync(BASELINE_PATH, "utf8"),
      ) as Baseline;
      for (const key of Object.keys(baseline) as (keyof Baseline)[]) {
        expect(
          current[key],
          `${key} regressed below the committed baseline — the annual lost coverage`,
        ).toBeGreaterThanOrEqual(baseline[key]);
        expect(
          current[key],
          `${key} improved past the baseline — raise coverage-baseline.json in the same change so the gain is locked in`,
        ).toBeLessThanOrEqual(baseline[key]);
      }
    }
  });
});
