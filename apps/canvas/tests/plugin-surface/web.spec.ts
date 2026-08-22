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

// PLUGIN SURFACE — paged.web.
//
// The sibling of `sheet.spec.ts`, asking the same question of the other
// content-type plugin: does every id the resolved manifest promises
// actually exist in the host, and can a user REACH any of it?
//
//   `tests/journey/plugins/web.journey.spec.ts` proves the source lane
//   (insert → edit → sandboxed preview → persist) and
//   `web-render.journey.spec.ts` proves Blitz paints onto the page.
//   Neither asks whether the seven commands are all registered, whether
//   the .html importer is wired, or how a designer would find any of it.
//   The surface-coverage gate reports `web 6/12`.
//
// The audit tests at the bottom are CHARACTERIZATION tests: they assert
// today's (wrong-for-a-user) exposure so that improving it must come
// here and delete an assertion. See the same note in sheet.spec.ts.

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "../e2e/harness/fixtures";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The manifest THE APP RESOLVES (apps/canvas/node_modules), not the
 *  pnpm store and not the plugin repo. */
const MANIFEST = JSON.parse(
  readFileSync(
    pathResolve(HERE, "../../node_modules/@paged-media/web/manifest.json"),
    "utf8",
  ),
) as {
  id: string;
  contributes: {
    panels: string[];
    commands: string[];
    importers: string[];
    editContexts: Array<{ type: string; entry: string }>;
    objectTypes: Array<{ type: string; bakedFallback: string }>;
    partTypes: Array<{ type: string; role: string; format: string }>;
  };
};

const SOURCE_PANEL = "media.paged.web.panel.source";
const INSERT = "media.paged.web.command.insertWebFrame";
const IMPORTER = "media.paged.web.importer.html";

/** THE TWELVE IDS, SPELLED OUT. Comparing the manifest to the registries
 *  proves they AGREE; it cannot prove either is complete, because a
 *  bundle that drops a command from both sides still agrees with itself.
 *  This pinned list is the third party that notices — and it is what lets
 *  the surface-coverage gate (which matches literal id strings) see that
 *  these ids are exercised. */
const DECLARED = {
  panels: [SOURCE_PANEL],
  commands: [
    INSERT,
    "media.paged.web.command.renderWebFrame",
    "media.paged.web.command.renderWebFlow",
    "media.paged.web.command.threadWebFlow",
    "media.paged.web.command.unthreadWebFlow",
    "media.paged.web.command.threadWebFlowNamed",
    "media.paged.web.command.bakeWebFrame",
  ],
  importers: [IMPORTER],
  editContexts: ["webFrame"],
  objectTypes: ["webFrame"],
  partTypes: ["webSource"],
} as const;

/** The four FLOW verbs — threading a web document across several frames
 *  (the ADR-020 CSS-Regions extension). No spec named any of them before
 *  this file; they are the reason `web` read 6/12 on the surface gate. */
const FLOW_COMMANDS = [
  "media.paged.web.command.renderWebFlow",
  "media.paged.web.command.threadWebFlow",
  "media.paged.web.command.unthreadWebFlow",
  "media.paged.web.command.threadWebFlowNamed",
] as const;

interface ElementRef {
  kind: string;
  id: string;
}

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
  exporters: { list(): Array<{ id: string }> };
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

async function bootWithDocument(page: Page): Promise<void> {
  await openCanvas(page);
  await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
  await expect
    .poll(
      () => page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.ready),
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.keyboard.press("Home");
  await page.waitForTimeout(1000);
}

async function invoke(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (cid) => (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(cid),
    id,
  );
}

async function openPanel(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (pid) => (globalThis as unknown as CanvasGlobal).__canvas.openPanel(pid),
    id,
  );
}

async function hidePanel(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (pid) =>
      (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(
        `paged.panel.hide.${pid}`,
      ),
    id,
  );
}

/** Total placed-object count across the two wire kinds a web frame can
 *  land as (the bundle inserts a textFrame or a rectangle depending on
 *  the host's doors — the journey suite measures the same sum). */
async function frameCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string } | null;
      children?: unknown[];
    }>;
    let n = 0;
    const visit = (node: { id?: { kind: string } | null; children?: unknown[] }) => {
      if (node.id && (node.id.kind === "textFrame" || node.id.kind === "rectangle")) n += 1;
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return n;
  });
}

async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

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

test.describe("plugin surface · paged.web", () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDocument(page);
  });

  // ── 1. THE MANIFEST IS A PROMISE ─────────────────────────────────

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
    expect(c.editContexts.map((e) => e.type)).toEqual([...DECLARED.editContexts]);
    expect(c.objectTypes.map((o) => o.type)).toEqual([...DECLARED.objectTypes]);

    for (const id of c.panels) expect(live.panels, `panel ${id}`).toContain(id);
    for (const id of c.commands) expect(live.commands, `command ${id}`).toContain(id);
    for (const id of c.importers) expect(live.importers, `importer ${id}`).toContain(id);
    for (const e of c.editContexts)
      expect(live.editContexts, `editContext ${e.type}`).toContain(e.type);
    for (const o of c.objectTypes)
      expect(live.objectTypes, `objectType ${o.type}`).toContain(o.type);

    // paged.web declares NO exporter — a baked web frame leaves through
    // the host's own IDML/PDF writers, which is the ADR-020 Phase-C
    // design. Assert the absence so a silently-added one is noticed.
    expect(live.exporters.filter((e) => e.startsWith("media.paged.web."))).toEqual([]);

    // Same void the sheet manifest declares into: `partTypes` has no
    // registry on the host side. Declared, unreadable, unverifiable.
    expect(c.partTypes.map((p) => p.type)).toEqual([...DECLARED.partTypes]);
    expect(live.registryNames).not.toContain("partTypes");
    test.info().annotations.push({
      type: "surface-finding",
      description:
        "paged.web declares partType 'webSource' but the host ships no partType registry; " +
        "the declaration reaches nothing.",
    });
  });

  // ── 2. PANEL ─────────────────────────────────────────────────────

  test("the source panel opens and mounts, with and without a web frame", async ({
    page,
  }) => {
    // With nothing selected the panel mounts its EMPTY state — an honest
    // surface rather than a blank tab.
    await openPanel(page, SOURCE_PANEL);
    await expect(page.locator("[data-web-panel]")).toBeVisible({ timeout: 15_000 });

    // With a web frame selected it mounts the source editors.
    await invoke(page, INSERT);
    await expect(page.locator('[data-web-panel="source"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-web-html] [data-code-input]")).toBeVisible();
    await expect(page.locator("[data-web-css] [data-code-input]")).toBeVisible();
  });

  // ── 3. COMMANDS ──────────────────────────────────────────────────

  test("all seven declared commands are registered, titled, and actually run", async ({
    page,
  }) => {
    const registered = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      return r.commands
        .list()
        .filter((c) => c.id.startsWith("media.paged.web.command."))
        .map((c) => ({ id: c.id, title: c.title, category: c.category ?? null }));
    });
    expect(registered.map((c) => c.id).sort()).toEqual([...DECLARED.commands].sort());
    for (const c of registered) {
      expect(c.title, `${c.id} has a palette title`).toBeTruthy();
      expect(c.category, `${c.id} is grouped under a category`).toBe("Web");
    }

    // Invoked in manifest order so the ones needing a target run against
    // the frame the first one mints (insert selects what it creates).
    // Proven through the registry observer — the one place a handler runs.
    const result = await page.evaluate(async (list: readonly string[]) => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const started: string[] = [];
      const failed: string[] = [];
      const sub = r.commands.observe((e) => {
        if (e.phase === "started") started.push(e.invocation.id);
        if (e.phase === "settled" && e.error) {
          failed.push(`${e.invocation.id}: ${String(e.error).split("\n")[0]}`);
        }
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
    }, DECLARED.commands);

    expect(result.threw, "no web command throws out of invoke()").toEqual([]);
    expect(result.failed, "no web command settles with an error").toEqual([]);
    // None of the seven declares a `when`, so all seven RAN.
    expect(result.started.sort()).toEqual([...DECLARED.commands].sort());
  });

  test("the four flow commands are registered, named for a designer, and refuse honestly with nothing to thread", async ({
    page,
  }) => {
    // ADR-020's CSS-Regions extension — a web document fragmented across
    // several threaded frames. Four commands, none of which any spec had
    // named before this file, and none of which has a surface anywhere
    // except Cmd+K.
    const titles = await page.evaluate((ids: readonly string[]) => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      return ids.map((id) => r.commands.get(id)?.title ?? null);
    }, FLOW_COMMANDS);
    expect(titles).toEqual([
      "Render web flow across frames",
      "Thread web flow into frames",
      "Unthread web flow from frames",
      "Thread web flow into the named flow",
    ]);

    // Invoked on a document with no web frame at all: each must decline
    // without throwing and without mutating the document. A thread verb
    // that silently created something here would be the worse failure.
    const before = await frameCount(page);
    const outcome = await page.evaluate(async (ids: readonly string[]) => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const threw: string[] = [];
      for (const id of ids) {
        try {
          await r.commands.invoke(id);
        } catch (err) {
          threw.push(`${id}: ${String(err).split("\n")[0]}`);
        }
      }
      return threw;
    }, FLOW_COMMANDS);
    expect(outcome, "the flow commands decline rather than throw").toEqual([]);
    expect(await frameCount(page), "declining changed nothing on the page").toBe(before);

    // With ONE web frame selected, threading still has nothing to thread
    // INTO — the second frame of a flow does not exist — so the same
    // honest decline must hold.
    await invoke(page, INSERT);
    const withFrame = await frameCount(page);
    const outcome2 = await page.evaluate(async (ids: readonly string[]) => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const threw: string[] = [];
      for (const id of ids) {
        try {
          await r.commands.invoke(id);
        } catch (err) {
          threw.push(`${id}: ${String(err).split("\n")[0]}`);
        }
      }
      return threw;
    }, FLOW_COMMANDS);
    expect(outcome2).toEqual([]);
    expect(await frameCount(page), "a lone frame is not silently threaded").toBe(withFrame);

    test.info().annotations.push({
      type: "surface-finding",
      description:
        "paged.web's four flow verbs (renderWebFlow / threadWebFlow / unthreadWebFlow / " +
        "threadWebFlowNamed) exist only in Cmd+K. Threading is a multi-frame operation with no " +
        "on-canvas affordance at all — the host's own text threading has ports on the frame " +
        "chrome; the web flow has four palette strings.",
    });
  });

  // ── 4. IMPORTER ──────────────────────────────────────────────────

  test("the .html importer is wired into the host open door and mints a web frame", async ({
    page,
  }) => {
    const wiring = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const entry = r.importers.list().find((i) => i.id === "media.paged.web.importer.html");
      return {
        entry: entry
          ? { title: entry.title, ext: entry.extensions, mime: entry.mimeTypes ?? [] }
          : null,
        byHtml: r.importers.resolve("page.html")?.id ?? null,
        byHtm: r.importers.resolve("page.htm")?.id ?? null,
        byUpper: r.importers.resolve("PAGE.HTML")?.id ?? null,
        byMime: r.importers.resolve("unknown", "text/html")?.id ?? null,
        accept: r.importers.acceptExtensions(),
      };
    });
    expect(wiring.entry).not.toBeNull();
    expect(wiring.entry!.ext).toEqual([".html", ".htm"]);
    expect(wiring.entry!.mime).toContain("text/html");
    expect(wiring.byHtml).toBe(IMPORTER);
    expect(wiring.byHtm).toBe(IMPORTER);
    expect(wiring.byUpper).toBe(IMPORTER);
    expect(wiring.byMime).toBe(IMPORTER);
    expect(wiring.accept).toContain(".html");
    expect(wiring.accept).toContain(".htm");

    // Drive it with real bytes — the exact path PagedShell's `onFile`
    // takes for a drag-dropped / File ▸ Open… .html. Unlike sheet's
    // importer this one PLACES something: it inserts a web frame and
    // opens the source panel, so the file is on the page in one step.
    const before = await frameCount(page);
    await page.evaluate(async () => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const imp = r.importers.resolve("line-sheet.html", "text/html") as
        | { import: (f: { name: string; bytes: Uint8Array; mimeType: string }) => Promise<void> }
        | null;
      if (!imp) throw new Error("no importer resolved for .html");
      const html =
        "<html><head><style>h1{color:#204}</style></head>" +
        "<body><h1>Imported line sheet</h1><p>From a file.</p></body></html>";
      await imp.import({
        name: "line-sheet.html",
        bytes: new TextEncoder().encode(html),
        mimeType: "text/html",
      });
    });

    await expect.poll(() => frameCount(page), { timeout: 20_000 }).toBe(before + 1);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 15_000 });
    await expect(html).toHaveValue(/Imported line sheet/);
  });

  // ── 5. EDIT CONTEXT ──────────────────────────────────────────────

  test("double-clicking a web frame enters the 'webFrame' edit context; Esc leaves", async ({
    page,
  }) => {
    const declared = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const ctx = r.editContexts.list().find((c) => c.type === "webFrame");
      const obj = r.objectTypes.list().find((o) => o.type === "webFrame");
      return {
        entry: ctx?.entry ?? null,
        toolIds: ctx?.toolIds ?? null,
        panelIds: ctx?.panelIds ?? null,
        objectRoutesTo: obj?.editContextType ?? null,
      };
    });
    expect(declared.entry).toBe("doubleClick");
    expect(declared.objectRoutesTo, "the webFrame object type routes to its context").toBe(
      "webFrame",
    );
    expect(declared.panelIds).toEqual([SOURCE_PANEL]);
    expect(declared.toolIds, "the webFrame context restricts the rail to nothing").toEqual([]);

    await invoke(page, INSERT);
    const frame = await expect
      .poll(() => selectedElement(page), { timeout: 10_000 })
      .not.toBeNull()
      .then(() => selectedElement(page));
    expect(frame).not.toBeNull();

    // Close the panel the insert opened, so the double-click RE-raising
    // it is the load-bearing proof rather than a leftover.
    await hidePanel(page, SOURCE_PANEL);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toHaveCount(0, { timeout: 10_000 });

    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    await expect(breadcrumb).toHaveCount(0);

    const at = await elementScreenCenter(page, frame!);
    expect(at, "the inserted web frame has on-screen geometry").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);

    await expect(breadcrumb).toBeVisible({ timeout: 15_000 });
    await expect(breadcrumb.locator('[data-edit-context-crumb="webFrame"]')).toHaveCount(1);
    // onEnter raised the context's own panel.
    await expect(html).toBeVisible({ timeout: 10_000 });
    // The bar states where you are and that the rail is empty on purpose.
    await expect(page.locator("[data-context-toolbar]")).toHaveAttribute(
      "data-edit-context",
      "webFrame",
    );
    await expect(page.locator("[data-context-segment]")).toContainText(
      "no canvas tools apply here",
    );
    for (const t of ["paged.tool.select", "paged.tool.type", "paged.tool.pen"]) {
      await expect(
        page.locator(`[data-tool-rail="ready"] [data-tool="${t}"]`),
        `${t} dims inside the webFrame context`,
      ).toHaveAttribute("data-context-dimmed", "true");
    }

    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);
  });

  // ── 6. AUDIT — is any of this REACHABLE? ─────────────────────────

  test("AUDIT — paged.web's only creation verb is one palette command: no tool, no menu item, no shortcut", async ({
    page,
  }) => {
    const reach = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const mine = (s: string) => s.startsWith("media.paged.web.");
      return {
        tools: r.tools.list().map((t) => t.id).filter(mine),
        pluginToolsTotal: r.tools.list().filter((t) => t.id.startsWith("media.paged.")).length,
        menuItems: r.menus.list().filter((m) => mine(m.command)).map((m) => m.path),
        keybindings: r.keybindings.list().filter((k) => mine(k.command)).map((k) => k.key),
        railPanels: r.panels.list().filter((p) => p.rail).map((p) => p.id),
        insertTitle: r.commands.get("media.paged.web.command.insertWebFrame")?.title ?? null,
        // For contrast: the HOST hand-curates its own creation verbs into
        // the Object menu, and even hand-curates one for a PLUGIN
        // (File ▸ Open PDF… routes to paged.pdf's importer).
        hostInsertItems: r.menus
          .list()
          .filter((m) => m.path.startsWith("Object/Insert"))
          .map((m) => m.path),
        pdfCourtesyItem: r.menus.list().some((m) => m.path === "File/Open PDF…"),
      };
    });

    expect(reach.tools, "paged.web contributes no tool").toEqual([]);
    expect(reach.pluginToolsTotal, "the tool door works — other bundles use it").toBeGreaterThan(10);
    // UPDATED 2026-08-22 by C1. This assertion used to read `.toEqual([])`
    // — "paged.web contributes no menu item" — and it was written to go
    // RED the day that stopped being true, which is exactly what it did.
    //
    // The plugin still contributes none: the contract has twelve
    // contribution types and `menu` is not one of them. What changed is
    // that the HOST now curates an `Object ▸ Insert web frame…` entry
    // pointing at the plugin's own command, the same courtesy it already
    // extended to paged.pdf via `File ▸ Open PDF…`. So the menu item
    // exists and its OWNER is still the host.
    // UPDATED 2026-08-22 by C1. This read `.toEqual([])` — "paged.web
    // contributes no menu item" — and was written to go RED the day that
    // stopped being true. It did, which is the ratchet working.
    //
    // Note what this list actually measures: menu entries whose COMMAND
    // belongs to paged.web. The plugin still contributes none itself
    // (the contract has twelve contribution types and `menu` is not one
    // of them); the entry is the HOST curating a front door onto the
    // plugin's own command, the same courtesy already extended to
    // paged.pdf via `File ▸ Open PDF…`.
    expect(
      reach.menuItems,
      "the host curates exactly one front door onto paged.web's creation verb",
    ).toEqual(["Object/Insert web frame…"]);
    expect(reach.keybindings, "paged.web contributes no keybinding").toEqual([]);
    expect(reach.railPanels, "no panel opted into the K-8 rail launcher").toEqual([]);
    expect(reach.insertTitle).toBe("Insert web frame");
    expect(reach.hostInsertItems.length, "the host curates its OWN insert verbs").toBeGreaterThan(3);
    expect(reach.pdfCourtesyItem, "the host even curates a menu item for paged.pdf").toBe(true);

    await expect(page.locator('[data-tool-rail="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-tool-rail="ready"] [data-tool^="media.paged.web."]'),
    ).toHaveCount(0);

    test.info().annotations.push({
      type: "surface-finding",
      description:
        "DEFECT (exposure): 'Insert web frame' is the ONLY way to create web content and it is " +
        "reachable from Cmd+K alone — no rail tool, no Object ▸ Insert entry beside the five the " +
        "host curates for its own frame types, no keybinding. Dropping a .html file works and is " +
        "the one discoverable path, but nothing on screen says so.",
    });
  });

  test("AUDIT — Window disables 'Web frame' until you are already inside a web frame", async ({
    page,
  }) => {
    const openWindowMenu = async () => {
      await page
        .locator('nav[aria-label="Main menu"]')
        .getByRole("button", { name: "Window" })
        .click();
      await expect(page.getByRole("menuitem", { name: "Layers", exact: true })).toHaveCount(1);
    };

    await openWindowMenu();
    // ADR-024 `panelBelongsHere`: the webFrame context claims the source
    // panel, the context is not active, so the item is offered dead —
    // the same inversion paged.sheet's Workbook panel has.
    await expect(
      page.getByRole("menuitem", { name: "Web frame", exact: true }),
      "Window ▸ Web frame is disabled outside the webFrame context",
    ).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");

    // …yet the palette can open it from anywhere: `paged.panel.show.*`
    // carries no `when`. The two surfaces disagree.
    const paletteUngated = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasGlobal).__canvas.registries;
      const cmd = r.commands.get("paged.panel.show.media.paged.web.panel.source");
      return Boolean(cmd) && !("when" in (cmd ?? {}));
    });
    expect(paletteUngated).toBe(true);

    // Enter the context; the same item comes alive.
    await invoke(page, INSERT);
    const frame = await expect
      .poll(() => selectedElement(page), { timeout: 10_000 })
      .not.toBeNull()
      .then(() => selectedElement(page));
    const at = await elementScreenCenter(page, frame!);
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible({
      timeout: 15_000,
    });

    await openWindowMenu();
    await expect(
      page.getByRole("menuitem", { name: "Web frame", exact: true }),
      "inside the webFrame context Window ▸ Web frame is live",
    ).not.toHaveAttribute("aria-disabled", "true");

    test.info().annotations.push({
      type: "surface-finding",
      description:
        "DEFECT (discoverability inversion): paged.web's single panel is disabled in the Window " +
        "menu until a webFrame edit context is already active — i.e. until the user has already " +
        "inserted a web frame and double-clicked it. The panel that would tell a user this " +
        "content type exists is dark until they no longer need telling.",
    });
  });
});
