// Styleguide — panel archetype token discipline + kit conformance.
//
// 56 of the 59 styleguide cells are PANELS. Rather than 56 brittle
// per-panel specs, this opens ONE representative per ARCHETYPE and
// asserts the design-system contract every panel in that archetype
// shares:
//   - token discipline: no inline style hardcodes a hex / rgb() colour
//     on a colour-bearing property (swatch / ink CONTENT chips are the
//     documented exception and are excluded);
//   - typography: panel text resolves IBM Plex Sans / Mono;
//   - kit presence: the kit's semantic classes / components the panel
//     composition declares are rendered (pg-label / pg-value rows for
//     field panels; the honest ComingSoon stub for concept surfaces).
//
// Archetypes (representative → the family it stands for):
//   field      — character  (inspector form: labels, steppers, values)
//   list       — layers     (collection rows)
//   collection — swatches   (content chips + rows; the swatch EXCEPTION)
//   color      — color      (mixer + live preview content)
//   metric     — info       (mono readout tiles)
//   concept    — component-library (honest ComingSoon stub)
//
// Each representative's pass certifies its archetype; the test-map routes
// this file's result onto every panel cell in those families.

import { test, expect, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const COLOUR_PROPS = [
  "color",
  "background",
  "background-color",
  "border-color",
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "fill",
  "stroke",
  "outline",
  "box-shadow",
];

// Content markers whose literal colour is design-intended — the
// swatch / ink CONTENT a chip DISPLAYS (the documented exception to the
// token rule). The colour-mixer preview chip and swatch chips paint the
// live mixed/stored colour literally; that's the point of the chip.
const CONTENT_MARKERS = [
  "[data-swatch-id]",
  "[data-swatch-editor]",
  "[data-color-swatch]",
  "[data-color-preview]",
  "[data-color-rgb]",
  "[data-color-cmyk]",
  "[data-ink-swatch]",
  "[data-color-mixer]",
  "[data-mixer-preview]",
  "[data-mixer-tint]",
  "[data-gamut]",
  "[data-gradient-stop]",
  "[data-gradient-stop-row]",
  "[data-gradient-ramp]",
  "[data-gradient-preview]",
  "[data-wheel]",
  "canvas",
];

interface PanelScan {
  found: boolean;
  literalColours: string[];
  fonts: string[];
  pgClasses: string[];
  comingSoon: boolean;
}

async function scanActivePanel(page: Page): Promise<PanelScan> {
  return page.evaluate(
    ({ COLOUR_PROPS, CONTENT_MARKERS }) => {
      const dock = document.querySelector("[data-right-dock]");
      if (!dock) return { found: false } as unknown as PanelScan;
      // The active panel renders below the (optional) tab strip; scan the
      // whole dock content.
      const HEX = /#[0-9a-fA-F]{3,8}\b/;
      const RGB = /\brgba?\(\s*\d/;
      const NAMED =
        /:\s*(red|green|blue|black|orange|yellow|purple|pink|teal|cyan|magenta|gold|crimson)\b/i;
      const literalColours: string[] = [];
      const fonts = new Set<string>();
      const pgClasses = new Set<string>();
      const els = [dock, ...Array.from(dock.querySelectorAll("*"))];
      for (const el of els) {
        const e = el as Element;
        const ff = getComputedStyle(e).fontFamily;
        if (ff) fonts.add(ff);
        for (const c of (e as HTMLElement).classList ?? [])
          if (c.startsWith("pg-")) pgClasses.add(c);
        // Token-discipline scan — skip content chips.
        const inContent = CONTENT_MARKERS.some((m) => e.closest(m) !== null);
        if (inContent) continue;
        const style = e.getAttribute("style");
        if (!style) continue;
        for (const decl of style.split(";")) {
          const [propRaw, ...rest] = decl.split(":");
          const prop = (propRaw ?? "").trim().toLowerCase();
          const value = rest.join(":");
          if (!COLOUR_PROPS.includes(prop)) continue;
          if (HEX.test(value) || RGB.test(value) || NAMED.test(`:${value}`)) {
            literalColours.push(`${e.tagName}[${prop}]: ${value.trim()}`);
          }
        }
      }
      return {
        found: dock.innerHTML.length > 0,
        literalColours,
        fonts: Array.from(fonts),
        pgClasses: Array.from(pgClasses),
        comingSoon: !!dock.querySelector("[data-coming-soon]"),
      };
    },
    { COLOUR_PROPS, CONTENT_MARKERS },
  );
}

interface Archetype {
  name: string;
  panel: string;
  /** Concept stubs render the honest ComingSoon component. */
  expectComingSoon?: boolean;
  /** Field/list panels declare the kit's pg-* type classes. */
  expectPgClasses?: boolean;
}

const ARCHETYPES: Archetype[] = [
  { name: "field", panel: "paged.character", expectPgClasses: true },
  { name: "list", panel: "paged.layers" },
  { name: "collection", panel: "paged.swatches", expectPgClasses: true },
  { name: "color", panel: "paged.color", expectPgClasses: true },
  { name: "metric", panel: "paged.info", expectPgClasses: true },
  {
    name: "concept",
    panel: "paged.component-library",
    expectComingSoon: true,
  },
];

test.describe("Styleguide — panel archetypes", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
  });

  for (const arch of ARCHETYPES) {
    test(`[${arch.name}] ${arch.panel} — token discipline + IBM Plex + kit`, async ({
      page,
    }) => {
      await openPanel(page, arch.panel);
      // Let the panel's composition render (binding hooks settle).
      await expect(page.locator("[data-right-dock]").first()).toBeAttached();
      await page.waitForTimeout(120);
      const scan = await scanActivePanel(page);

      expect(scan.found, `${arch.panel} rendered nothing`).toBe(true);

      // Token discipline — no hardcoded inline colour outside swatch/ink
      // content. REAL violations fail here.
      expect(
        scan.literalColours,
        `${arch.panel} hardcoded colours:\n${scan.literalColours.join("\n")}`,
      ).toEqual([]);

      // Typography — every resolved family is a brand face.
      expect(scan.fonts.length).toBeGreaterThan(0);
      for (const ff of scan.fonts) {
        expect(ff, `${arch.panel} non-brand font: ${ff}`).toMatch(
          /IBM Plex (Sans|Mono)/,
        );
      }

      if (arch.expectComingSoon) {
        expect(scan.comingSoon, `${arch.panel} should be an honest stub`).toBe(
          true,
        );
      }
      if (arch.expectPgClasses) {
        expect(
          scan.pgClasses.length,
          `${arch.panel} should use the kit's pg-* type classes`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
