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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// SOLO MODE — one plugin owns the whole application.
//
// WHY THE ASSERTIONS ARE SPREAD ACROSS SURFACES rather than checking one
// thing well: solo filters SIX independent surfaces, and a spec that
// asserted only "no Layout menu" would be satisfied by filtering ONE
// array while the other five rotted. Each assertion below maps to a
// distinct mechanism, so a regression in any one of them fails here.
//
// Two of these were written because the design review found the code
// would otherwise have shipped broken:
//
//   · THE BOOT ARTBOARD. The SDK synthesises
//     `when: state => handle && pageCount > 0` for EVERY plugin menu
//     entry, and nothing auto-creates a document. Without a boot
//     document, solo opens with all 72 Draw entries greyed — an app that
//     looks finished and does nothing. Asserting the menu is ENABLED is
//     the single most valuable line in this file.
//   · THE TOOL COMPOSITION. draw's 19 tools are all MODIFIERS on
//     existing paths; not one creates geometry. Pen, rectangle and
//     ellipse are the HOST's. An earlier draft of this spec asserted
//     "draw's tools + the four nav tools", which would have gone GREEN
//     on an illustration program you cannot draw in.

import { test, expect } from "@playwright/test";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const SOLO = "?solo=paged.draw";

interface Probe {
  pageCount: number;
  pageSize: [number, number] | null;
  topLevels: string[];
  drawMenuItems: number;
  toolIds: string[];
  panelIds: string[];
  paletteHasPageVerbs: boolean;
  switcher: number;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      __canvas: {
        handle?: { pageIds?: string[]; pageSizesPt?: [number, number][] };
        registries: {
          menus: { list: () => { path: string; command: string }[] };
          tools: { list: () => { id: string }[] };
          panels: { list: () => { id: string }[] };
          commands: { list: () => { id: string }[] };
        };
      };
    };
    const r = g.__canvas.registries;
    const menus = r.menus.list();
    return {
      pageCount: g.__canvas.handle?.pageIds?.length ?? 0,
      pageSize: g.__canvas.handle?.pageSizesPt?.[0] ?? null,
      topLevels: [...new Set(menus.map((m) => m.path.split("/")[0]))],
      drawMenuItems: menus.filter((m) =>
        m.command.startsWith("media.paged.draw."),
      ).length,
      toolIds: r.tools.list().map((t) => t.id),
      panelIds: r.panels.list().map((p) => p.id),
      paletteHasPageVerbs: r.commands
        .list()
        .some((c) => c.id === "paged.insert.newPage"),
      switcher: document.querySelectorAll("[data-mode-switcher]").length,
    };
  });
}

test.describe("journey · solo mode (paged.draw)", () => {
  test("boots as an illustration program: artboard, draw's verbs live, no DTP furniture @feat:editor-shell.solo-mode @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open({ search: SOLO });
    // No `newDocument()` — solo MUST already have one. That absence is
    // the assertion.
    await expect.poll(async () => (await probe(page)).pageCount, {
      timeout: 25_000,
    }).toBe(1);

    const p = await probe(page);

    // ── 1. THE BOOT ARTBOARD ──
    expect(p.pageSize, "one page, square, artboard-sized").toEqual([2000, 2000]);

    // ── 2. DRAW'S MENU IS PRESENT *AND LIVE* ──
    expect(p.topLevels, "draw's own top-level menu").toContain("Draw");
    expect(p.drawMenuItems).toBeGreaterThan(50);
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "Draw" })
      .click();
    const items = page.getByRole("menuitem");
    await expect(items.first()).toBeVisible();
    // ENABLED, not merely rendered. A greyed menu is what a missing boot
    // document produces, and it looks identical to a working one in a
    // count-only assertion.
    await expect(items.first()).toBeEnabled();
    await page.keyboard.press("Escape");

    // ── 3. THE DTP MENUS ARE GONE ──
    for (const gone of ["Layout", "Type", "Data"]) {
      expect(p.topLevels, `${gone} menu is absent in solo`).not.toContain(gone);
    }
    for (const kept of ["File", "Edit", "View"]) {
      expect(p.topLevels, `${kept} survives`).toContain(kept);
    }

    // ── 4. YOU CAN ACTUALLY DRAW ──
    // The host owns every geometry-creating tool; draw's 19 are all
    // modifiers. If this list ever shrinks to "draw's tools", the app
    // becomes an illustration program with nothing to illustrate with.
    for (const id of [
      "paged.tool.pen",
      "paged.tool.rectangle",
      "paged.tool.ellipse",
      "paged.tool.type",
    ]) {
      expect(p.toolIds, `${id} is present — solo must be able to draw`).toContain(id);
    }
    // …and the page-layout tools are not.
    for (const id of ["paged.tool.page", "paged.tool.gap", "paged.tool.note"]) {
      expect(p.toolIds, `${id} is DTP furniture`).not.toContain(id);
    }
    // Navigation is never taken away.
    for (const id of ["paged.tool.select", "paged.tool.hand", "paged.tool.zoom"]) {
      expect(p.toolIds).toContain(id);
    }

    // ── 5. THE DTP PANELS ARE GONE ──
    for (const id of ["paged.pages", "paged.preflight", "paged.separations"]) {
      expect(p.panelIds, `${id} is absent in solo`).not.toContain(id);
    }
    expect(p.panelIds, "the layers panel is a drawing surface").toContain(
      "paged.layers",
    );

    // ── 6. NO MODE SWITCHER ──
    // One mode is registered, and a control offering one choice can do
    // nothing.
    expect(p.switcher).toBe(0);
  });


  // ── EVERY PROFILE ──────────────────────────────────────────────────
  //
  // Table-driven, and the table is the point: the six profiles are NOT
  // one shape with six names. Their document sizes differ because their
  // applications differ — draw wants a square artboard, image a landscape
  // canvas, doc a LETTER PAGE (a word processor is page-shaped, and
  // giving it an artboard would be applying a template instead of asking
  // what the thing is), and web/data keep pages because their product IS
  // pagination.
  //
  // Each row asserts the identity that makes that profile itself, plus
  // the two invariants every profile must hold.
  const PROFILES: {
    name: string;
    sizePt: [number, number];
    ownPanel: string;
    menusPresent: string[];
    menusAbsent: string[];
  }[] = [
    {
      name: "paged.image",
      sizePt: [1600, 1200],
      ownPanel: "media.paged.image.panel.adjustments",
      menusPresent: ["Image", "File", "Edit"],
      menusAbsent: ["Layout", "Type", "Draw"],
    },
    {
      name: "paged.sheet",
      sizePt: [1400, 900],
      ownPanel: "media.paged.sheet.panel.workbook",
      menusPresent: ["Sheet", "File", "Edit"],
      menusAbsent: ["Layout", "Type", "Draw"],
    },
    {
      name: "paged.doc",
      // A word processor is PAGE-shaped. This row is the one that proves
      // the profiles are not a template.
      sizePt: [612, 792],
      ownPanel: "media.paged.doc.panel.outline",
      menusPresent: ["File", "Edit", "Type"],
      menusAbsent: ["Layout", "Draw", "Data"],
    },
    {
      name: "paged.web",
      sizePt: [612, 792],
      ownPanel: "media.paged.web.panel.source",
      // KEEPS Layout: paged.web's output is a page run.
      menusPresent: ["Web", "File", "Layout"],
      menusAbsent: ["Draw", "Sheet"],
    },
    {
      name: "paged.data",
      sizePt: [612, 792],
      ownPanel: "media.paged.data.panel.sources",
      // KEEPS Layout AND Data: its headline verb GENERATES pages.
      menusPresent: ["Data", "File", "Layout"],
      menusAbsent: ["Draw", "Sheet"],
    },
  ];

  for (const profile of PROFILES) {
    test(`${profile.name} boots as its own application @feat:editor-shell.solo-mode @level:happy`, async ({
      page,
    }) => {
      const designer = new Designer(page);
      await designer.open({ search: `?solo=${profile.name}` });
      await expect
        .poll(async () => (await probe(page)).pageCount, { timeout: 25_000 })
        .toBe(1);
      const p = await probe(page);

      // Its OWN document shape — not a shared default.
      expect(p.pageSize, `${profile.name}'s document shape`).toEqual(
        profile.sizePt,
      );

      // Its own panel is mounted, which also proves the bundle activated.
      expect(p.panelIds, `${profile.name}'s own panel`).toContain(
        profile.ownPanel,
      );

      for (const m of profile.menusPresent) {
        expect(p.topLevels, `${profile.name} keeps ${m}`).toContain(m);
      }
      for (const m of profile.menusAbsent) {
        expect(p.topLevels, `${profile.name} drops ${m}`).not.toContain(m);
      }

      // TWO INVARIANTS EVERY PROFILE HOLDS.
      // 1. No switcher — each registers exactly one mode.
      expect(p.switcher).toBe(0);
      // 2. Only its OWN bundle loaded. A foreign plugin's panels leaking
      //    in would mean the bundle filter stopped filtering, and every
      //    other assertion here would still pass.
      const foreign = p.panelIds.filter(
        (id) =>
          id.startsWith("media.paged.") &&
          !id.startsWith(`media.${profile.name}.`),
      );
      expect(foreign, `only ${profile.name} is loaded`).toEqual([]);
    });
  }

  test("the ordinary editor is unchanged @feat:editor-shell.solo-mode @level:happy", async ({
    page,
  }) => {
    // The negative control, and the reason it matters: every filter in
    // solo defaults to identity. If one of them stopped defaulting, the
    // solo test above would still pass while the real product lost half
    // its chrome.
    const designer = new Designer(page);
    await designer.open();
    const p = await probe(page);

    expect(p.pageCount, "normal boot mints NO document").toBe(0);
    expect(p.switcher, "the six-mode switcher is present").toBe(1);
    for (const menu of ["Layout", "Type", "Object", "File"]) {
      expect(p.topLevels).toContain(menu);
    }
    expect(p.panelIds).toContain("paged.pages");
    expect(p.toolIds).toContain("paged.tool.page");
    // Far more surface than solo — the numbers are floors, not equalities,
    // so adding a panel does not fail this.
    expect(p.panelIds.length).toBeGreaterThan(60);
    expect(p.toolIds.length).toBeGreaterThan(50);
  });
});
