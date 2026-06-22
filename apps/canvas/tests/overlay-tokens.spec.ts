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

// Styleguide F — the canvas-overlay colour tokens. The overlays
// author `stroke="var(--overlay-*)"` / `fill="var(--*)"` attributes;
// globals.css re-applies each token through an attribute-selector CSS
// rule (the belt-and-suspenders hook for engines that don't resolve
// var() in a presentation attribute). This spec guards that mechanism
// AND the design-system values themselves (magenta selection, violet
// guides — the authentic DTP cues).
//
// W2.13 (Full-Green) — the guard is widened to the campaign's new
// overlay contributions: editable guides (GD), threading ports (TH),
// the selected-cell outline (table), and the tool-preview family
// (rubber-band, polyline, AND the gridify N×M variant). The assertion
// surface is the EXACT token strings those overlays author, so a
// renamed token or a drifted theme value fails here, and the registry
// check pins that every campaign overlay is actually mounted.

import { test, expect } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

// The design-system overlay palette, resolved RGB on the DARK default
// theme — the values theme.css ships. Every overlay token a campaign
// contribution authors must resolve to one of these.
const TOKEN_RGB: Record<string, string> = {
  "--overlay-selection": "rgb(224, 64, 143)", // #e0408f magenta — selection / table cell / ports
  "--overlay-guide": "rgb(124, 92, 255)", // #7c5cff violet — guides
  "--overlay-snap": "rgb(20, 184, 166)", // #14b8a6 teal (dark) — snap + tool previews
  "--overlay-target": "rgb(220, 38, 38)", // #dc2626 red — hit/target markers
  "--status-error": "rgb(240, 97, 109)", // #f0616d (dark) — overset port badge
};

/**
 * Resolve a batch of `(svgAttr, value)` pairs the way the browser
 * resolves them on a real SVG node mounted in the document — i.e.
 * through the cascade (the globals.css attribute hooks + native
 * presentation-attribute var() resolution). Returns the computed
 * paint per pair.
 */
async function resolveAttrs(
  page: import("@playwright/test").Page,
  pairs: { attr: "stroke" | "fill"; value: string }[],
): Promise<string[]> {
  return page.evaluate((pairs) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const els = pairs.map(({ attr, value }) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      el.setAttribute(attr, value);
      svg.appendChild(el);
      return { attr, el };
    });
    document.body.appendChild(svg);
    const out = els.map(({ attr, el }) => {
      const cs = getComputedStyle(el);
      return attr === "stroke" ? cs.stroke : cs.fill;
    });
    svg.remove();
    return out;
  }, pairs);
}

test.describe("Styleguide — overlay tokens", () => {
  test("the four core overlay tokens resolve to the DTP palette @feat:editor-tools.overlays @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const r = await page.evaluate(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const mk = (attr: string, val: string) => {
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rect.setAttribute(attr, val);
        svg.appendChild(rect);
        return rect;
      };
      const sel = mk("stroke", "var(--overlay-selection)");
      const guide = mk("stroke", "var(--overlay-guide)");
      const snap = mk("stroke", "var(--overlay-snap)");
      const target = mk("stroke", "var(--overlay-target)");
      document.body.appendChild(svg);
      const out = {
        selection: getComputedStyle(sel).stroke,
        guide: getComputedStyle(guide).stroke,
        snap: getComputedStyle(snap).stroke,
        target: getComputedStyle(target).stroke,
      };
      svg.remove();
      return out;
    });
    expect(r.selection).toBe(TOKEN_RGB["--overlay-selection"]); // magenta
    expect(r.guide).toBe(TOKEN_RGB["--overlay-guide"]); // violet
    expect(r.snap).toBe(TOKEN_RGB["--overlay-snap"]); // teal
    expect(r.target).toBe(TOKEN_RGB["--overlay-target"]); // red
  });

  // The exact token strings each campaign overlay AUTHORS (verbatim
  // from the overlay sources). If an overlay is re-authored with the
  // wrong token — e.g. a guide painted with selection magenta — the
  // resolved paint stops matching the design-system intent and this
  // fails. data-overlay names the contribution under test.
  const CAMPAIGN_TOKENS: {
    overlay: string;
    paints: { attr: "stroke" | "fill"; value: string; token: string }[];
  }[] = [
    {
      // guide-overlay.tsx — placed line + drag preview, violet.
      overlay: "paged.guide-overlay",
      paints: [
        {
          attr: "stroke",
          value: "var(--overlay-guide)",
          token: "--overlay-guide",
        },
      ],
    },
    {
      // threading-ports.tsx — port box + chain arrow stroke the
      // SELECTION magenta; the overset badge fills STATUS error red.
      overlay: "paged.threading-ports",
      paints: [
        {
          attr: "stroke",
          value: "var(--overlay-selection)",
          token: "--overlay-selection",
        },
        {
          attr: "fill",
          value: "var(--overlay-selection)",
          token: "--overlay-selection",
        },
        { attr: "fill", value: "var(--status-error)", token: "--status-error" },
      ],
    },
    {
      // table-cell-overlay.tsx — selected-cell outline, selection magenta.
      overlay: "paged.table-cell-overlay",
      paints: [
        {
          attr: "stroke",
          value: "var(--overlay-selection)",
          token: "--overlay-selection",
        },
      ],
    },
    {
      // tool-preview.tsx — rubber-band / polyline / gridify cells all
      // stroke the SNAP teal so the tool-preview family reads as one.
      overlay: "paged.tool-preview",
      paints: [
        {
          attr: "stroke",
          value: "var(--overlay-snap)",
          token: "--overlay-snap",
        },
      ],
    },
  ];

  for (const { overlay, paints } of CAMPAIGN_TOKENS) {
    test(`${overlay} authors resolve to the design-system tokens`, async ({
      page,
    }) => {
      await openCanvas(page);
      const resolved = await resolveAttrs(page, paints);
      paints.forEach((p, i) => {
        expect(resolved[i], `${overlay} ${p.attr}=${p.value}`).toBe(
          TOKEN_RGB[p.token],
        );
      });
    });
  }

  test("every campaign overlay is registered in the overlay registry @feat:editor-tools.overlays @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const ids = await page.evaluate(() => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            registries: { overlays: { list: () => { id: string }[] } };
          };
        }
      ).__canvas;
      return c.registries.overlays.list().map((o) => o.id);
    });
    for (const { overlay } of CAMPAIGN_TOKENS) {
      expect(ids, `overlay ${overlay} must be mounted`).toContain(overlay);
    }
  });
});
