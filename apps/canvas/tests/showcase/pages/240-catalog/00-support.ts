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

// Shared vocabulary for the catalog chapter (240) — paged.data driven
// through its real surfaces (the sources panel's import gateway, the
// bindings panel's wizard + authoring row, the dataset panel's palette
// and the payload-carrying commands) and FOUND on the page afterwards.
//
// THE ONE SESSION. The plugin's data session is in-memory and lives for
// the whole chapter run, so the modules SHARE it: the spread imports the
// CSV and mints the card's variable bindings, and every later module
// builds on those. That coupling is deliberate and it dictates the RUN
// ORDER the chapter spec declares (pages keep their book order; modules
// need not run in it): `lowerAll` re-lowers EVERY binding — a re-lower
// re-draws every bound barcode afresh onto the CURRENT active page and
// re-commits the demo table as a NEW frame — so the modules that add
// barcode/table bindings run LAST-first-defined-last-lowered, each
// cleaning up the re-draws of its predecessors' symbols, and the module
// that mints the table runs at the very end.
//
// The spread seam (measured, not assumed): wire INSERTS re-base
// page-local anchors by the spread origin, while geometry reads and the
// transform/resize lanes speak STORED coordinates — on this fixture a
// verso is its spread's origin page and the facing recto sits at +540.
// `spreadOffset` probes the live answer per page; every post-insert
// placement folds it in.

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { openPanel } from "../../../fidelity/canvas-driver";
import type { ShowcaseDoc } from "../../driver";
import { geometryOf, newRefs, settle, type Ref } from "../../plugin-support";
import type { PageContext } from "../../types";

const HERE = dirname(fileURLToPath(import.meta.url));

export const SOURCES_PANEL = "media.paged.data.panel.sources";
export const BINDINGS_PANEL = "media.paged.data.panel.bindings";
export const DATASET_PANEL = "media.paged.data.panel.dataset";
export const DATA_CMD = "media.paged.data.command";

/** The order book: 48 deterministic rows, 4 regions, valid EAN-13 /
 *  UPC-A check digits, QR-able urls, some empty notes (see the assets
 *  README grant row). */
export const CSV_FIXTURE = pathResolve(HERE, "../../assets/annual-orders.csv");

/** The paged.data DSL's own per-function registry (the sibling plugin
 *  repo) — read at build time by the expression-language page. */
export const FUNCTIONS_REGISTRY = pathResolve(
  HERE,
  "../../../../../../..",
  "plugins",
  "plugin-data",
  "registry",
  "functions",
);

/** E-Data grid arithmetic: 12 columns of 25 pt, 12 pt gutters — a run
 *  of `k` units spans `37k − 12` pt, and column i starts at cb[0]+37i. */
export const units = (k: number): number => 37 * k - 12;

/** What the earlier modules learned, for the later ones. In-memory only
 *  — ids never cross the CHAPTER boundary (hard rule 1); within one
 *  chapter run they are the same live document. */
export const chapterData: {
  /** DuckDB reached "ready" and the CSV registered. */
  ready: boolean;
  /** The record card's wizard-mapped bindings, in card order. */
  cardFields: Array<{ binding: string; column: string; storyId: string }>;
} = { ready: false, cardFields: [] };

// ── the date-column seam finding ─────────────────────────────────────

let derivedCsv: string | null = null;

/**
 * The order book with `order_date` WITHHELD — a run-time derivation of
 * the granted asset, never a second asset.
 *
 * WHY (a product finding this chapter surfaced, 2026-08-27): DuckDB's
 * CSV sniffer types the ISO order_date column as DATE, its Arrow
 * column materialises as epoch-MILLISECONDS, and the bundle's
 * Arrow→RecordSet seam passes that number straight through as
 * `{t:"date"}` — but the engine's `Value::Date` is i32 DAYS, so serde
 * refuses (`invalid value: integer 1735862400000, expected i32`) and
 * `ingest_result` rejects the WHOLE result set. annual-orders.csv is
 * the first dated source this seam has met (the journey fixture is
 * name,role). Until the seam divides by 86 400 000, ANY dated query
 * result is unresolvable — so the chapter drives the same order book
 * minus its date column, and the page's margin says so.
 */
export function csvWithoutDates(): string {
  if (derivedCsv) return derivedCsv;
  const text = readFileSync(CSV_FIXTURE, "utf8").trimEnd();
  const lines = text.split("\n");
  const header = lines[0].split(",");
  const drop = header.indexOf("order_date");
  if (drop < 0) {
    derivedCsv = CSV_FIXTURE;
    return derivedCsv;
  }
  const stripped = lines.map((line) => {
    // The generated CSV carries no quoted commas — a plain split is
    // exact, and a drifted fixture fails loudly rather than silently.
    const cells = line.split(",");
    if (cells.length !== header.length) {
      throw new Error(
        `annual-orders.csv row has ${cells.length} cells, header has ` +
          `${header.length} — the no-quoted-commas assumption broke`,
      );
    }
    cells.splice(drop, 1);
    return cells.join(",");
  });
  const dir = mkdtempSync(join(tmpdir(), "annual-orders-"));
  // SAME basename on purpose: the sources panel derives the DuckDB
  // table name from the file name, and the chapter's reads look for
  // `annual_orders`.
  derivedCsv = join(dir, "annual-orders.csv");
  writeFileSync(derivedCsv, `${stripped.join("\n")}\n`);
  return derivedCsv;
}

// ── the spread seam ──────────────────────────────────────────────────

const offsetCache = new Map<string, [number, number]>();

/**
 * Where this page's STORED coordinates sit relative to page-local ones
 * — [0,0] on a spread's origin page, [540,0] on the facing page of
 * this fixture. MEASURED with a transient probe: wire inserts re-base
 * page-local anchors by the spread origin while transforms/geometry
 * speak stored coords, so any post-insert placement must fold this
 * offset in or artwork lands one page width off. → Appendix A.
 */
export async function spreadOffset(
  ctx: PageContext,
  pageId: string,
): Promise<[number, number]> {
  const hit = offsetCache.get(pageId);
  if (hit) return hit;
  const probe: [number, number, number, number] = [10, 10, 26, 26];
  const id = await ctx.doc.rectangle(pageId, probe);
  const geo = await geometryOf(ctx.page, [{ kind: "rectangle", id }]);
  await ctx.doc.mutate("deleteFrame", { frameId: id });
  const bounds = geo[0]?.bounds;
  if (!bounds) {
    throw new Error(`spread-offset probe on ${pageId} answered no geometry`);
  }
  const off: [number, number] = [bounds[1] - probe[0], bounds[0] - probe[1]];
  offsetCache.set(pageId, off);
  return off;
}

// ── read doors ───────────────────────────────────────────────────────

/** A placeholder FIELD as the engine's read door reports it — the D-01
 *  tagged run a lowered variable places. */
export interface FieldRecord {
  plugin: string;
  key: string;
  storyId: string;
  offset: number;
  value: string | null;
}

/** Every paged.data placeholder field in the document, via the same
 *  wire door the plugin's own refresh loop enumerates. */
export async function readFields(page: Page): Promise<FieldRecord[]> {
  const items = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload: { items?: unknown[] };
            }>;
          };
        };
      }
    ).__canvas;
    try {
      const reply = await c.client.send({
        kind: "requestDocumentPlaceholders",
      });
      return reply.kind === "documentPlaceholders"
        ? ((reply.payload.items ?? []) as Array<Record<string, unknown>>)
        : [];
    } catch {
      return [];
    }
  });
  return items
    .map((i) => ({
      plugin: String(i.plugin ?? ""),
      key: String(i.key ?? ""),
      storyId: String(i.storyId ?? ""),
      offset: Number(i.offset ?? 0),
      value: (i.value ?? null) as string | null,
    }))
    .filter((f) => f.plugin.startsWith("media.paged.data"));
}

/** One field's current display, by binding key; null when absent. */
export async function fieldValue(
  page: Page,
  key: string,
): Promise<string | null> {
  const hit = (await readFields(page)).find((f) => f.key === key);
  return hit ? hit.value : null;
}

/**
 * Invoke a registered command and KEEP its return value — the two
 * data-set verbs are payload-carrying commands whose handlers answer
 * (captured names, `{applied, skipped}`), and the page prints those
 * answers rather than asserting blind.
 */
export async function invokeFor<T>(
  page: Page,
  id: string,
  payload?: unknown,
): Promise<T> {
  return (await page.evaluate(
    async ({ id, payload }) => {
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: {
                invoke: (id: string, payload?: unknown) => Promise<unknown>;
              };
            };
          };
        }
      ).__canvas.registries;
      return await reg.commands.invoke(id, payload);
    },
    { id, payload },
  )) as T;
}

// ── panel drives ─────────────────────────────────────────────────────

/**
 * Register the order book: the importData command (which opens the
 * sources panel), the panel's host file-picker door, and the honest
 * wait for the vendored DuckDB-WASM engine to reach "ready". Returns
 * the final engine status; only "ready" means a query can run.
 */
export async function importOrders(
  ctx: PageContext,
  notes: string[],
): Promise<string> {
  const { page, doc } = ctx;
  await doc.runCommand(`${DATA_CMD}.importData`);
  await openPanel(page, SOURCES_PANEL);
  const importButton = page.locator("[data-data-import-csv]");
  await expect(importButton, "the paged.data sources panel mounted").toBeVisible(
    { timeout: 120_000 },
  );
  const chooser = page.waitForEvent("filechooser");
  await importButton.click();
  // The DERIVED order book (order_date withheld) — see csvWithoutDates
  // for the seam finding that forces it; the note lands page-side.
  await (await chooser).setFiles(csvWithoutDates());
  notes.push(
    "PRODUCT FINDING — the Arrow→RecordSet seam decodes a DATE column to " +
      "epoch-milliseconds while the engine's Value::Date expects i32 days, " +
      "so serde refuses the whole ingest of any dated result " +
      "(`invalid value: integer 1735862400000, expected i32`). " +
      "annual-orders.csv is the first dated source the seam has met; this " +
      "chapter drives it with order_date withheld and says so in the margin.",
  );

  const status = page.locator("[data-status]").last();
  const ready = await settle(
    page,
    async () =>
      (await status.getAttribute("data-status").catch(() => null)) === "ready",
    120_000,
  );
  const got = ready
    ? "ready"
    : ((await status.getAttribute("data-status").catch(() => null)) ??
      "unknown");
  if (ready) {
    chapterData.ready = true;
    await expect(page.getByText(/annual_orders/).first()).toBeVisible({
      timeout: 120_000,
    });
  } else {
    notes.push(
      `the CSV source never reached "ready" (engine status "${got}") — the ` +
        "vendored DuckDB-WASM dist is absent or this context is not " +
        "cross-origin isolated. No query ran and this chapter's data pages " +
        "claim no data rows.",
    );
  }
  return got;
}

/**
 * One pass of the field-mapping wizard confirming exactly ONE column.
 * The wizard batches its confirm — every chosen column becomes a
 * binding and every NEW binding's field lands at the one caret — so a
 * card line per column means a pass per column. The engine computes
 * each column's binding expression; this drive only picks which.
 */
export async function wizardMapSingle(
  page: Page,
  column: string,
): Promise<void> {
  await openPanel(page, BINDINGS_PANEL);
  await page.getByRole("button", { name: /map fields/i }).click();
  const wizard = page.locator('[data-testid="wizard-columns"]');
  await expect(
    wizard,
    "the field-mapping wizard listed the source's columns",
  ).toBeVisible({ timeout: 30_000 });
  const labels = wizard.locator("label");
  const n = await labels.count();
  let found = false;
  for (let i = 0; i < n; i += 1) {
    const label = labels.nth(i);
    const expr = (await label.locator("code").textContent().catch(() => null))
      ?.trim();
    const box = label.locator('input[type="checkbox"]');
    if (expr === column) {
      found = true;
      await box.check();
    } else if (await box.isChecked()) {
      await box.uncheck();
    }
  }
  if (!found) {
    throw new Error(
      `the wizard offered no mappable column "${column}" — annual-orders.csv drifted?`,
    );
  }
  const confirm = page.locator('[data-testid="wizard-confirm"]');
  await expect(
    confirm,
    "exactly one column stayed chosen for this pass",
  ).toHaveText(/create 1 binding/i);
  await confirm.click();
}

/** Click the bindings panel's Lower button (session.lowerAll behind an
 *  unawaited handler — callers settle on their own oracle after). */
export async function clickLower(page: Page): Promise<void> {
  await openPanel(page, BINDINGS_PANEL);
  await page.getByRole("button", { name: /^lower to document$/i }).click();
}

/** Author one binding through the panel's authoring row (kind picker +
 *  field/expression input + Add). Image/barcode kinds bind the SELECTED
 *  rectangle — the caller selects it first. */
export async function addAuthoredBinding(
  page: Page,
  kind: "variable" | "image" | "barcode",
  fieldExpr: string,
  symbology?: "ean13" | "upca" | "code128" | "qr",
): Promise<void> {
  await openPanel(page, BINDINGS_PANEL);
  await expect(page.locator("[data-data-bind-author]")).toBeVisible({
    timeout: 120_000,
  });
  await page.locator("[data-data-bind-kind]").selectOption(kind);
  if (kind === "barcode" && symbology) {
    const picker = page
      .locator("select")
      .filter({ has: page.locator('option[value="code128"]') })
      .first();
    await expect(
      picker,
      "the symbology picker appears once the kind is barcode",
    ).toBeVisible({ timeout: 120_000 });
    await picker.selectOption(symbology);
  }
  await page.locator("[data-data-bind-field]").fill(fieldExpr);
  await page.locator("[data-data-bind-add]").click();
}

// ── layers, in one undo step ─────────────────────────────────────────

/** Assign many same-kind items to a named layer as ONE batch — a
 *  barcode is hundreds of path modules and per-op assignment is the
 *  wrong cost shape. Refusals surface to the caller. */
export async function assignLayerBatch(
  doc: ShowcaseDoc,
  kind: string,
  ids: string[],
  layerName: string,
): Promise<void> {
  if (ids.length === 0) return;
  const layerId = await doc.layerId(layerName);
  await doc.batch(
    ids.map((id) => ({
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "itemLayer",
        value: { type: "text", value: layerId },
      },
    })),
  );
}

/**
 * Poll until the set of NEW elements of `kind` is non-empty AND its
 * count holds across two consecutive samples — a `lowerAll` pass
 * commits several symbols one batch after another, and settling on the
 * FIRST new module snapshots the pass mid-flight (this page measured
 * exactly that: the later symbols landed after the read and looked
 * like they had never drawn). The 220 chapter's settle discipline.
 */
export async function settleStableNew(
  page: Page,
  kind: string,
  before: Ref[],
  timeoutMs = 45_000,
): Promise<Ref[]> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = -1;
  for (;;) {
    const fresh = await newRefs(page, kind, before);
    if (fresh.length > 0 && fresh.length === lastCount) return fresh;
    lastCount = fresh.length;
    if (Date.now() >= deadline) return fresh;
    await page.waitForTimeout(700);
  }
}

/**
 * Translate freshly lowered path modules back across the spread seam.
 *
 * THE SEAM FINDING (measured on this fixture, 2026-08-27): the barcode
 * commit reads its bound rectangle's STORED geometry and feeds those
 * numbers to the page-local `insertPath` wire — which re-bases them by
 * the spread origin AGAIN. On a spread-origin page (offset 0) the two
 * lanes agree and nothing shows; on a page stored at −540 the symbol
 * lands one page width off, on the pasteboard. The corrective translate
 * is `−offset` as ONE transform batch — ordinary same-spread layout,
 * recorded in the module's notes wherever it fires.
 */
export async function unshiftSeam(
  doc: ShowcaseDoc,
  kind: string,
  ids: string[],
  off: [number, number],
): Promise<boolean> {
  if ((off[0] === 0 && off[1] === 0) || ids.length === 0) return false;
  await doc.batch(
    ids.map((id) => ({
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "frameTransform",
        value: { type: "transform", value: [1, 0, 0, 1, -off[0], -off[1]] },
      },
    })),
  );
  return true;
}

// ── the DSL roster (build-time read) ─────────────────────────────────

export interface DslFamily {
  family: string;
  names: string[];
}

/**
 * The 42-function roster, read from the plugin's own per-function
 * registry (`registry/functions/*.yaml` — the same files data-core's
 * build.rs consumes: no row → no dispatch → uncallable). A narrow
 * line reader, not a YAML parser: rows are `- id:` blocks and each
 * carries one `name:` line. Null when the sibling repo is absent.
 */
export function readDslRoster(): DslFamily[] | null {
  try {
    const files = readdirSync(FUNCTIONS_REGISTRY)
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    return files.map((file) => {
      const text = readFileSync(pathResolve(FUNCTIONS_REGISTRY, file), "utf8");
      const names = [...text.matchAll(/^ {2}name:[ \t]*(\S+)$/gm)].map(
        (m) => m[1],
      );
      return { family: file.replace(/\.yaml$/, ""), names };
    });
  } catch {
    return null;
  }
}
