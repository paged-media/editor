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

// PLUGIN SURFACE — paged.sheet.
//
// WHAT THIS IS FOR, AND WHY IT IS NOT THE SHEET JOURNEY SUITE.
//
//   `tests/journey/plugins/sheet-*.journey.spec.ts` drive the sheet
//   CAPABILITIES: the calc engine, spill, charts, the in-frame K-1
//   session, xlsx round-trip. They prove the spreadsheet works.
//
//   This file asks the other question: is the spreadsheet REACHABLE, and
//   does every id the bundle's manifest promises actually exist in the
//   host it is loaded into? The surface-coverage gate reports
//   `sheet 8/20` — twelve of the twenty things paged.sheet injects have
//   never been named by a spec, which means nothing has ever checked
//   that they arrive at all. A manifest is a promise to the host; an id
//   in it that no registry holds is a lie no capability test can catch,
//   because the capability tests drive the panel DOM, not the doors.
//
//   So the tests below enumerate from the MANIFEST THE APP RESOLVES
//   (`apps/canvas/node_modules/@paged-media/sheet/manifest.json` — the
//   published canary, not whatever the plugin repo has on disk) and
//   assert each declared id against the live registries.
//
// THE AUDIT TESTS AT THE BOTTOM ARE CHARACTERIZATION TESTS.
//
//   Three of them assert a state that is WRONG for a user and right for
//   today's build:
//
//     · paged.sheet contributes ZERO tools, ZERO menu items and ZERO
//       keybindings, so a spreadsheet can only be created from Cmd+K;
//     · getting one onto the page is TWO palette commands in sequence,
//       the second called "Lower selection to frame" — "lower" being
//       compiler vocabulary, not something a designer would search for;
//     · ADR-024's `panelBelongsHere` DISABLES Window ▸ Workbook until a
//       sheet context is already active, while leaving Window ▸ Grid and
//       Window ▸ Datasets live and unlabelled in every document — so the
//       panel that would teach you the feature is dark until you have
//       found the feature, and the two that are lit say nothing about
//       what they are for.
//
//   They are written to FAIL when the exposure improves. That is
//   deliberate: a fix should have to come here and delete an assertion,
//   which is the only way a "known bad" note stays honest.

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "../e2e/harness/fixtures";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The manifest THE APP RESOLVES — `apps/canvas/node_modules`, not the
 *  pnpm store and not the plugin repo. The store carries every version
 *  any workspace member ever asked for; only this symlink answers "what
 *  does this build inject". (Same rule the surface-coverage gate uses.) */
const MANIFEST = JSON.parse(
  readFileSync(
    pathResolve(HERE, "../../node_modules/@paged-media/sheet/manifest.json"),
    "utf8",
  ),
) as {
  id: string;
  contributes: {
    panels: string[];
    commands: string[];
    importers: string[];
    exporters: string[];
    editContexts: Array<{ type: string; entry: string }>;
    objectTypes: Array<{ type: string; bakedFallback: string }>;
    partTypes: Array<{ type: string; role: string; format: string }>;
  };
};

const XLSX_FIXTURE = pathResolve(HERE, "../e2e/harness/sheet-02-formulas.xlsx");
const XLSX_BYTES = Array.from(readFileSync(XLSX_FIXTURE));
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const GRID_PANEL = "media.paged.sheet.panel.grid";
const DATASETS_PANEL = "media.paged.sheet.panel.datasets";
const IMPORTER = "media.paged.sheet.importer.xlsx";
const EXPORTER = "media.paged.sheet.exporter.xlsx";

/** THE TWENTY IDS, SPELLED OUT.
 *
 *  Comparing the manifest to the registries proves they AGREE; it cannot
 *  prove either is complete, because a bundle that silently drops a
 *  command from both sides still agrees with itself. Pinning the list
 *  here is the third party that notices — and it is also what makes the
 *  surface-coverage gate (which matches literal id strings across
 *  `tests/`) able to see that these are exercised at all. */
const DECLARED = {
  panels: [WORKBOOK_PANEL, GRID_PANEL, DATASETS_PANEL],
  commands: [
    "media.paged.sheet.command.importXlsx",
    "media.paged.sheet.command.lowerToFrame",
    "media.paged.sheet.command.lowerChartToFrame",
    "media.paged.sheet.command.openGrid",
    "media.paged.sheet.command.showGridInFrame",
    "media.paged.sheet.command.hideGridInFrame",
    "media.paged.sheet.command.sortRange",
    "media.paged.sheet.command.findReplace",
    "media.paged.sheet.command.sheetFromDataset",
    "media.paged.sheet.command.copySelection",
    "media.paged.sheet.command.pasteSelection",
    "media.paged.sheet.command.styleFromCell",
  ],
  importers: [IMPORTER],
  exporters: [EXPORTER],
  editContexts: ["sheet"],
  objectTypes: ["sheetFrame"],
  partTypes: ["workbook"],
} as const;

interface ElementRef {
  kind: string;
  id: string;
}

// ── page-side handles ───────────────────────────────────────────────
//
// Typed structurally against `__canvas` rather than importing the shell:
// a spec that imported the registry types would be asserting the types
// compile, not that the running app registered anything.

interface CanvasRegistries {
  commands: {
    list(): Array<{ id: string; title: string; category?: string }>;
    get(id: string): { id: string; title: string } | undefined;
    invoke(id: string, payload?: unknown): Promise<unknown>;
    observe(o: (e: { phase: string; invocation: { id: string }; error?: unknown }) => void): {
      dispose(): void;
    };
  };
  panels: { list(): Array<{ id: string; title: string; rail?: boolean }> };
  tools: { list(): Array<{ id: string }> };
  menus: { list(): Array<{ path: string; command: string }> };
  keybindings: { list(): Array<{ key: string; command: string }> };
  importers: {
    list(): Array<{ id: string; title: string; extensions: string[]; mimeTypes?: string[] }>;
    resolve(name: string, mime?: string): { id: string } | null;
    acceptExtensions(): string[];
  };
  exporters: {
    list(): Array<{ id: string; title: string; extension: string }>;
  };
  editContexts: {
    list(): Array<{ type: string; entry: string; toolIds?: string[] | null; panelIds?: string[] | null }>;
  };
  objectTypes: { list(): Array<{ type: string; editContextType?: string }> };
}

interface CanvasGlobal {
  __canvas: {
    ready: boolean;
    openPanel: (id: string) => void;
    registries: CanvasRegistries;
    client: {
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
      camera: { read: () => { scale: number; tx: number; ty: number } };
      elementGeometry: (
        ids: unknown[],
      ) => Promise<
        Array<{
          bounds: [number, number, number, number];
          itemTransform?: [number, number, number, number, number, number] | null;
        }>
      >;
    };
  };
}

/** Load the geometry fixture through the REACT path (the header file
 *  input) so ViewportCanvas mounts — the double-click entry lives in its
 *  handler, and the menu bar / tool rail only exist in the real UI. */
async function bootWithDocument(page: Page): Promise<void> {
  await openCanvas(page);
  await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
  await expect
    .poll(
      () => page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.ready),
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.keyboard.press("Home"); // fit page 0
  await page.waitForTimeout(1000);
}

async function invoke(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (cid) => (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(cid),
    id,
  );
}

/** Fire a command WITHOUT awaiting it in the page. Needed for the ones
 *  that open a host file picker: awaiting would park the `evaluate` on a
 *  promise that only settles when the dialog is answered. */
async function invokeDetached(page: Page, id: string): Promise<void> {
  await page.evaluate((cid) => {
    void (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(cid);
  }, id);
}

async function openPanel(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (pid) => (globalThis as unknown as CanvasGlobal).__canvas.openPanel(pid),
    id,
  );
}

/** Count scene-tree nodes of one wire kind (the lowering inserts a
 *  textFrame; measuring the DELTA keeps the fixture's own frames out). */
async function countKind(page: Page, kind: string): Promise<number> {
  return page.evaluate(async (k) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string } | null;
      children?: unknown[];
    }>;
    let n = 0;
    const visit = (node: { id?: { kind: string } | null; children?: unknown[] }) => {
      if (node.id && node.id.kind === k) n += 1;
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return n;
  }, kind);
}

async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

/** Screen point at the centre of an element's TRANSFORMED page-0 bounds
 *  (itemTransform folded in). Copied from e2e/sheet-modal-session. */
async function elementScreenCenter(
  page: Page,
  ref: ElementRef,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (id) => {
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > bestArea) {
        bestArea = r.width * r.height;
        best = cv;
      }
    }
    const wrap = (best?.parentElement ?? best)!.getBoundingClientRect();
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const items = await c.client.elementGeometry([id]);
    const item = items[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const px = a * cx + cc * cy + tx;
    const py = b * cx + d * cy + ty;
    const cam = c.client.camera.read();
    return {
      x: wrap.left + px * cam.scale + cam.tx,
      y: wrap.top + py * cam.scale + cam.ty,
    };
  }, ref);
}

/** Push the fixture workbook through the REGISTERED importer — the exact
 *  path File ▸ Open… and drag-drop take (PagedShell `onFile` resolves the
 *  registry, then calls `import`). Returns nothing; the session is loaded. */
async function importWorkbook(page: Page): Promise<void> {
  await page.evaluate(
    async ({ bytes, mime }) => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const imp = r.importers.resolve("sheet-02-formulas.xlsx", mime) as
        | { import: (f: { name: string; bytes: Uint8Array; mimeType: string }) => Promise<void> }
        | null;
      if (!imp) throw new Error("no importer resolved for .xlsx");
      await imp.import({
        name: "sheet-02-formulas.xlsx",
        bytes: Uint8Array.from(bytes),
        mimeType: mime,
      });
    },
    { bytes: XLSX_BYTES, mime: XLSX_MIME },
  );
  // The engine boots in-browser and parses the workbook; the panel's
  // range control is the readable proof it landed.
  await openPanel(page, WORKBOOK_PANEL);
  await expect(page.locator("[data-sheet-range]")).toBeVisible({ timeout: 30_000 });
}

test.describe("plugin surface · paged.sheet", () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDocument(page);
  });

  // ── 1. THE MANIFEST IS A PROMISE. Check it. ──────────────────────

  test("every id the resolved manifest declares is registered in the host", async ({
    page,
  }) => {
    const live = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      return {
        panels: r.panels.list().map((p) => p.id),
        commands: r.commands.list().map((c) => c.id),
        importers: r.importers.list().map((i) => i.id),
        exporters: r.exporters.list().map((e) => e.id),
        editContexts: r.editContexts.list().map((c) => c.type),
        objectTypes: r.objectTypes.list().map((o) => o.type),
        registryNames: Object.keys(r),
      };
    });

    const c = MANIFEST.contributes;
    // The manifest matches the pinned list — a contribution silently
    // added to or dropped from the published bundle lands here first.
    expect([...c.panels].sort()).toEqual([...DECLARED.panels].sort());
    expect([...c.commands].sort()).toEqual([...DECLARED.commands].sort());
    expect([...c.importers]).toEqual([...DECLARED.importers]);
    expect([...c.exporters]).toEqual([...DECLARED.exporters]);
    expect(c.editContexts.map((e) => e.type)).toEqual([...DECLARED.editContexts]);
    expect(c.objectTypes.map((o) => o.type)).toEqual([...DECLARED.objectTypes]);

    for (const id of c.panels) expect(live.panels, `panel ${id}`).toContain(id);
    for (const id of c.commands) expect(live.commands, `command ${id}`).toContain(id);
    for (const id of c.importers) expect(live.importers, `importer ${id}`).toContain(id);
    for (const id of c.exporters) expect(live.exporters, `exporter ${id}`).toContain(id);
    for (const e of c.editContexts)
      expect(live.editContexts, `editContext ${e.type}`).toContain(e.type);
    for (const o of c.objectTypes)
      expect(live.objectTypes, `objectType ${o.type}`).toContain(o.type);

    // PART TYPES ARE DECLARED INTO A VOID. The manifest promises a
    // `workbook` part (role source, format xlsx) but the host ships no
    // partType registry at all — there is nothing for the declaration to
    // reach, so it can never be wrong and never be checked. Recorded here
    // rather than asserted away, because "the gate counts it as surface"
    // and "the host has a door for it" are different facts.
    expect(c.partTypes.map((p) => p.type)).toEqual([...DECLARED.partTypes]);
    expect(
      live.registryNames,
      "no partType registry exists — the manifest's partTypes reach nothing",
    ).not.toContain("partTypes");
    test.info().annotations.push({
      type: "surface-finding",
      description:
        "paged.sheet declares partType 'workbook' but ShellRegistries has no partType registry; " +
        "the declaration is inert metadata the host never reads.",
    });
  });

  // ── 2. PANELS ────────────────────────────────────────────────────

  test("all three panels open as right-dock tabs and mount their content", async ({
    page,
  }) => {
    for (const [id, marker] of [
      [WORKBOOK_PANEL, "workbook"],
      [GRID_PANEL, "grid"],
      [DATASETS_PANEL, "datasets"],
    ] as const) {
      await openPanel(page, id);
      await expect(
        page.locator(`[data-sheet-panel="${marker}"]`),
        `${id} mounts`,
      ).toBeVisible({ timeout: 15_000 });
    }

    // The workbook panel's own entry point is there before any workbook
    // exists — the K-5 picker button.
    await openPanel(page, WORKBOOK_PANEL);
    await expect(page.locator("[data-sheet-pick]")).toBeVisible();
  });

  // ── 3. COMMANDS ──────────────────────────────────────────────────

  test("all twelve declared commands are registered, titled, and actually run", async ({
    page,
  }) => {
    const registered = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      return r.commands
        .list()
        .filter((c) => c.id.startsWith("media.paged.sheet.command."))
        .map((c) => ({ id: c.id, title: c.title, category: c.category ?? null }));
    });
    expect(registered.map((c) => c.id).sort()).toEqual([...DECLARED.commands].sort());
    for (const c of registered) {
      expect(c.title, `${c.id} has a palette title`).toBeTruthy();
      expect(c.category, `${c.id} is grouped under a category`).toBe("Sheet");
    }

    // INVOCABLE, proven through the registry's own observer — the single
    // place a handler is ever called. A command refused by its `when`
    // emits nothing, which is exactly how we tell "ran" from "declined".
    const ids = DECLARED.commands.filter(
      // the picker command is exercised separately (it parks on a dialog)
      (id) => id !== "media.paged.sheet.command.importXlsx",
    );
    const result = await page.evaluate(async (list) => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const started: string[] = [];
      const failed: string[] = [];
      const sub = r.commands.observe((e) => {
        if (e.phase === "started") started.push(e.invocation.id);
        if (e.phase === "settled" && e.error) failed.push(e.invocation.id);
      });
      const threw: string[] = [];
      for (const id of list) {
        try {
          await r.commands.invoke(id);
        } catch (err) {
          threw.push(`${id}: ${String(err).split("\n")[0]}`);
        }
      }
      sub.dispose();
      return { started, failed, threw };
    }, ids);

    expect(result.threw, "no sheet command throws out of invoke()").toEqual([]);
    expect(result.failed, "no sheet command settles with an error").toEqual([]);

    // With no workbook open the two clipboard commands DECLINE (their
    // `when` is `workbookIsOpen`) — the ADR-024 gate, working. Everything
    // else ran.
    const declined = ids.filter((id) => !result.started.includes(id));
    expect(declined.sort()).toEqual([
      "media.paged.sheet.command.copySelection",
      "media.paged.sheet.command.pasteSelection",
    ]);

    // …and they become live once a workbook is loaded, which is the
    // other half of the gate being real rather than permanently off.
    await importWorkbook(page);
    const nowEnabled = await page.evaluate(async () => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const started: string[] = [];
      const sub = r.commands.observe((e) => {
        if (e.phase === "started") started.push(e.invocation.id);
      });
      await r.commands.invoke("media.paged.sheet.command.copySelection");
      sub.dispose();
      return started;
    });
    expect(
      nowEnabled,
      "copySelection is offered once a workbook is open",
    ).toContain("media.paged.sheet.command.copySelection");
  });

  test("'Import workbook (.xlsx)' opens the host file picker and loads the chosen file", async ({
    page,
  }) => {
    // S-11 — the command routes through `host.shell.pickFile`, the host
    // door backed by a programmatic <input type=file>. Fire-and-forget so
    // the evaluate does not park on the dialog.
    const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
    await invokeDetached(page, "media.paged.sheet.command.importXlsx");
    await (await chooser).setFiles(XLSX_FIXTURE);

    // The command opens the workbook panel on success and the engine
    // parses the file in-browser — the range control is the proof.
    await expect(page.locator("[data-sheet-range]")).toBeVisible({ timeout: 30_000 });
  });

  test("four of the twelve 'commands' only raise a panel — and two of those are named like dialogs they do not have", async ({
    page,
  }) => {
    // openGrid and sheetFromDataset do what their titles say: they raise
    // the panel they name.
    await invoke(page, "media.paged.sheet.command.openGrid");
    await expect(page.locator('[data-sheet-panel="grid"]')).toBeVisible({ timeout: 15_000 });

    await invoke(page, "media.paged.sheet.command.sheetFromDataset");
    await expect(page.locator('[data-sheet-panel="datasets"]')).toBeVisible({ timeout: 15_000 });

    // "Sort range…" and "Find & replace…" carry the ellipsis that means
    // "this opens a dialog". Neither does — both just raise the Workbook
    // panel. Worse, from a cold document (the state a user is in when
    // they search Cmd+K for "sort") the panel they land on does not even
    // CONTAIN a sort or find control: those render only once a workbook
    // is open. So the verb answers a search with an empty room.
    const CONTROLS = [
      ["media.paged.sheet.command.sortRange", "[data-sheet-sort]"],
      ["media.paged.sheet.command.findReplace", "[data-sheet-find]"],
    ] as const;

    for (const [id, control] of CONTROLS) {
      await openPanel(page, GRID_PANEL); // move away first
      await expect(page.locator('[data-sheet-panel="grid"]')).toBeVisible();
      await invoke(page, id);
      await expect(
        page.locator('[data-sheet-panel="workbook"]'),
        `${id} raises the Workbook panel`,
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.locator('[role="dialog"]'),
        `${id} opens no dialog despite the ellipsis in its title`,
      ).toHaveCount(0);
      await expect(
        page.locator(control),
        `DEFECT: ${id} lands on a panel with no ${control} in it while no workbook is open`,
      ).toHaveCount(0);
    }

    // Once a workbook exists the controls are there — so the commands
    // are not broken, they are just useless at the moment a user reaches
    // for them, and say nothing about why.
    await importWorkbook(page);
    for (const [id, control] of CONTROLS) {
      await openPanel(page, GRID_PANEL);
      await invoke(page, id);
      await expect(
        page.locator(control),
        `${id}'s control appears once a workbook is open`,
      ).toHaveCount(1);
    }

    test.info().annotations.push({
      type: "surface-finding",
      description:
        "DEFECT: paged.sheet's 'Sort range…' and 'Find & replace…' are titled with the ellipsis " +
        "that means 'opens a dialog' and open none — they raise the Workbook panel. On a " +
        "document with no workbook loaded (the state a user searching Cmd+K for 'sort' is in) " +
        "that panel contains NO sort and NO find control at all: the command answers the search " +
        "by opening an empty room and saying nothing. Both controls only render after an import.",
    });
  });

  test("the in-frame grid commands and 'new cell style' refuse honestly with no lowered frame, and act once there is one", async ({
    page,
  }) => {
    const log: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (t.includes("media.paged.sheet")) log.push(t);
    });

    // No workbook, no frame → both refuse with a message that names the
    // missing precondition (the honest-degrade convention).
    await invoke(page, "media.paged.sheet.command.showGridInFrame");
    await expect
      .poll(() => log.some((l) => /showGridInFrame: no target frame/.test(l)), {
        timeout: 8_000,
      })
      .toBe(true);
    await invoke(page, "media.paged.sheet.command.hideGridInFrame");
    await invoke(page, "media.paged.sheet.command.styleFromCell");
    await expect
      .poll(() => log.some((l) => /styleFromCell:/.test(l)), { timeout: 8_000 })
      .toBe(true);

    // Import + lower, then the same commands have a target.
    await importWorkbook(page);
    await page.locator("[data-sheet-range]").fill("A1:B3");
    await page.locator("[data-sheet-lower]").click();
    await expect
      .poll(async () => (await selectedElement(page))?.kind ?? null, { timeout: 20_000 })
      .not.toBeNull();

    const mark = log.length;
    await invoke(page, "media.paged.sheet.command.showGridInFrame");
    await page.waitForTimeout(500);
    expect(
      log.slice(mark).filter((l) => /showGridInFrame: no target frame/.test(l)),
      "with a lowered frame, showGridInFrame no longer refuses",
    ).toEqual([]);
    await invoke(page, "media.paged.sheet.command.hideGridInFrame");
    await page.waitForTimeout(300);

    const styleMark = log.length;
    await invoke(page, "media.paged.sheet.command.styleFromCell");
    await expect
      .poll(() => log.slice(styleMark).some((l) => /styleFromCell:/.test(l)), {
        timeout: 8_000,
      })
      .toBe(true);
    // Whatever it reports, record it — this command has no visible
    // surface at all, so the log IS its outcome.
    test.info().annotations.push({
      type: "surface-finding",
      description:
        "styleFromCell outcome with a lowered frame: " +
        (log.slice(styleMark).find((l) => /styleFromCell:/.test(l)) ?? "(none)"),
    });
  });

  // ── 4. IMPORTER / EXPORTER ───────────────────────────────────────

  test("the .xlsx importer is wired into the host open door and loads a real workbook", async ({
    page,
  }) => {
    const wiring = await page.evaluate((mime) => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const entry = r.importers.list().find((i) => i.id === "media.paged.sheet.importer.xlsx");
      return {
        entry: entry ? { title: entry.title, ext: entry.extensions, mime: entry.mimeTypes ?? [] } : null,
        byName: r.importers.resolve("Budget.xlsx")?.id ?? null,
        byUpperName: r.importers.resolve("BUDGET.XLSX")?.id ?? null,
        byMime: r.importers.resolve("unknown", mime)?.id ?? null,
        accept: r.importers.acceptExtensions(),
      };
    }, XLSX_MIME);

    expect(wiring.entry).not.toBeNull();
    expect(wiring.entry!.ext).toEqual([".xlsx"]);
    expect(wiring.entry!.mime).toContain(XLSX_MIME);
    // Extension resolution is case-insensitive; both spellings a user
    // can produce reach the plugin.
    expect(wiring.byName).toBe(IMPORTER);
    expect(wiring.byUpperName).toBe(IMPORTER);
    expect(wiring.byMime).toBe(IMPORTER);
    // …and the File ▸ Open… picker offers the type (PagedShell folds
    // `acceptExtensions()` into the input's accept list).
    expect(wiring.accept).toContain(".xlsx");

    await importWorkbook(page);
    // A parsed workbook exposes its sheets + a default selected range.
    await expect(page.locator("[data-sheet-range]")).not.toHaveValue("");
  });

  test("the .xlsx exporter is registered and produces a real workbook", async ({
    page,
  }) => {
    const listed = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const e = r.exporters.list().find((x) => x.id === "media.paged.sheet.exporter.xlsx");
      return e ? { title: e.title, extension: e.extension } : null;
    });
    expect(listed).not.toBeNull();
    expect(listed!.extension).toBe(".xlsx");

    // No workbook → the exporter answers null rather than inventing one.
    const empty = await page.evaluate(async () => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const e = r.exporters.list().find((x) => x.id === "media.paged.sheet.exporter.xlsx") as
        | { export: () => Promise<{ bytes: Uint8Array } | null> | { bytes: Uint8Array } | null }
        | undefined;
      return (await e!.export()) === null;
    });
    expect(empty, "an exporter with nothing to export returns null").toBe(true);

    await importWorkbook(page);
    const out = await page.evaluate(async () => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const e = r.exporters.list().find((x) => x.id === "media.paged.sheet.exporter.xlsx") as
        | {
            export: () =>
              | Promise<{ bytes: Uint8Array; fileName: string } | null>
              | { bytes: Uint8Array; fileName: string }
              | null;
          }
        | undefined;
      const res = await e!.export();
      if (!res) return null;
      return {
        fileName: res.fileName,
        length: res.bytes.length,
        magic: Array.from(res.bytes.slice(0, 4)),
      };
    });
    expect(out, `${EXPORTER} produced bytes`).not.toBeNull();
    expect(out!.fileName).toMatch(/\.xlsx$/);
    expect(out!.length).toBeGreaterThan(1000);
    // XLSX is a ZIP: "PK\x03\x04".
    expect(out!.magic).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  // ── 5. EDIT CONTEXT ──────────────────────────────────────────────

  test("double-clicking a lowered sheet frame enters the 'sheet' edit context; Esc leaves", async ({
    page,
  }) => {
    const declared = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const ctx = r.editContexts.list().find((c) => c.type === "sheet");
      const obj = r.objectTypes.list().find((o) => o.type === "sheetFrame");
      return {
        entry: ctx?.entry ?? null,
        toolIds: ctx?.toolIds ?? null,
        panelIds: ctx?.panelIds ?? null,
        objectRoutesTo: obj?.editContextType ?? null,
      };
    });
    expect(declared.entry).toBe("doubleClick");
    expect(declared.objectRoutesTo, "sheetFrame routes to the sheet context").toBe("sheet");
    expect(declared.panelIds).toEqual([WORKBOOK_PANEL]);
    expect(declared.toolIds, "the sheet context restricts the rail to nothing").toEqual([]);

    // Import + lower so there is a bound frame on the page.
    await importWorkbook(page);
    await page.locator("[data-sheet-range]").fill("A1:B3");
    await page.locator("[data-sheet-lower]").click();
    let frame: ElementRef | null = null;
    await expect
      .poll(
        async () => {
          frame = await selectedElement(page);
          return frame?.kind ?? null;
        },
        { timeout: 20_000 },
      )
      .not.toBeNull();

    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    await expect(breadcrumb).toHaveCount(0);

    const at = await elementScreenCenter(page, frame!);
    expect(at, "the lowered frame has on-screen geometry").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);

    await expect(breadcrumb).toBeVisible({ timeout: 15_000 });
    await expect(breadcrumb.locator('[data-edit-context-crumb="sheet"]')).toHaveCount(1);
    // The context toolbar states where you are…
    await expect(page.locator("[data-context-toolbar]")).toHaveAttribute(
      "data-edit-context",
      "sheet",
    );
    // …and says out loud that the rail is empty ON PURPOSE (a blank rail
    // reads as a broken app; a sentence does not).
    await expect(page.locator("[data-context-segment]")).toContainText(
      "no canvas tools apply here",
    );
    // Every rail tool is dimmed, because `toolIds: []` restricts to
    // nothing. Picking one is an EXIT, not a dead end.
    for (const t of ["paged.tool.select", "paged.tool.type", "paged.tool.pen"]) {
      await expect(
        page.locator(`[data-tool-rail="ready"] [data-tool="${t}"]`),
        `${t} dims inside the sheet context`,
      ).toHaveAttribute("data-context-dimmed", "true");
    }

    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);
  });

  // ── 6. AUDIT — is any of this REACHABLE? ─────────────────────────

  test("AUDIT — paged.sheet contributes no tool, no menu item and no keybinding: creation is Cmd+K-only", async ({
    page,
  }) => {
    const reach = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const mine = (s: string) => s.startsWith("media.paged.sheet.");
      return {
        tools: r.tools.list().map((t) => t.id).filter(mine),
        // Other bundles DO put tools in the rail — so this is a choice
        // paged.sheet made, not a door the contract lacks.
        pluginToolsTotal: r.tools.list().filter((t) => t.id.startsWith("media.paged.")).length,
        menuItems: r.menus.list().filter((m) => mine(m.command)).map((m) => m.path),
        keybindings: r.keybindings.list().filter((k) => mine(k.command)).map((k) => k.key),
        // The K-8 panel-rail door (`rail: true` on a panel contribution)
        // would give the panels a launcher glyph. Nobody opted in.
        railPanels: r.panels.list().filter((p) => p.rail).map((p) => p.id),
      };
    });

    expect(reach.tools, "paged.sheet contributes no tool").toEqual([]);
    expect(
      reach.pluginToolsTotal,
      "other bundles do use the tool door, so this is a choice",
    ).toBeGreaterThan(10);
    // UPDATED 2026-08-22 by C1. This read `.toEqual([])` and was written
    // to go RED the day the exposure improved. It did.
    //
    // The list measures menu entries whose COMMAND belongs to
    // paged.sheet. The plugin still contributes none of its own — the
    // contract has twelve contribution types and `menu` is not among
    // them — so what is here is the HOST curating a front door onto the
    // plugin's own command, as it already did for paged.pdf.
    //
    // Note the door lands on `importXlsx`, the FIRST of sheet's two
    // creation steps. The second, `lowerToFrame`, is what actually puts
    // the sheet on the page and is still reachable only from Cmd+K under
    // a name ("Lower selection to frame") no designer would search for.
    expect(
      reach.menuItems,
      "the host curates one front door onto paged.sheet's first creation step",
    ).toEqual(["Object/Insert spreadsheet…"]);
    expect(reach.keybindings, "paged.sheet contributes no keybinding").toEqual([]);
    expect(reach.railPanels, "no panel opted into the K-8 rail launcher").toEqual([]);

    // The rail slot machinery exists and is populated by other plugins —
    // there is simply nothing in it that makes a spreadsheet.
    await expect(page.locator('[data-tool-rail="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-tool-rail="ready"] [data-tool^="media.paged.sheet."]'),
    ).toHaveCount(0);

    test.info().annotations.push({
      type: "surface-finding",
      description:
        "DEFECT (exposure): paged.sheet injects 12 commands, 3 panels, an importer and an " +
        "exporter and reaches the user through NO tool, NO menu item and NO keybinding. " +
        "Every verb is Cmd+K-only. The contract has a `tool` door (draw/image use it) and a " +
        "`rail: true` panel door (nobody uses it); it has no `menu` door at all, so the host " +
        "would have to curate an Insert/Sheet menu the way it already hand-curates " +
        "File ▸ Open PDF… for paged.pdf.",
    });
  });

  test("AUDIT — Window disables 'Workbook' until you are already in a sheet, while 'Grid' and 'Datasets' stay lit and unlabelled", async ({
    page,
  }) => {
    const openWindowMenu = async () => {
      await page
        .locator('nav[aria-label="Main menu"]')
        .getByRole("button", { name: "Window" })
        .click();
      await expect(page.getByRole("menuitem", { name: "Grid", exact: true })).toHaveCount(1);
    };

    await openWindowMenu();

    // ADR-024 `panelBelongsHere`: the sheet context CLAIMS the Workbook
    // panel (`panelIds: [workbook]`), and the context is not active, so
    // the item is offered dead.
    await expect(
      page.getByRole("menuitem", { name: "Workbook", exact: true }),
      "Window ▸ Workbook is disabled outside the sheet context",
    ).toHaveAttribute("aria-disabled", "true");

    // Grid and Datasets are claimed by NO context, so they stay live in
    // every document — including ones with no spreadsheet in them — and
    // their titles say nothing about belonging to paged.sheet.
    await expect(
      page.getByRole("menuitem", { name: "Grid", exact: true }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await expect(
      page.getByRole("menuitem", { name: "Datasets", exact: true }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");

    // The palette is NOT gated the same way: `paged.panel.show.*` carries
    // no `when`, so Cmd+K can open the Workbook panel from anywhere. The
    // two surfaces disagree about whether this panel applies.
    const paletteHasIt = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const id = "paged.panel.show.media.paged.sheet.panel.workbook";
      return Boolean(r.commands.get(id)) && !("when" in (r.commands.get(id) ?? {}));
    });
    expect(
      paletteHasIt,
      "Cmd+K can still open Workbook anywhere — the menu gate is not the command gate",
    ).toBe(true);

    // Now enter the sheet context and the same item comes alive.
    await importWorkbook(page);
    await page.locator("[data-sheet-range]").fill("A1:B3");
    await page.locator("[data-sheet-lower]").click();
    let frame: ElementRef | null = null;
    await expect
      .poll(
        async () => {
          frame = await selectedElement(page);
          return frame?.kind ?? null;
        },
        { timeout: 20_000 },
      )
      .not.toBeNull();
    const at = await elementScreenCenter(page, frame!);
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible({
      timeout: 15_000,
    });

    await openWindowMenu();
    await expect(
      page.getByRole("menuitem", { name: "Workbook", exact: true }),
      "inside the sheet context Window ▸ Workbook is live",
    ).not.toHaveAttribute("aria-disabled", "true");

    test.info().annotations.push({
      type: "surface-finding",
      description:
        "DEFECT (discoverability inversion): the ONE panel that explains paged.sheet — Workbook, " +
        "which also owns Sort and Find & Replace — is disabled in the Window menu until a sheet " +
        "edit context is already active, i.e. until the user has already found the feature. The " +
        "two panels that stay lit in every document, Grid and Datasets, carry titles that name " +
        "no owner. panelBelongsHere is right about Workbook belonging to a context and wrong " +
        "about what to do before that context can exist.",
    });
  });

  test("AUDIT — putting a spreadsheet on the page is two palette commands in sequence, and step two is called 'Lower selection to frame'", async ({
    page,
  }) => {
    const before = await countKind(page, "textFrame");

    // STEP ONE — import. The workbook loads, the panel opens… and the
    // page is untouched. Nothing a designer can see has happened.
    await importWorkbook(page);
    const afterImport = await countKind(page, "textFrame");
    expect(
      afterImport,
      "importing a workbook places NOTHING on the page",
    ).toBe(before);

    // STEP TWO — the second command. Only now does a frame appear.
    await invoke(page, "media.paged.sheet.command.lowerToFrame");
    await expect
      .poll(() => countKind(page, "textFrame"), { timeout: 20_000 })
      .toBe(before + 1);

    // What the user has to search Cmd+K for, verbatim.
    const titles = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const t = (id: string) => r.commands.get(id)?.title ?? null;
      return {
        step1: t("media.paged.sheet.command.importXlsx"),
        step2: t("media.paged.sheet.command.lowerToFrame"),
      };
    });
    expect(titles.step1).toBe("Import workbook (.xlsx)");
    expect(titles.step2).toBe("Lower selection to frame");
    // "lower" never appears in the first command's title, in the panel
    // button the picker leads to, or anywhere a user would look before
    // they already knew the word.
    expect(titles.step1!.toLowerCase()).not.toContain("lower");

    test.info().annotations.push({
      type: "surface-finding",
      description:
        "DEFECT (creation path): a spreadsheet reaches the page only via TWO palette commands in " +
        "sequence — 'Import workbook (.xlsx)' then 'Lower selection to frame'. Step one changes " +
        "nothing on the canvas, so there is no feedback that a second step exists; step two is " +
        "named with compiler vocabulary ('lower' = the IR-to-frame step) that no designer would " +
        "type into Cmd+K. The panel does carry a [data-sheet-lower] button, but the panel it " +
        "lives in is the one the Window menu disables (see the Window-menu audit above).",
    });
  });
});
