// Styleguide — cockpit chrome token discipline + typography.
//
// The publishing cockpit's chrome surfaces (tool rail, panel rail,
// context toolbar, mode switcher, right-dock tabs) are the brand's
// permanent frame. Design-system rule: chrome NEVER hardcodes a hex /
// rgb() colour inline — every chrome colour resolves a `var(--chrome-*
// / --pg-* / --status-* / --selected-* / --hover / --overlay-*)` token,
// so a single theme edit re-skins the whole frame. Swatch / ink CONTENT
// colours (the literal paint a colour chip shows) are the one exception
// and live in panels, not chrome.
//
// This archetype representative covers the five always-present chrome
// surfaces and asserts: (1) each is mounted, (2) no inline colour is a
// literal hex/rgb, (3) chrome text renders IBM Plex, (4) the kit's
// semantic type classes (pg-*) are present on the frame.

import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const CHROME_SURFACES = [
  "[data-tool-rail]",
  "[data-panel-rail]",
  "[data-context-toolbar]",
  "[data-mode-switcher]",
];

// Colour-bearing CSS properties an inline style might hardcode.
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

// Content markers whose literal colour is design-intended (swatch / ink
// chips, colour previews) — excluded from the chrome discipline scan.
const CONTENT_MARKERS = [
  "[data-swatch-id]",
  "[data-color-swatch]",
  "[data-color-preview]",
  "[data-ink-swatch]",
  "[data-gradient-stop]",
];

/** Scan a root's descendants for an inline style that hardcodes a
 *  literal hex / rgb() / named colour on a colour-bearing property.
 *  Returns offending `selector → style` strings. */
async function scanLiteralColours(
  page: Page,
  rootSel: string,
): Promise<string[]> {
  return page.evaluate(
    ({ rootSel, COLOUR_PROPS, CONTENT_MARKERS }) => {
      const root = document.querySelector(rootSel);
      if (!root) return [`MISSING ${rootSel}`];
      const HEX = /#[0-9a-fA-F]{3,8}\b/;
      const RGB = /\brgba?\(\s*\d/;
      const NAMED =
        /:\s*(red|green|blue|black|orange|yellow|purple|pink|teal|cyan|magenta|gold|crimson)\b/i;
      const out: string[] = [];
      const els = [root, ...Array.from(root.querySelectorAll("*"))];
      for (const el of els) {
        if (CONTENT_MARKERS.some((m) => (el as Element).closest(m) !== null))
          continue;
        const style = el.getAttribute("style");
        if (!style) continue;
        // Split into declarations and check only colour-bearing props.
        for (const decl of style.split(";")) {
          const [propRaw, ...rest] = decl.split(":");
          const prop = (propRaw ?? "").trim().toLowerCase();
          const value = rest.join(":");
          if (!COLOUR_PROPS.includes(prop)) continue;
          if (HEX.test(value) || RGB.test(value) || NAMED.test(`:${value}`)) {
            out.push(`${(el as Element).tagName}[${prop}]: ${value.trim()}`);
          }
        }
      }
      return out;
    },
    { rootSel, COLOUR_PROPS, CONTENT_MARKERS },
  );
}

test.describe("Styleguide — cockpit chrome", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
  });

  test("all five chrome surfaces are mounted @feat:editor-shell.cockpit-modes @feat:editor-shell.context-toolbars @feat:editor-shell.panel-rail @feat:editor-shell.theme @feat:editor-shell.tool-rail @level:happy", async ({ page }) => {
    for (const sel of CHROME_SURFACES) {
      await expect(page.locator(sel).first()).toBeVisible();
    }
    // The right dock exists too (its tab strip only shows with >1 tab,
    // but the container is always present).
    await expect(page.locator("[data-right-dock]").first()).toBeAttached();
  });

  test("no chrome surface hardcodes an inline colour (var() tokens only) @feat:editor-shell.cockpit-modes @feat:editor-shell.context-toolbars @feat:editor-shell.panel-rail @feat:editor-shell.theme @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    const offenders: string[] = [];
    for (const sel of CHROME_SURFACES) {
      const found = await scanLiteralColours(page, sel);
      for (const f of found) offenders.push(`${sel} → ${f}`);
    }
    expect(offenders, "\n" + offenders.join("\n")).toEqual([]);
  });

  test("chrome text renders IBM Plex Sans @feat:editor-shell.cockpit-modes @feat:editor-shell.context-toolbars @feat:editor-shell.panel-rail @feat:editor-shell.theme @feat:editor-shell.tool-rail @level:happy", async ({ page }) => {
    const fonts = await page.evaluate((surfaces) => {
      const families = new Set<string>();
      for (const sel of surfaces) {
        const root = document.querySelector(sel);
        if (!root) continue;
        for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
          const ff = getComputedStyle(el as Element).fontFamily;
          if (ff) families.add(ff);
        }
      }
      return Array.from(families);
    }, CHROME_SURFACES);
    // Every resolved family on the chrome is one of the brand faces
    // (IBM Plex Sans for UI, IBM Plex Mono for tabular values).
    expect(fonts.length).toBeGreaterThan(0);
    for (const ff of fonts) {
      expect(ff, `unexpected chrome font: ${ff}`).toMatch(
        /IBM Plex (Sans|Mono)/,
      );
    }
  });

  test("the kit's semantic type classes are present on the frame", async ({
    page,
  }) => {
    const present = await page.evaluate(() => {
      const wanted = ["pg-label", "pg-value", "pg-ui-xs", "pg-wordmark"];
      const found = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("[class]"))) {
        for (const c of (el as HTMLElement).classList)
          if (wanted.includes(c)) found.add(c);
      }
      return Array.from(found);
    });
    // The wordmark + at least the uppercase kicker label + a mono value
    // are part of the always-present cockpit chrome.
    expect(present).toContain("pg-wordmark");
    expect(present).toContain("pg-label");
    expect(present).toContain("pg-value");
  });
});
