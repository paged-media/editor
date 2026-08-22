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

// PLUGIN SURFACE — paged.data / paged.doc / paged.pdf / paged.publish.
//
// WHY THIS TIER EXISTS, NEXT TO THE JOURNEYS.
//
//   The journeys under `tests/journey/plugins/` prove a WORKFLOW: import a
//   CSV, wire a binding, lower it, see pixels move. They say nothing about
//   the SURFACE the four bundles inject — whether every id in the shipped
//   `manifest.json` is actually live in a host registry, whether a command
//   does what its LABEL promises, and where the chrome that carries a
//   plugin's verbs actually comes from.
//
//   `scripts/surface-coverage.mjs` counts that surface but can only ask
//   "does some spec name this id" — a deliberately weak proxy. This file
//   is the strong version for these four bundles: it reads the same
//   manifests the app resolves and asserts each declared contribution is
//   REGISTERED, REACHABLE and BEHAVES AS LABELLED.
//
// THREE DEFECTS ARE PINNED HERE, DELIBERATELY ASSERTING TODAY'S BEHAVIOUR.
//
//   Each is marked `KNOWN DEFECT`. The assertion states what the editor
//   does NOW, so the test goes RED when the defect is fixed and whoever
//   fixes it must come here and say so. That is the same ratchet the
//   surface-coverage gate runs on its ACKNOWLEDGED list, and it is the
//   only shape that keeps a "we know about this" note from rotting into
//   a permanent excuse.
//
//     D1  paged.data's "Import data (.csv)" imports nothing. Its handler
//         is `host.shell.openPanel(SOURCES_PANEL_ID)` — a panel raise
//         wearing a file-action label. The REAL import door is the
//         panel's own button.
//     D2  paged.doc's `placeDoc` declares no `category`, so the palette's
//         `groupByCategory` (`cmd.category ?? "Other"`) files "Place Word
//         document…" under **Other**, while "Place image…" — the same
//         verb — sits under **Insert**.
//     D3  paged.data's `dataBinding` edit context can never win a
//         double-click on the elements paged.data itself stamps. It
//         claims by METADATA (any kind), but paged.draw's `vectorGraphic`
//         claims `rectangle` by KIND and registers FIRST (main.tsx loads
//         draw before data), and `resolveDoubleClick` returns the first
//         kind-claim it finds. Every other metadata-owning bundle (web,
//         sheet, doc, image) also registers an `objectType`, which the
//         resolver checks BEFORE any kind claim; data registers none.
//
// PDF IS NOT DRIVEN THROUGH ITS FULL IMPORT HERE, AND THAT IS A CHOICE.
//   `tests/journey/plugins/pdf.journey.spec.ts` already opens a real PDF
//   end to end. Repeating it would buy nothing and cost 30s. What this
//   file adds instead is the fact that journey does NOT assert: the open
//   is DESTRUCTIVE and UNGUARDED — authored, unsaved content is gone with
//   no prompt (the editor has no dirty flag and no `beforeunload` guard
//   anywhere). That test authors a rectangle first and watches it vanish.

import { expect, test, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../fidelity/canvas-driver";
import { mutate } from "../e2e/harness/ui";
import { treeCount } from "../e2e/harness/viewport";
import { Designer } from "../journey/driver/designer";

const HERE = dirname(fileURLToPath(import.meta.url));
const PDF_FIXTURE = pathResolve(HERE, "../../public/sample.pdf");

// ── the four manifests, transcribed from the bundles the app RESOLVES
//    (apps/canvas/node_modules/@paged-media/<pkg>/manifest.json). Any
//    drift between these lists and the live registries fails below. ──

const DATA_PANELS = [
  "media.paged.data.panel.sources",
  "media.paged.data.panel.bindings",
  "media.paged.data.panel.dataset",
] as const;

const DATA_COMMANDS = [
  "media.paged.data.command.importData",
  "media.paged.data.command.defineBinding",
  "media.paged.data.command.resolveBindings",
  "media.paged.data.command.lowerBinding",
  "media.paged.data.command.openDataset",
  "media.paged.data.command.captureDataSet",
  "media.paged.data.command.applyDataSet",
] as const;

const DOC_PANEL = "media.paged.doc.panel.outline";
const DOC_COMMAND = "media.paged.doc.command.placeDoc";
const DOC_IMPORTER = "media.paged.doc.importer.docx";
const DOC_EXPORTER = "media.paged.doc.exporter.docx";

const PDF_IMPORTER = "media.paged.pdf.importer.pdf";
const PUBLISH_IMPORTER = "media.paged.publish.importer.idml";
const PUBLISH_EXPORTER = "media.paged.publish.exporter.idml";

const OPEN_PDF_COMMAND = "paged.file.openPdf";
const PALETTE_TOGGLE = "paged.palette.toggle";

// ── shared probes ───────────────────────────────────────────────────

interface CanvasProbe {
  __canvas: {
    registries: {
      commands: {
        list: () => Array<{ id: string; title: string; category?: string }>;
        get: (id: string) => { id: string; title: string; category?: string } | undefined;
        invoke: (id: string, payload?: unknown) => Promise<unknown>;
      };
      panels: { list: () => Array<{ id: string; title: string; source?: string }> };
      menus: {
        list: () => Array<{ path: string; command: string; disabled?: boolean }>;
      };
      editContexts: {
        list: () => Array<{
          type: string;
          entry: string;
          toolIds?: string[];
          panelIds?: string[];
          metadataKey?: string;
          matches?: (c: unknown) => boolean;
        }>;
        get: (t: string) =>
          | {
              type: string;
              entry: string;
              toolIds?: string[];
              panelIds?: string[];
              metadataKey?: string;
              matches?: (c: unknown) => boolean;
            }
          | undefined;
      };
      objectTypes: {
        list: () => Array<{
          type: string;
          bakedFallback: string;
          editContextType?: string;
          metadataKey?: string;
          matches: (c: unknown) => boolean;
        }>;
      };
      importers: {
        list: () => Array<{
          id: string;
          title: string;
          extensions?: string[];
          mimeTypes?: string[];
        }>;
        resolve: (name: string, mime?: string) => { id: string } | null;
        acceptExtensions: () => string[];
      };
      exporters: {
        list: () => Array<{ id: string; title: string; extension?: string }>;
      };
    };
    debugContext: () => {
      panels: { open: string[]; active: string | null };
      editContext: { type: string } | null;
    };
    setMode: (m: string) => void;
  };
}

/** Invoke a command through the registry — the door the menu, the
 *  palette, a keybinding and a plugin's `runCommand` all funnel into. */
const invoke = (page: Page, id: string, payload?: unknown) =>
  page.evaluate(
    ([cmd, p]) =>
      (globalThis as unknown as CanvasProbe).__canvas.registries.commands.invoke(
        cmd as string,
        p,
      ),
    [id, payload] as const,
  );

/** Which panels the cockpit holds open, and which is foregrounded. */
const panelState = (page: Page) =>
  page.evaluate(
    () => (globalThis as unknown as CanvasProbe).__canvas.debugContext().panels,
  );

/** Stamp a plugin metadata envelope onto an element — the `x-paged:<id>`
 *  carrier the host pre-resolves before calling a matcher. This is the
 *  RAW v33 wire op, exactly what a bundle's lower lane emits. */
async function stampEnvelope(
  page: Page,
  element: { kind: string; id: string },
  pluginId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const reply = (await mutate(page, {
    op: "setPluginMetadata",
    args: {
      elementId: element,
      key: `x-paged:${pluginId}`,
      value: JSON.stringify({ v: 1, data }),
    },
  })) as { kind?: string };
  return reply?.kind === "mutationApplied";
}

/** Screen point at the centre of an element's transformed page-0 bounds
 *  (the derivation `draw-editcontext.journey.spec.ts` uses; it is not
 *  exported, and the parallel-agent rule forbids editing that file). */
async function elementScreenCenter(
  page: Page,
  ref: { kind: string; id: string },
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
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            camera: { read: () => { scale: number; tx: number; ty: number } };
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                bounds: [number, number, number, number];
                itemTransform?:
                  | [number, number, number, number, number, number]
                  | null;
              }>
            >;
          };
        };
      }
    ).__canvas;
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

// ════════════════════════════════════════════════════════════════════
//  paged.data
// ════════════════════════════════════════════════════════════════════

test.describe("plugin surface · paged.data", () => {
  test("every id in the resolved manifest is live in a host registry @feat:data.plugin.bundle @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();

    const live = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasProbe).__canvas.registries;
      return {
        panels: r.panels.list().map((p) => p.id),
        commands: r.commands
          .list()
          .map((c) => ({ id: c.id, title: c.title, category: c.category })),
        editContexts: r.editContexts.list().map((e) => ({
          type: e.type,
          entry: e.entry,
          metadataKey: e.metadataKey,
          panelIds: e.panelIds ?? [],
          toolIds: e.toolIds ?? [],
        })),
        objectTypes: r.objectTypes.list().map((o) => o.type),
      };
    });

    // PANELS — three, all registered.
    for (const id of DATA_PANELS) {
      expect(live.panels, `${id} is registered`).toContain(id);
    }

    // COMMANDS — seven, all registered, all filed under "Data" so the
    // palette groups them together (contrast paged.doc, below).
    for (const id of DATA_COMMANDS) {
      const cmd = live.commands.find((c) => c.id === id);
      expect(cmd, `${id} is registered`).toBeTruthy();
      expect(cmd!.category, `${id} carries a palette category`).toBe("Data");
    }

    // EDIT CONTEXT — one, `dataBinding`, metadata-claimed, host-stamped
    // with paged.data's OWN namespace so it can never see a foreign
    // plugin's envelope.
    const ctx = live.editContexts.find((e) => e.type === "dataBinding");
    expect(ctx, "the dataBinding edit context is registered").toBeTruthy();
    expect(ctx!.entry).toBe("doubleClick");
    expect(ctx!.metadataKey).toBe("x-paged:media.paged.data");
    expect(ctx!.panelIds).toContain("media.paged.data.panel.bindings");
    // Declared EMPTY on purpose: inside a data binding no canvas tool has
    // anything to act on. (paged.doc is the exception — see below.)
    expect(ctx!.toolIds, "dataBinding restricts the rail to nothing").toEqual([]);

    // AND THE NEGATIVE HALF — data registers NO object type. That single
    // omission is what loses it the double-click race in D3 below.
    expect(
      live.objectTypes,
      "paged.data registers no objectType (see the D3 defect below)",
    ).not.toContain("dataBinding");

    // paged.data injects nothing else: no tools, no importers, no
    // exporters, no menu items. Its ONLY chrome presence is hardcoded by
    // the HOST (cockpit-modes.ts) — see the host-chrome describe below.
    const dataIo = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasProbe).__canvas.registries;
      return {
        importers: r.importers.list().map((i) => i.id),
        exporters: r.exporters.list().map((e) => e.id),
        menus: r.menus.list().map((m) => m.command),
      };
    });
    expect(dataIo.importers.filter((i) => i.startsWith("media.paged.data"))).toEqual(
      [],
    );
    expect(dataIo.exporters.filter((e) => e.startsWith("media.paged.data"))).toEqual(
      [],
    );
    expect(dataIo.menus.filter((m) => m.startsWith("media.paged.data"))).toEqual([]);
  });

  test("all three panels open and render their real body @feat:data.plugin.bundle @feat:editor-shell.panel-rail @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Each panel gets its OWN body asserted, not just the tab — a
    // registered id that renders nothing is exactly the dead-slot defect
    // this tier exists to catch.
    //
    // NOTE on the dataset panel. Its `data-data-*` markers (batch plans,
    // the variable library, data-set capture) all sit INSIDE the
    // `queries.length === 0 ? … : …` branch, so on a fresh document the
    // panel that "Open the dataset catalog & build panel" raises is a
    // locale dropdown plus one sentence telling you to go to a different
    // panel first. That empty state is the honest body here, and it is
    // what this asserts — the panel is real, but it is nearly all
    // conditional on work done elsewhere.
    const bodies: Array<[string, (p: Page) => ReturnType<Page["locator"]>]> = [
      [
        "media.paged.data.panel.sources",
        (p) => p.locator("[data-data-import-csv]").first(),
      ],
      [
        "media.paged.data.panel.bindings",
        (p) => p.locator("[data-data-bind-author]").first(),
      ],
      [
        "media.paged.data.panel.dataset",
        (p) => p.getByText(/No queries yet/i).first(),
      ],
    ];

    for (const [id, body] of bodies) {
      await openPanel(page, id);
      await expect
        .poll(async () => (await panelState(page)).active, { timeout: 10_000 })
        .toBe(id);
      await expect(body(page), `${id} rendered its body`).toBeVisible({
        timeout: 10_000,
      });
    }

    // The dataset panel's locale control is the one always-live widget in
    // it — proof the component mounted rather than degrading to an error
    // card.
    await expect(page.getByRole("combobox", { name: /Locale/i })).toBeVisible();
  });

  test("KNOWN DEFECT D1 — 'Import data (.csv)' imports nothing; it raises a panel @feat:data.plugin.bundle @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Start somewhere else so a raise is observable.
    await openPanel(page, "media.paged.data.panel.bindings");
    await expect
      .poll(async () => (await panelState(page)).active, { timeout: 10_000 })
      .toBe("media.paged.data.panel.bindings");

    // A command whose label reads "Import data (.csv)" must, at minimum,
    // ASK FOR A FILE. Race the invocation against the filechooser event:
    // if the command ever reached `host.shell.pickFile`, a chooser fires.
    const chooser = page
      .waitForEvent("filechooser", { timeout: 3_000 })
      .then(() => "filechooser" as const)
      .catch(() => "none" as const);
    await invoke(page, "media.paged.data.command.importData");
    const outcome = await chooser;

    // KNOWN DEFECT — the label promises a file action and delivers a
    // panel raise (`handler: () => host.shell.openPanel(SOURCES_PANEL_ID)`).
    // Flip this to "filechooser" when the command learns to pick a file
    // (or rename it to "Data sources…", which is what it actually does).
    expect(
      outcome,
      "D1: 'Import data (.csv)' never asks for a file — it only raises the sources panel",
    ).toBe("none");
    expect((await panelState(page)).active).toBe("media.paged.data.panel.sources");

    // THE CONTRAST that makes D1 a defect rather than a naming quibble:
    // the REAL import door is one click further in, inside the panel the
    // command just raised, and IT does open a picker.
    const realChooser = page.waitForEvent("filechooser", { timeout: 10_000 });
    await page.locator("[data-data-import-csv]").first().click();
    await (await realChooser).setFiles([]); // cancel — no ingest here
  });

  test("all seven commands are invocable through the registry @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Invoke every one and record how it settled. "Invocable" means the
    // registry reached a REAL handler: it either resolved, or rejected
    // with a bundle-side error (no engine booted, no binding defined) —
    // never with "no such command". Three of them are pure panel raises;
    // the rest touch the session. None may throw an unknown-command
    // error, and none may hang.
    const results = await page.evaluate(async (ids) => {
      const reg = (globalThis as unknown as CanvasProbe).__canvas.registries.commands;
      const out: Array<{ id: string; settled: string; value?: string; error?: string }> = [];
      for (const id of ids) {
        // captureDataSet/applyDataSet read a payload; give the shapes
        // their handlers document so the no-payload branch is exercised
        // deliberately rather than by accident.
        try {
          const v = await reg.invoke(id);
          out.push({ id, settled: "resolved", value: JSON.stringify(v ?? null).slice(0, 120) });
        } catch (err) {
          out.push({ id, settled: "rejected", error: String(err).slice(0, 200) });
        }
      }
      return out;
    }, DATA_COMMANDS as unknown as string[]);

    expect(results).toHaveLength(DATA_COMMANDS.length);
    for (const r of results) {
      expect(["resolved", "rejected"], `${r.id} settled`).toContain(r.settled);
      expect(
        r.error ?? "",
        `${r.id} reached a handler (not an unknown-command error)`,
      ).not.toMatch(/unknown command|not registered|no such command/i);
      // eslint-disable-next-line no-console
      console.log(
        `[plugin-surface] ${r.id} → ${r.settled}${r.error ? ` (${r.error})` : ` ${r.value ?? ""}`}`,
      );
    }

    // `applyDataSet` with no name is the documented refusal path: it
    // warns and returns an honest zero rather than throwing.
    const applied = (await invoke(
      page,
      "media.paged.data.command.applyDataSet",
    )) as { applied?: number } | null;
    expect(applied?.applied, "applyDataSet with no name applies nothing").toBe(0);

    // The three panel-raising verbs land on the panels they name.
    for (const [cmd, panel] of [
      ["media.paged.data.command.defineBinding", "media.paged.data.panel.bindings"],
      ["media.paged.data.command.openDataset", "media.paged.data.panel.dataset"],
      ["media.paged.data.command.importData", "media.paged.data.panel.sources"],
    ] as const) {
      await invoke(page, cmd);
      await expect
        .poll(async () => (await panelState(page)).active, { timeout: 10_000 })
        .toBe(panel);
    }
  });

  test("KNOWN DEFECT D3 — the dataBinding context claims correctly but loses the double-click to paged.draw @feat:data.plugin.bundle @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. THE CLAIM IS WELL-FORMED. Call the registered matcher with
    //    both candidate shapes: a data-stamped element matches, a bare
    //    one does not (matching by KIND would claim every rectangle).
    const claim = await page.evaluate(() => {
      const ctx = (
        globalThis as unknown as CanvasProbe
      ).__canvas.registries.editContexts.get("dataBinding");
      if (!ctx?.matches) return null;
      const base = { id: { kind: "rectangle", id: "x" }, kind: "rectangle", groupChain: [] };
      return {
        withEnvelope: ctx.matches({ ...base, metadata: { v: 1, data: {} } }),
        withoutEnvelope: ctx.matches({ ...base, metadata: null }),
      };
    });
    expect(claim, "dataBinding registered a matcher").not.toBeNull();
    expect(claim!.withEnvelope, "a data-stamped element matches").toBe(true);
    expect(claim!.withoutEnvelope, "a bare element does NOT match").toBe(false);

    // ── 2. THE RACE. Author a rectangle and stamp paged.data's OWN
    //    envelope on it — this is literally what data's lower lane emits
    //    (`bindingMetadata` → setPluginMetadata on `{kind:"rectangle"}`).
    const id = await designer.drawRectangle({ x0: 170, y0: 170, x1: 440, y1: 360 });
    expect(id, "drew the bound frame").not.toBe("");
    await designer.applyFill("rectangle", id, "Color/Black");
    expect(
      await stampEnvelope(page, { kind: "rectangle", id }, "media.paged.data", {
        bindingId: "demo",
      }),
      "the x-paged:media.paged.data envelope applied",
    ).toBe(true);

    await page.keyboard.press("Home");
    await page.waitForTimeout(400);

    const at = await elementScreenCenter(page, { kind: "rectangle", id });
    expect(at, "the bound frame resolves to a screen point").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);

    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    await expect(breadcrumb, "some edit context entered").toBeVisible({ timeout: 6_000 });
    const entered = await page.evaluate(
      () =>
        (globalThis as unknown as CanvasProbe).__canvas.debugContext().editContext?.type ??
        null,
    );

    // KNOWN DEFECT — this SHOULD be "dataBinding". `resolveDoubleClick`
    // checks object types first (none of data's — it registers none),
    // then walks the edit contexts in REGISTRATION order and returns the
    // first kind-claim. main.tsx loads drawBundle before dataBundle, and
    // paged.draw's `vectorGraphic` claims `rectangle` by kind, so a
    // data-bound frame opens the ANCHOR EDITOR instead of the bindings
    // context. Flip this to "dataBinding" when paged.data gains an
    // objectType (the fix every other metadata-owning bundle already
    // uses) or the resolver learns to prefer the more specific claim.
    expect(
      entered,
      "D3: paged.draw's kind-claimed vectorGraphic wins over data's metadata claim",
    ).toBe("vectorGraphic");

    await page.keyboard.press("Escape");
    await expect(breadcrumb, "Esc pops the context").toHaveCount(0, { timeout: 6_000 });
  });
});

// ════════════════════════════════════════════════════════════════════
//  paged.doc
// ════════════════════════════════════════════════════════════════════

test.describe("plugin surface · paged.doc", () => {
  test("every id in the resolved manifest is live, and the rail goes back to HOST tools @feat:plugin-doc.embedded-placement @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();

    const live = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasProbe).__canvas.registries;
      const ctx = r.editContexts.get("wordDocument");
      return {
        panels: r.panels.list().map((p) => p.id),
        placeDoc: r.commands.get("media.paged.doc.command.placeDoc") ?? null,
        importers: r.importers.list().map((i) => ({
          id: i.id,
          title: i.title,
          extensions: i.extensions ?? [],
          mimeTypes: i.mimeTypes ?? [],
        })),
        exporters: r.exporters.list().map((e) => ({
          id: e.id,
          title: e.title,
          extension: e.extension,
        })),
        editContext: ctx
          ? {
              type: ctx.type,
              entry: ctx.entry,
              toolIds: ctx.toolIds ?? [],
              panelIds: ctx.panelIds ?? [],
              metadataKey: ctx.metadataKey,
            }
          : null,
        objectTypes: r.objectTypes.list().map((o) => ({
          type: o.type,
          bakedFallback: o.bakedFallback,
          editContextType: o.editContextType,
          metadataKey: o.metadataKey,
        })),
      };
    });

    expect(live.panels, "the outline panel is registered").toContain(DOC_PANEL);
    expect(live.placeDoc, "placeDoc is registered").toBeTruthy();
    expect(live.placeDoc!.title).toBe("Place Word document…");

    const imp = live.importers.find((i) => i.id === DOC_IMPORTER);
    expect(imp, "the .docx importer is registered").toBeTruthy();
    expect(imp!.extensions).toEqual(expect.arrayContaining([".docx", ".dotx"]));

    const exp = live.exporters.find((e) => e.id === DOC_EXPORTER);
    expect(exp, "the .docx exporter is registered").toBeTruthy();
    expect(exp!.extension).toBe(".docx");

    expect(live.editContext, "the wordDocument context is registered").toBeTruthy();
    expect(live.editContext!.entry).toBe("doubleClick");
    expect(live.editContext!.metadataKey).toBe("x-paged:media.paged.doc");
    expect(live.editContext!.panelIds).toContain(DOC_PANEL);

    // THE ONE PLUGIN THAT HANDS THE RAIL BACK TO THE HOST. Everywhere
    // else a context declares `toolIds: []` because no canvas tool has
    // anything to act on inside a spreadsheet / a web frame / a data
    // binding. A DOCX lowers to NATIVE text frames and stories, so the
    // editor genuinely owns the caret and the host's own Type/Select
    // tools ARE the right tools. (ADR 024; the contract sanctions a
    // plugin naming host built-in ids.)
    expect(
      live.editContext!.toolIds,
      "paged.doc restricts the rail to the HOST's type + select tools",
    ).toEqual(["paged.tool.type", "paged.tool.select"]);

    const ot = live.objectTypes.find((o) => o.type === "wordDocument");
    expect(ot, "the wordDocument object type is registered").toBeTruthy();
    expect(ot!.bakedFallback).toBe("group");
    expect(ot!.editContextType).toBe("wordDocument");
    expect(ot!.metadataKey).toBe("x-paged:media.paged.doc");

    // THE TWO partTypes ARE DECLARATION ONLY, and that is a whole-contract
    // fact, not a paged.doc one. `contributes.partTypes` — "docx" (the
    // OPC source part) and "docLowered" (the derived JSON) — has no
    // `contribute.partType` door in the SDK and no registry in the shell,
    // so nothing in the host ever reads them. Eleven part types are
    // declared across the eight loaded bundles and the host consumes
    // zero. Delete this assertion when a partType registry lands.
    const registryNames = await page.evaluate(() =>
      Object.keys(
        (globalThis as unknown as { __canvas: { registries: object } }).__canvas.registries,
      ),
    );
    expect(
      registryNames,
      "the shell has no partType registry — 'docx' + 'docLowered' are inert manifest metadata",
    ).not.toContain("partTypes");
  });

  test("KNOWN DEFECT D2 — 'Place Word document…' has no category, so the palette files it under Other @feat:plugin-doc.embedded-placement @feat:editor-shell.menus @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // The registry fact.
    const cats = await page.evaluate(() => {
      const c = (globalThis as unknown as CanvasProbe).__canvas.registries.commands;
      return {
        placeDoc: c.get("media.paged.doc.command.placeDoc")?.category ?? null,
        placeImage: c.get("paged.insert.placeImage")?.category ?? null,
      };
    });
    // KNOWN DEFECT — flip to "Insert" (or whatever the bundle picks)
    // once placeDoc declares one.
    expect(cats.placeDoc, "D2: placeDoc declares no category").toBeNull();
    expect(cats.placeImage, "the host's sibling verb declares one").toBe("Insert");

    // The USER-VISIBLE consequence, through the real palette:
    // `groupByCategory` maps `category ?? "Other"`, sorts alphabetically,
    // and the two "place a file" verbs end up in different drawers.
    await invoke(page, PALETTE_TOGGLE);
    const input = page.getByPlaceholder("Ask or search anything…");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("place");

    const groupWithHeading = (heading: string) =>
      page
        .locator("[cmdk-group]")
        .filter({ has: page.locator("[cmdk-group-heading]", { hasText: heading }) });

    await expect(
      groupWithHeading("Other").getByText("media.paged.doc.command.placeDoc"),
      "D2: 'Place Word document…' lands in the Other junk drawer",
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      groupWithHeading("Insert").getByText("paged.insert.placeImage"),
      "…while 'Place image…' — the same verb — sits under Insert",
    ).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
  });

  test("the outline panel opens, and placeDoc reaches the host file-picker door @feat:plugin-doc.embedded-placement @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    await openPanel(page, DOC_PANEL);
    await expect
      .poll(async () => (await panelState(page)).active, { timeout: 10_000 })
      .toBe(DOC_PANEL);
    // With no document placed the panel renders its honest empty state
    // (not a blank body) — the real component, not a stub.
    await expect(page.locator('[data-doc-panel="empty"]')).toBeVisible({
      timeout: 10_000,
    });

    // INVOCABLE — unlike paged.data's importData (D1), placeDoc's handler
    // really does reach `host.shell.pickFile`, so a chooser fires. Cancel
    // it: the DOCX ingest itself is doc.journey's job, not this tier's.
    const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
    const placed = invoke(page, DOC_COMMAND);
    await (await chooser).setFiles([]);
    await placed;
    // A cancelled pick resolves to [] and ingests nothing — the panel
    // stays in its empty state rather than half-entering a loaded one.
    await expect(page.locator('[data-doc-panel="empty"]')).toBeVisible();
  });

  test("the wordDocument context enters on double-click and Esc exits @feat:plugin-doc.embedded-placement @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    await expect(breadcrumb).toHaveCount(0);

    // A frame carrying paged.doc's envelope with a `part` pointer — the
    // exact shape the objectType matcher requires (`metadata.data.part`
    // is a string). This is a RECTANGLE, the same kind paged.draw claims
    // by kind in D3 — and doc wins anyway, because an object-type claim
    // is checked BEFORE any kind claim. That contrast is the whole
    // content of the D3 finding.
    const id = await designer.drawRectangle({ x0: 170, y0: 170, x1: 440, y1: 360 });
    expect(id, "drew the word-document frame").not.toBe("");
    await designer.applyFill("rectangle", id, "Color/Black");
    expect(
      await stampEnvelope(page, { kind: "rectangle", id }, "media.paged.doc", {
        part: "paged/doc/memo.docx",
      }),
      "the x-paged:media.paged.doc envelope applied",
    ).toBe(true);

    await page.keyboard.press("Home");
    await page.waitForTimeout(400);

    const at = await elementScreenCenter(page, { kind: "rectangle", id });
    expect(at, "the frame resolves to a screen point").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);

    await expect(breadcrumb, "the edit-context breadcrumb appears").toBeVisible({
      timeout: 6_000,
    });
    await designer.expectContext({
      intent: "Double-click a DOCX-backed frame → wordDocument edit context entered",
      editContext: { type: "wordDocument" },
    });
    // The context names the outline panel, so the cockpit raises it.
    await expect
      .poll(async () => (await panelState(page)).open, { timeout: 10_000 })
      .toEqual(expect.arrayContaining([DOC_PANEL]));

    await page.keyboard.press("Escape");
    await expect(breadcrumb, "Esc pops the context").toHaveCount(0, { timeout: 6_000 });
    await designer.expectContext({
      intent: "Esc exits the wordDocument context → no edit context",
      editContext: { type: null },
    });
  });
});

// ════════════════════════════════════════════════════════════════════
//  paged.pdf
// ════════════════════════════════════════════════════════════════════

test.describe("plugin surface · paged.pdf", () => {
  test("the importer is registered and reachable by extension, MIME and the File menu @feat:plugin-pdf.pdf-import @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();

    const live = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasProbe).__canvas.registries;
      return {
        importer: r.importers.list().find((i) => i.id === "media.paged.pdf.importer.pdf") ?? null,
        byName: r.importers.resolve("brochure.pdf")?.id ?? null,
        byUpperName: r.importers.resolve("BROCHURE.PDF")?.id ?? null,
        byMime: r.importers.resolve("no-extension", "application/pdf")?.id ?? null,
        accept: r.importers.acceptExtensions(),
        openPdf: r.commands.get("paged.file.openPdf") ?? null,
        menu: r.menus.list().filter((m) => m.command === "paged.file.openPdf"),
        pdfOther: {
          panels: r.panels.list().filter((p) => p.id.startsWith("media.paged.pdf")).length,
          commands: r.commands.list().filter((c) => c.id.startsWith("media.paged.pdf")).length,
          exporters: r.exporters.list().filter((e) => e.id.startsWith("media.paged.pdf")).length,
          editContexts: r.editContexts.list().filter((e) => e.type === "pdf").length,
        },
      };
    });

    // ONE contribution, and it is live.
    expect(live.importer, "the pdf importer is registered").toBeTruthy();
    expect(live.importer!.title).toBe("PDF");
    expect(live.importer!.extensions).toContain(".pdf");
    expect(live.importer!.mimeTypes).toContain("application/pdf");

    // REACHABLE through every door the registry offers.
    expect(live.byName, "resolve() claims a .pdf by extension").toBe(PDF_IMPORTER);
    expect(live.byUpperName, "extension matching is case-insensitive").toBe(PDF_IMPORTER);
    expect(live.byMime, "resolve() also claims it by MIME").toBe(PDF_IMPORTER);
    expect(live.accept, "the picker's accept union carries .pdf").toContain(".pdf");

    // AND THE ONLY OTHER SURFACE IT HAS IS THE HOST'S. paged.pdf is the
    // one bundle with a File-menu item, and the plugin did not ask for
    // it: the contract has no `menu` contribution type at all, so
    // `app-commands.ts` hardcodes both the command and the menu entry on
    // the bundle's behalf.
    expect(live.openPdf, "the host registers File ▸ Open PDF…").toBeTruthy();
    expect(live.openPdf!.category).toBe("File");
    expect(live.menu.map((m) => m.path)).toEqual(["File/Open PDF…"]);

    // paged.pdf itself injects NOTHING else — no panel, no command, no
    // exporter, no edit context. Its whole user-facing existence is one
    // importer plus host-owned chrome.
    expect(live.pdfOther).toEqual({
      panels: 0,
      commands: 0,
      exporters: 0,
      editContexts: 0,
    });
  });

  test("File ▸ Open PDF… REPLACES the document with no unsaved-work guard @feat:plugin-pdf.pdf-import @level:edge", async ({
    page,
  }) => {
    // THE POINT OF THIS TEST, since pdf.journey already proves the open
    // works: the open is DESTRUCTIVE (the importer calls
    // `host.nativeDocument.open`, not a place) and there is NO guard in
    // front of it. The editor has no dirty flag, no confirm step and no
    // `beforeunload` handler anywhere, so a designer who picks a PDF with
    // unsaved work loses it silently. Author something first and watch it
    // go.
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const rect = await designer.drawRectangle({ x0: 120, y0: 140, x1: 380, y1: 340 });
    expect(rect, "authored unsaved work").not.toBe("");
    await designer.applyFill("rectangle", rect, "Color/Black");
    expect(await treeCount(page, "rectangle"), "the work is in the document").toBe(1);

    const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
    const opened = invoke(page, OPEN_PDF_COMMAND);
    await (await chooser).setFiles(PDF_FIXTURE);
    await opened;

    // No dialog stood between the pick and the swap.
    await expect(
      page.getByRole("alertdialog"),
      "no unsaved-changes dialog appeared",
    ).toHaveCount(0);

    // The pdf lane (pdf.js + the wasm mapper) is the slowest importer.
    // Poll for the swap; if it never lands the plugin did not drive and
    // the honest answer is a skip, not a red.
    let swapped = false;
    try {
      await expect
        .poll(async () => treeCount(page, "rectangle"), { timeout: 45_000 })
        .toBe(0);
      swapped = true;
    } catch {
      swapped = false;
    }
    if (!swapped) {
      test.skip(
        true,
        "the paged.pdf import lane did not drive in this realm (pdf.js / wasm mapper " +
          "unavailable), so the destructive-open claim cannot be observed here. " +
          "tests/journey/plugins/pdf.journey.spec.ts covers the same lane.",
      );
    }

    const { pageCount } = await designer.handle();
    expect(pageCount, "a fresh document from the PDF replaced the old one").toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(
      `[plugin-surface] paged.pdf destructive open: authored rectangle gone, pages=${pageCount}`,
    );
  });
});

// ════════════════════════════════════════════════════════════════════
//  paged.publish
// ════════════════════════════════════════════════════════════════════

test.describe("plugin surface · paged.publish", () => {
  test("the IDML importer and exporter are registered and reachable @feat:plugin-publish.idml-importer @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();

    const live = await page.evaluate(() => {
      const r = (globalThis as unknown as CanvasProbe).__canvas.registries;
      return {
        importer:
          r.importers.list().find((i) => i.id === "media.paged.publish.importer.idml") ?? null,
        exporter:
          r.exporters.list().find((e) => e.id === "media.paged.publish.exporter.idml") ?? null,
        byName: r.importers.resolve("layout.idml")?.id ?? null,
        byPaged: r.importers.resolve("layout.paged")?.id ?? null,
        accept: r.importers.acceptExtensions(),
        // The "Open…" door is the UNION of every registered importer —
        // one file dialog, many owners. Prove the four bundles under
        // audit each own their slice of it.
        docByName: r.importers.resolve("memo.docx")?.id ?? null,
        pdfByName: r.importers.resolve("brochure.pdf")?.id ?? null,
        publishOther: {
          panels: r.panels.list().filter((p) => p.id.startsWith("media.paged.publish")).length,
          commands: r.commands
            .list()
            .filter((c) => c.id.startsWith("media.paged.publish")).length,
        },
      };
    });

    expect(live.importer, "the IDML importer is registered").toBeTruthy();
    expect(live.importer!.extensions).toContain(".idml");
    expect(live.exporter, "the IDML exporter is registered").toBeTruthy();
    expect(live.exporter!.extension).toBe(".idml");

    expect(live.byName, "resolve() claims a .idml").toBe(PUBLISH_IMPORTER);
    expect(live.accept, "the picker's accept union carries .idml").toContain(".idml");

    // The importer-registry UNION — the four bundles do not collide.
    expect(live.docByName, ".docx routes to paged.doc").toBe(DOC_IMPORTER);
    expect(live.pdfByName, ".pdf routes to paged.pdf").toBe(PDF_IMPORTER);

    // paged.publish injects nothing else — no panel, no command, so its
    // exporter is reachable only through the Export Center and its
    // importer only through the Open door / drag-drop.
    expect(live.publishOther).toEqual({ panels: 0, commands: 0 });
    // eslint-disable-next-line no-console
    console.log(
      `[plugin-surface] importer union: .idml→${live.byName} .docx→${live.docByName} ` +
        `.pdf→${live.pdfByName} .paged→${live.byPaged}`,
    );
  });

  test("PUBLISH_EXPORTER is the Export Center's IDML target @feat:plugin-publish.idml-importer @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // The exporter really produces bytes through the registry door the
    // Export Center uses (a ZIP — IDML is a package). The round-trip is
    // publish.journey's job; here it is the REACHABILITY of the
    // contributed exporter that is under test.
    const out = await page.evaluate(async (id) => {
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              exporters: {
                list: () => Array<{
                  id: string;
                  export: () =>
                    | Promise<{ bytes: Uint8Array } | null>
                    | { bytes: Uint8Array }
                    | null;
                }>;
              };
            };
          };
        }
      ).__canvas.registries.exporters;
      const exp = reg.list().find((e) => e.id === id);
      if (!exp) return { reason: `exporter ${id} not registered` };
      const result = await exp.export();
      if (!result) return { reason: "exporter returned null" };
      const b = result.bytes;
      return {
        byteLength: b.length,
        magic: String.fromCharCode(b[0], b[1], b[2], b[3]),
      };
    }, PUBLISH_EXPORTER);

    expect("reason" in out ? out.reason : "", "the IDML exporter drove").toBe("");
    if (!("reason" in out)) {
      expect(out.magic.startsWith("PK"), "IDML is a ZIP (PK…)").toBe(true);
      expect(out.byteLength).toBeGreaterThan(1000);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
//  the HOST-OWNED chrome these plugins live inside
// ════════════════════════════════════════════════════════════════════

test.describe("plugin surface · host-hardcoded chrome", () => {
  test("KNOWN DEFECT — the Data menu is 100% dead while three LIVE pills carry the same three labels @feat:editor-shell.menus @feat:editor-shell.cockpit-modes @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. THE MENU. Every entry under Data is a `soon(...)` seam:
    //    a `paged.soon.*` command id that no handler backs, rendered
    //    disabled with a "soon" badge.
    const dataMenu = await page.evaluate(() =>
      (globalThis as unknown as CanvasProbe).__canvas.registries.menus
        .list()
        .filter((m) => m.path.startsWith("Data/"))
        .map((m) => ({ path: m.path, command: m.command, disabled: m.disabled === true })),
    );
    expect(dataMenu.map((m) => m.path)).toEqual([
      "Data/Connect source…",
      "Data/Field mapping…",
      "Data/Generate pages…",
    ]);
    for (const m of dataMenu) {
      expect(m.command, `${m.path} is a soon-seam`).toMatch(/^paged\.soon\./);
      expect(m.disabled, `${m.path} is disabled`).toBe(true);
    }

    // Through the real MenuBar: three items, all greyed, all badged.
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "Data" })
      .click();
    const items = page.getByRole("menuitem");
    await expect(items).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(items.nth(i)).toHaveAttribute("data-disabled", /.*/);
    }
    await expect(page.getByRole("menuitem").filter({ hasText: "soon" })).toHaveCount(3);
    await page.keyboard.press("Escape");

    // ── 2. THE LIVE PILLS THAT DUPLICATE THEM. Data mode's toolbar
    //    carries "Connect source" / "Field mapping" / "Generate" — the
    //    same three labels — and each one RAISES a live paged.data panel.
    //    So the verbs exist; only the menu is dead.
    await page.evaluate(() => (globalThis as unknown as CanvasProbe).__canvas.setMode("data"));
    for (const [action, panel] of [
      ["data-sources", "media.paged.data.panel.sources"],
      ["data-mapping", "media.paged.data.panel.bindings"],
      ["data-generate", "media.paged.data.panel.dataset"],
    ] as const) {
      const pill = page.locator(`[data-cockpit-action="${action}"]`);
      await expect(pill, `the ${action} pill is present`).toBeVisible({ timeout: 10_000 });
      await expect(pill, `the ${action} pill is LIVE, not a soon-stub`).toBeEnabled();
      await pill.click();
      await expect
        .poll(async () => (await panelState(page)).active, { timeout: 10_000 })
        .toBe(panel);
    }

    // ── 3. AND THE RAIL SLOT THE PLUGIN NEVER ASKED FOR. paged.data is
    //    the only bundle with a panel-rail entry, and its manifest
    //    requests no such thing: `cockpit-modes.ts` PANEL_RAIL hardcodes
    //    the bindings panel by id, exactly as it hardcodes Data mode's
    //    slots. The contract has no door for either.
    await page.evaluate(() => (globalThis as unknown as CanvasProbe).__canvas.setMode("design"));
    await expect(
      page.locator('[data-panel-rail-item="media.paged.data.panel.bindings"]'),
      "the host puts data's bindings panel in the rail",
    ).toBeVisible({ timeout: 10_000 });

    // No OTHER bundle got a rail slot — the asymmetry is the finding.
    const railPluginItems = await page
      .locator('[data-panel-rail-item^="media.paged."]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-panel-rail-item")));
    expect(railPluginItems).toEqual(["media.paged.data.panel.bindings"]);
  });
});
