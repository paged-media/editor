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

// paged.image — the SURFACE the bundle injects into the host, audited from
// the host side.
//
// WHY A SEPARATE TIER FROM `tests/journey/plugins/image-*`.
//
//   The ten image journeys drive the WORK: ingest, adjust, paint, crop,
//   select, retouch. Every one of the interesting ones is GPU-gated,
//   because paged.image's kernels are WGSL compute with no CPU path — so
//   on the lane that actually runs in CI they skip, and the CONTRIBUTION
//   surface (which of the 42 declared things exist at all, under which
//   key, refusing how) goes unasserted. `pnpm test:surface-coverage`
//   measured that gap as image 27/42: nine commands and six tools that no
//   spec had ever named.
//
//   Everything here is host-side registry + panel state, so it runs on the
//   CPU lane. The one genuinely device-dependent claim (the generator and
//   bake buttons come ALIVE with a device) is its own GPU-gated test using
//   the same `designer.gpuActive()` skip the journeys use.
//
// WHAT THIS FILE FOUND (each pinned by an assertion below):
//
//   1. PLACING A PHOTO DOES NOT GO THROUGH paged.image AT ALL. The host
//      owns File ▸ Place… / Cmd+D (`paged.insert.placeImage`), which picks
//      `image/*` and inserts a native frame via insertFrame +
//      replaceImageBytes without ever asking the importer registry. The
//      plugin's own importer claims exactly the types that picker accepts
//      (.png/.jpg/.psd) but only fires from File ▸ Open… / drag-drop. Same
//      intention, two doors, and only one boots the image engine.
//   2. AND THE FRAME IT MAKES IS UNCLAIMED. paged.image's `rasterImage`
//      edit context matches on its OWN metadata envelope, stamped only by
//      `ingestSelection`. A Place'd frame carries none, so double-clicking
//      it cannot enter the raster context — no raster tool set, no
//      restricted rail.
//   3. THE `j` COLLISION. The healing brush declares shortcut `j`; the
//      shell's fill/stroke cluster already binds `j` to
//      `paged.fillStroke.toggleAffects`. Both guards are the same
//      (`contentSelectionInactive`), so the keybinding registry's
//      first-enabled-match-wins rule decides it silently.
//   4. `media.paged.image.command.setType` is titled "Set type (image)"
//      and its whole handler is `openPanel`.

import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { Designer } from "../journey/driver/designer";

// ── the 42, exactly as the resolved manifest declares them ──────────
//
// Listed as literals rather than read from `node_modules` at runtime so
// the ids are TEXT IN A SPEC — which is what the surface-coverage gate
// counts, and what makes a rename show up here as a failing assertion
// instead of a silently-shrinking list.

const PANEL = "media.paged.image.panel.adjustments";

const COMMANDS = [
  "media.paged.image.command.openImage",
  "media.paged.image.command.adjustSelected",
  "media.paged.image.command.autoEnhance",
  "media.paged.image.command.claimTiles",
  "media.paged.image.command.commitCrop",
  "media.paged.image.command.fillSelection",
  "media.paged.image.command.fillNoise",
  "media.paged.image.command.contentAwareFill",
  "media.paged.image.command.setType",
  "media.paged.image.command.applyToFile",
  "media.paged.image.command.saveToFile",
  "media.paged.image.command.loadBrushLibrary",
  "media.paged.image.command.selectionToPath",
  "media.paged.image.command.pathToSelection",
  "media.paged.image.command.channelToSelection",
  "media.paged.image.command.selectAll",
  "media.paged.image.command.deselect",
  "media.paged.image.command.invertSelection",
  "media.paged.image.command.featherSelection",
  "media.paged.image.command.addLayer",
  "media.paged.image.command.bakeAdjustToLayer",
  "media.paged.image.command.undo",
  "media.paged.image.command.redo",
] as const;

const TOOLS = [
  "media.paged.image.tool.crop",
  "media.paged.image.tool.marqueeRect",
  "media.paged.image.tool.marqueeEllipse",
  "media.paged.image.tool.lasso",
  "media.paged.image.tool.polygonal-lasso",
  "media.paged.image.tool.magicWand",
  "media.paged.image.tool.quickSelect",
  "media.paged.image.tool.brush",
  "media.paged.image.tool.pencil",
  "media.paged.image.tool.eraser",
  "media.paged.image.tool.clone",
  "media.paged.image.tool.heal",
  "media.paged.image.tool.type",
] as const;

const IMPORTER = "media.paged.image.importer.raster";
const EXPORTERS = [
  "media.paged.image.exporter.psd",
  "media.paged.image.exporter.png",
  "media.paged.image.exporter.jpeg",
] as const;
const EDIT_CONTEXT = "rasterImage";

/** The six the coverage gate reported as never named — four rail slots of
 *  their own plus two flyout members. */
const SELECTION_TOOLS = [
  { id: "media.paged.image.tool.marqueeRect", key: "y", ownSlot: true },
  { id: "media.paged.image.tool.marqueeEllipse", key: "shift+y", ownSlot: true },
  { id: "media.paged.image.tool.lasso", key: "shift+l", ownSlot: true },
  { id: "media.paged.image.tool.polygonal-lasso", key: null, ownSlot: false },
  { id: "media.paged.image.tool.magicWand", key: "shift+w", ownSlot: true },
  { id: "media.paged.image.tool.quickSelect", key: null, ownSlot: false },
] as const;

const ACTIVATE = "paged.tool.activate.";
const PLACE = "paged.insert.placeImage";

// ── host-side probes (everything reads the LIVE registries) ─────────

interface RegistryGlobal {
  __canvas: {
    registries: {
      commands: { list: () => Array<{ id: string }> };
      tools: {
        list: () => Array<{ id: string; shortcut?: string; status?: string }>;
      };
      panels: { list: () => Array<{ id: string }> };
      importers: {
        list: () => Array<{ id: string }>;
        resolve: (
          name: string,
          mime?: string,
        ) => { id: string } | null;
        acceptExtensions: () => string[];
      };
      exporters: { list: () => Array<{ id: string }> };
      editContexts: {
        list: () => Array<{ type: string }>;
        get: (type: string) => {
          type: string;
          entry?: string;
          toolIds?: string[];
          panelIds?: string[];
          matches?: (c: unknown) => boolean;
        } | undefined;
      };
      keybindings: { list: () => Array<{ key: string; command: string }> };
    };
  };
}

const ids = (page: Page, arm: string): Promise<string[]> =>
  page.evaluate((which) => {
    const r = (globalThis as unknown as RegistryGlobal).__canvas.registries as
      unknown as Record<string, { list: () => Array<{ id?: string; type?: string }> }>;
    return r[which].list().map((x) => x.id ?? x.type ?? "");
  }, arm);

/** The keybinding table IN REGISTRATION ORDER — the order the dispatcher
 *  walks, and therefore the only thing that decides a collision. */
const keyTable = (page: Page): Promise<Array<{ key: string; command: string }>> =>
  page.evaluate(() =>
    (globalThis as unknown as RegistryGlobal).__canvas.registries.keybindings
      .list()
      .map((b) => ({ key: b.key, command: b.command })),
  );

/** The adjustments panel's Source row — `name W×H` once the engine
 *  decoded something, `"none"` while it has not. The single readout that
 *  answers "did the image engine ever see this photo". */
const sourceReadout = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });

const status = (page: Page): Promise<string> =>
  page
    .locator("[data-image-status]")
    .first()
    .textContent()
    .then((t) => t ?? "");

/** A real 24×18 PNG, encoded in Node — the bytes the OS file dialog would
 *  hand `File ▸ Place…`. Real, because `placeImage` decodes it with
 *  `createImageBitmap` to size the frame and refuses what it cannot read. */
function samplePng(): Buffer {
  const png = new PNG({ width: 24, height: 18 });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      png.data[i] = (x * 10) % 256;
      png.data[i + 1] = (y * 14) % 256;
      png.data[i + 2] = 200;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test.describe("plugin surface · paged.image", () => {
  test("all 42 declared contributions reach the host registries @feat:editor-shell.plugin-bundles @feat:image.editor.ingest @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // A manifest is a DECLARATION; the registries are the fact. The gap
    // between them is exactly the class of defect nothing else catches —
    // a `host.supports(...)` guard that quietly skipped, a contribution
    // behind a feature the host does not wire.

    // ── panel ──
    expect(await ids(page, "panels"), "the adjustments panel").toContain(PANEL);

    // ── 23 commands ──
    const commands = await ids(page, "commands");
    for (const id of COMMANDS) {
      expect(commands, `${id} is registered`).toContain(id);
    }

    // ── 13 tools, each with its generated activation command ──
    const tools = await ids(page, "tools");
    for (const id of TOOLS) {
      expect(tools, `${id} reached the rail`).toContain(id);
      expect(commands, `${id} has an activation command`).toContain(
        ACTIVATE + id,
      );
    }

    // ── 1 importer, 3 exporters ──
    expect(await ids(page, "importers"), "the raster importer").toContain(
      IMPORTER,
    );
    const exporters = await ids(page, "exporters");
    for (const id of EXPORTERS) {
      expect(exporters, `${id} is registered`).toContain(id);
    }

    // ── 1 edit context, with the tool set + panel it declares ──
    const ctx = await page.evaluate((type) => {
      const ec = (
        globalThis as unknown as RegistryGlobal
      ).__canvas.registries.editContexts.get(type);
      return ec
        ? { type: ec.type, entry: ec.entry, toolIds: ec.toolIds, panelIds: ec.panelIds }
        : null;
    }, EDIT_CONTEXT);
    expect(ctx, `the ${EDIT_CONTEXT} edit context is registered`).not.toBeNull();
    expect(ctx?.entry, "entered by double-click").toBe("doubleClick");
    // The context restricts the rail to its own tools — brush first,
    // because that is what a designer who just double-clicked an image
    // almost always wants. Order is load-bearing (`toolIds[0]` is focused
    // on entry), so assert the head, not just membership.
    expect(ctx?.toolIds?.[0]).toBe("media.paged.image.tool.brush");
    expect(ctx?.panelIds, "the context names its own panel").toEqual([PANEL]);
  });

  test("the six selection tools are live rail slots that actually activate @feat:image.selection.mask-tools @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // WHY THIS IS WORTH A TEST AT ALL: the tool rail already shipped once
    // with 15 of 31 entries accepting a click and doing nothing. A tool
    // that is registered but never activated by any spec is that defect's
    // exact shape, and these six were the untested ones.
    const registered = await page.evaluate(() =>
      (globalThis as unknown as RegistryGlobal).__canvas.registries.tools
        .list()
        .map((t) => ({ id: t.id, shortcut: t.shortcut, status: t.status })),
    );

    for (const tool of SELECTION_TOOLS) {
      const row = registered.find((t) => t.id === tool.id);
      expect(row, `${tool.id} is registered`).toBeTruthy();
      // `status: "planned"` would mean the shell registers NEITHER an
      // activation command NOR a keybinding — a dimmed slot that refuses
      // by construction. These are all live, so a click must do something.
      expect(row?.status ?? "ready", `${tool.id} is not an honest stub`).toBe(
        "ready",
      );
      expect(row?.shortcut ?? null, `${tool.id} shortcut claim`).toBe(tool.key);
    }

    // Activation through the generated command — the same path the rail
    // click, the palette and the shortcut all funnel into. After it, the
    // rail must MARK the tool: `data-active` is the rail's own answer to
    // "which tool is live", so asserting it proves the activation reached
    // the tool state rather than only the command registry.
    for (const tool of SELECTION_TOOLS) {
      await designer.runCommand(ACTIVATE + tool.id);
      await expect(
        page.locator(`[data-tool="${tool.id}"][data-active="true"]`),
        `${tool.id} is the live tool after activation`,
      ).toHaveCount(1, { timeout: 10_000 });
    }

    // The two flyout members share a slot with their group's default, so
    // their id must NOT also appear as a second slot — that would mean the
    // rail grew a slot per tool and the grouping never took.
    for (const tool of SELECTION_TOOLS.filter((t) => !t.ownSlot)) {
      await expect(
        page.locator(`[data-tool-slot="${tool.id}"]`),
        `${tool.id} is a flyout member, not a slot of its own`,
      ).toHaveCount(0);
    }
  });

  test("the healing brush's `j` collides with the shell's fill/stroke key, and the shell wins @feat:editor-shell.plugin-bundles @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const table = await keyTable(page);

    // ── 1. THE COLLISION IS REAL. Two bindings, same key, same guard
    //    (`contentSelectionInactive` on both — the tool class's and the
    //    fill/stroke cluster's are the identical predicate), so nothing
    //    separates them but position. ──
    const js = table.filter((b) => b.key === "j");
    // eslint-disable-next-line no-console
    console.log(`[surface] "j" bindings in registration order: ${JSON.stringify(js)}`);
    expect(js.length, 'two contributions claim "j"').toBe(2);
    expect(
      js.map((b) => b.command).sort(),
      "the shell's fill/stroke toggle and the healing brush",
    ).toEqual(
      [
        "paged.fillStroke.toggleAffects",
        ACTIVATE + "media.paged.image.tool.heal",
      ].sort(),
    );

    // ── 2. WHO WINS. `createKeybindingRegistry`'s dispatcher walks the
    //    array in registration order and returns on the FIRST binding
    //    whose `when` is enabled. With both enabled the first registered
    //    one fires and the second never does — silently, with no warning
    //    anywhere. Pinned so the day the order flips, someone decides it
    //    deliberately. ──
    expect(
      js[0].command,
      "the first-registered `j` binding is the one that fires",
    ).toBe("paged.fillStroke.toggleAffects");

    // ── 3. AND BEHAVIOURALLY. Press the key for real: if the healing
    //    brush were reachable by `j` it would become the live tool. It is
    //    not, so the rail must be unchanged. ──
    await designer.runCommand(ACTIVATE + "media.paged.image.tool.marqueeRect");
    await expect(
      page.locator(
        '[data-tool="media.paged.image.tool.marqueeRect"][data-active="true"]',
      ),
    ).toHaveCount(1, { timeout: 10_000 });

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("j");
    await page.waitForTimeout(400);

    await expect(
      page.locator('[data-tool="media.paged.image.tool.heal"][data-active="true"]'),
      "`j` does NOT reach the healing brush — the shell binding shadows it",
    ).toHaveCount(0);
  });

  test("the nine untested commands are reachable and refuse honestly with nothing ingested @feat:image.editor.ingest @feat:editor-shell.plugin-bundles @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── openImage — the whole command IS opening the panel, so that is
    //    the assertion. ──
    await designer.runCommand("media.paged.image.command.openImage");
    await expect(page.locator("[data-image-status]")).toHaveCount(1, {
      timeout: 15_000,
    });

    // With nothing ingested every button that needs a source must be
    // DISABLED — `disabled = busy || !source` in the panel. A live button
    // over an absent source is the fake-interactive lie the design system
    // exists to prevent, so this is a real claim and not a formality.
    for (const hook of [
      "data-image-auto-enhance",
      "data-image-apply-to-file",
      "data-image-save-to-file",
      "data-image-fill-gradient",
      "data-image-fill-noise",
      "data-image-layer-bake",
    ]) {
      await expect(
        page.locator(`[${hook}]`),
        `${hook} is present`,
      ).toHaveCount(1);
      await expect(
        page.locator(`[${hook}]`),
        `${hook} is disabled with no source`,
      ).toBeDisabled();
    }
    // Content-aware fill gates on the SELECTION, not the source, and says
    // which in the panel rather than only in a changelog.
    await expect(page.locator("[data-image-content-aware-fill]")).toBeDisabled();
    await expect(page.getByText("select an area first")).toBeVisible();

    // ── the refusals. Each of these commands is invoked with no image in
    //    the session; the contract is that it answers in the panel's own
    //    status line instead of throwing, and says WHAT is missing. ──
    const refusals: Array<[string, RegExp]> = [
      ["media.paged.image.command.autoEnhance", /Nothing ingested/i],
      ["media.paged.image.command.commitCrop", /Nothing to crop/i],
      ["media.paged.image.command.fillSelection", /Nothing ingested/i],
      ["media.paged.image.command.contentAwareFill", /Nothing ingested/i],
      ["media.paged.image.command.applyToFile", /Nothing ingested/i],
      ["media.paged.image.command.bakeAdjustToLayer", /ingest|layer|source/i],
    ];
    for (const [id, expected] of refusals) {
      await designer.runCommand(id);
      await expect
        .poll(() => status(page), { timeout: 10_000 })
        .toMatch(expected);
    }

    // ── saveToFile — the K-10 door. Either the host wired a saver (and
    //    the refusal is the missing SOURCE) or it did not (and the
    //    refusal names the missing door). Both are honest; asserting the
    //    disjunction is what keeps this true across the canary bump that
    //    flips `supports("shell.saveFile@1")`. ──
    await designer.runCommand("media.paged.image.command.saveToFile");
    await expect
      .poll(() => status(page), { timeout: 10_000 })
      .toMatch(/Nothing ingested|wires no save-file door/i);

    // ── setType — REGISTERED, and its entire handler is `openPanel`.
    //    "Set type (image)" sets no type: the actual typing happens in
    //    the panel's Type section and then on the canvas. Pinned as the
    //    command's real contract so the title's promise cannot quietly
    //    stay unmet. ──
    const before = await status(page);
    await designer.runCommand("media.paged.image.command.setType");
    await expect(page.locator("[data-image-type-text]")).toHaveCount(1);
    await expect(page.locator("[data-image-type-note]")).toContainText(
      "BASELINE",
    );
    // …and the section states its own ceiling where the designer stands:
    // this is a raster type tool, not a second text engine.
    await expect(
      page.getByText("This paints PIXELS, not a text object."),
    ).toBeVisible();
    expect(
      await status(page),
      "setType changes no session state — it only opens the panel",
    ).toBe(before);
  });

  test("File ▸ Place… inserts a native frame that paged.image never sees @feat:editor-shell.plugin-bundles @feat:image.editor.ingest @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await designer.openPanel(PANEL);

    // ── 0. THE TWO DOORS OVERLAP. The plugin's importer claims exactly
    //    the file types the host's Place picker accepts (`image/*`). So
    //    the same file, the same intention — "put this photo in" — has
    //    two code paths through the app. ──
    const claims = await page.evaluate(() => {
      const reg = (globalThis as unknown as RegistryGlobal).__canvas.registries
        .importers;
      return {
        png: reg.resolve("photo.png", "image/png")?.id ?? null,
        jpg: reg.resolve("photo.jpg", "image/jpeg")?.id ?? null,
        psd: reg.resolve("photo.psd", "image/vnd.adobe.photoshop")?.id ?? null,
      };
    });
    expect(claims.png, "paged.image claims .png").toBe(IMPORTER);
    expect(claims.jpg, "paged.image claims .jpg").toBe(IMPORTER);
    expect(claims.psd, "paged.image claims .psd").toBe(IMPORTER);

    // ── 1. TAP BOTH SIDES. `commands.observe` is THE tap for user intent
    //    (`invoke` is the only place a handler runs), and we shim
    //    `importers.resolve` to record whether the Place path ever asks
    //    the registry which plugin wants these bytes. ──
    await page.evaluate(() => {
      const reg = (globalThis as unknown as RegistryGlobal).__canvas.registries;
      const seen: string[] = [];
      (globalThis as unknown as { __resolveCalls: string[] }).__resolveCalls =
        seen;
      const original = reg.importers.resolve.bind(reg.importers);
      reg.importers.resolve = (name: string, mime?: string) => {
        seen.push(`${name}|${mime ?? ""}`);
        return original(name, mime);
      };
    });

    const rectsBefore = await designer.count("rectangle");

    // ── 2. DRIVE THE REAL COMMAND with a real PNG through the real file
    //    picker (`pickFiles` builds a transient <input type=file>;
    //    Playwright intercepts the chooser). This is File ▸ Place… /
    //    Cmd+D exactly as a user reaches it. ──
    const chooser = page.waitForEvent("filechooser", { timeout: 30_000 });
    const invoked = designer.runCommand(PLACE);
    await (await chooser).setFiles({
      name: "place-sample.png",
      mimeType: "image/png",
      buffer: samplePng(),
    });
    // Place ASKS WHERE now: after the picker returns, the pointer arms
    // and the command does not resolve until a click inside the canvas
    // positions the image. Without this click the command waits
    // forever — which is exactly how this spec first reported the
    // change, as a 5-minute timeout.
    await expect(page.locator("html[data-paged-placement='armed']")).toHaveCount(
      1,
      { timeout: 15_000 },
    );
    const vp = (await page.locator("[data-paged-viewport]").boundingBox())!;
    await page.mouse.click(
      Math.round(vp.x + vp.width * 0.45),
      Math.round(vp.y + vp.height * 0.4),
    );
    await invoked;

    // The native path worked: a frame exists and carries the bytes.
    await expect
      .poll(() => designer.count("rectangle"), { timeout: 20_000 })
      .toBe(rectsBefore + 1);

    // ── 3. THE DEFECT, part one: the importer registry was never asked.
    //    `placeImage` goes straight to insertFrame + replaceImageBytes.
    //    The plugin that owns raster editing is not consulted, not
    //    offered the bytes, and not told a photo entered the document. ──
    const resolveCalls = await page.evaluate(
      () => (globalThis as unknown as { __resolveCalls: string[] }).__resolveCalls,
    );
    expect(
      resolveCalls,
      "Place… never asks the importer registry who wants these bytes",
    ).toEqual([]);

    // ── 4. THE DEFECT, part two: the image engine holds nothing. The
    //    same file taken through File ▸ Open… decodes into the session
    //    and the Source row names it; taken through Place… the row still
    //    reads "none". That is the whole user-visible cost: no
    //    adjustments, no kernels, no channels, no layers, no tiles, no
    //    save-back — the panel has no image to work on. ──
    await page.waitForTimeout(1500);
    expect(
      await sourceReadout(page),
      "the image engine never saw the placed photo",
    ).toBe("none");

    // ── 5. THE DEFECT, part three: the frame is UNCLAIMED. paged.image's
    //    edit context matches on its OWN metadata envelope (stamped only
    //    by `ingestSelection`), deliberately never by kind — so a
    //    Place'd frame, which carries no envelope, cannot be entered by
    //    double-click. Evaluate the plugin's own matcher over the two
    //    candidate shapes to prove which side of the line each lands on. ──
    const verdict = await page.evaluate((type) => {
      const ec = (
        globalThis as unknown as RegistryGlobal
      ).__canvas.registries.editContexts.get(type);
      if (!ec?.matches) return null;
      const base = { id: "u1", kind: "rectangle", groupChain: [] };
      return {
        placed: ec.matches({ ...base, metadata: null }),
        ingested: ec.matches({
          ...base,
          metadata: { v: 1, data: { owns: "pixels" } },
        }),
      };
    }, EDIT_CONTEXT);
    expect(verdict, "the context exposes a matcher").not.toBeNull();
    expect(
      verdict?.placed,
      "a Place'd frame carries no paged.image envelope → double-click cannot enter rasterImage",
    ).toBe(false);
    expect(
      verdict?.ingested,
      "an ingested frame IS claimed — so the gap is the stamp, not the matcher",
    ).toBe(true);

    // ── 6. THE RECOVERY EXISTS, but only if the designer knows to ask
    //    for it. Selecting the frame and running "Adjust image" reads the
    //    placed bytes back out through `assets.getPlacedImage` and finally
    //    boots the engine on them. Nothing in the menu bar says so:
    //    paged.image contributes no menu item (the contract has no `menu`
    //    contribution type at all), so the only doors are Cmd+K and the
    //    panel's own button. ──
    const placedIds = await page.evaluate(async () => {
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
      const r = await c.client.executeScript("paged.tree()");
      const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
        id?: { kind: string; id: string } | null;
        children?: unknown[];
      }>;
      const out: string[] = [];
      const visit = (n: { id?: { kind: string; id: string } | null; children?: unknown[] }) => {
        if (n.id?.kind === "rectangle") out.push(n.id.id);
        for (const ch of (n.children ?? []) as typeof tree) visit(ch);
      };
      for (const root of tree) visit(root);
      return out;
    });
    const placed = placedIds.at(-1) ?? "";
    expect(placed, "the placed frame has a real element id").not.toBe("");

    await designer.selectElement("rectangle", placed);
    await designer.runCommand("media.paged.image.command.adjustSelected");

    // The engine boots lazily and decodes off-thread. If it cannot boot at
    // all on this lane the panel says so in its own status line — report
    // that rather than assert a decode the host could not perform.
    const recovered = await expect
      .poll(() => sourceReadout(page), { timeout: 30_000 })
      .not.toBe("none")
      .then(() => true)
      .catch(() => false);
    // eslint-disable-next-line no-console
    console.log(
      `[surface] after Adjust image → Source="${await sourceReadout(page)}" status="${await status(page)}"`,
    );
    expect(
      recovered,
      "Adjust image recovers the placed bytes into the engine (the workaround for the Place bypass)",
    ).toBe(true);
  });

  test("with a WebGPU device the GPU-only generators come alive @feat:image.editor.paint @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Same skip mechanism the image journeys use. paged.image's fills and
    // the adjustment bake are WGSL compute with no CPU path, so on the
    // bundled-Chromium lane (no adapter) the button's disabled state is
    // CORRECT and there is nothing to prove. Everything else in this file
    // runs on both lanes by construction.
    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "paged.image's generators + adjustment bake are GPU-only WGSL (no CPU path); this machine reports no compatible wgpu adapter. Run `pnpm --filter paged-canvas test:journeys:gpu`-style with BACKEND=gpu + real Chrome to exercise it — the CPU-lane half (the buttons are disabled and say why) is asserted above",
      );
    }

    const frame = await designer.drawRectangle({
      x0: 90,
      y0: 120,
      x1: 360,
      y1: 320,
    });
    await designer.selectElement("rectangle", frame);
    const importer = await designer.importImage({ name: "surface-sample.png" });
    expect(importer).toContain(IMPORTER);
    await designer.openPanel(PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 20_000 })
      .toEqual(expect.stringContaining("surface-sample.png"));

    // `disabled: disabled || !s.gpu` on both — with a source AND a device
    // they must be live. The CPU lane asserts the mirror image.
    await expect(page.locator("[data-image-fill-gradient]")).toBeEnabled();
    await expect(page.locator("[data-image-fill-noise]")).toBeEnabled();
    await expect(page.locator("[data-image-layer-bake]")).toBeEnabled();

    await designer.runCommand("media.paged.image.command.fillSelection");
    await expect
      .poll(() => status(page), { timeout: 20_000 })
      .not.toMatch(/WebGPU unavailable/i);
  });
});
