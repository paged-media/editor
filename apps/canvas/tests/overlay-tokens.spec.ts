// Styleguide F — the canvas-overlay colour tokens. The overlays
// author `stroke="var(--overlay-*)"` attributes; SVG presentation
// attributes can't resolve var(), so globals.css re-applies each
// token through an attribute-selector CSS rule. This spec guards
// that mechanism AND the design-system values themselves (magenta
// selection, violet guides — the authentic DTP cues).

import { test, expect } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

test("overlay token attributes resolve via the CSS hook", async ({ page }) => {
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
  expect(r.selection).toBe("rgb(224, 64, 143)"); // #e0408f magenta
  expect(r.guide).toBe("rgb(124, 92, 255)"); // #7c5cff violet
  expect(r.snap).toBe("rgb(20, 184, 166)"); // dark-theme snap teal
  expect(r.target).toBe("rgb(220, 38, 38)"); // hit/target red
});
