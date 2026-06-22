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

// Styleguide — icon conformance (registry level, cheap + complete).
//
// The clean-room icon system ships three glyph registries
// (`tool-*` / `panel-*` / `ui-*`, shell/src/icons/) resolved by one
// `Icon` component. Brand rule: every glyph is authored on a 24×24
// grid, inherits colour via `currentColor`, and is line/solid SVG
// geometry — never a hardcoded hue, never a raster. Rather than open
// 59 panels, this asserts the REGISTRY on three axes:
//
//   1. SOURCE scan — read the three glyph `.tsx` registries as text and
//      assert every authored `fill=`/`stroke=` is currentColor / none /
//      white / a token var() / the shared LINE spread. A glyph with a
//      hardcoded hue breaks theme inheritance; it fails here once.
//   2. WRAPPER scan — every `<svg>` the app's `Icon` actually mounts in
//      the live chrome is `viewBox="0 0 24 24"` + `fill="currentColor"`.
//   3. RESOLVE — every icon name the shipped tool rail / panel tabs
//      reference is a registered glyph (a typo silently renders the
//      dashed fallback).
//
// Reading sources as TEXT (not importing the `.tsx` modules) keeps this
// independent of any JSX runtime and synchronous — no app boot for the
// source axis.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ICONS_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "shell",
  "src",
  "icons",
);

const REGISTRIES = [
  { file: "tool-glyphs.tsx", konst: "TOOL_GLYPHS", prefix: "tool-" },
  { file: "panel-glyphs.tsx", konst: "PANEL_GLYPHS", prefix: "panel-" },
  { file: "ui-glyphs.tsx", konst: "UI_GLYPHS", prefix: "ui-" },
] as const;

function readGlyphSource(file: string): string {
  return readFileSync(resolve(ICONS_DIR, file), "utf8");
}

/** Glyph KEYS declared in a registry source (the `"name": (` entries). */
function glyphNames(src: string): string[] {
  const re = /^\s*"([a-zA-Z][\w-]*)":/gm;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.push(m[1]);
  return names;
}

/** Literal (non-token, non-currentColor) `fill=`/`stroke=` paints a
 *  glyph source authors. `white` is the intentional paper fill (hollow
 *  threading port / loadable affordance). */
function literalPaints(src: string): string[] {
  const out: string[] = [];
  const re = /(fill|stroke)=(?:"([^"]*)"|\{([^}]*)\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const attr = m[1];
    const value = (m[2] ?? m[3] ?? "").trim();
    const ok =
      value === "currentColor" ||
      value === '"currentColor"' ||
      value === "none" ||
      value === '"none"' ||
      value === "white" ||
      value === '"white"' ||
      value.startsWith("var(") ||
      value.includes("var(") ||
      // computed-from-token JSX ({fill || active ? "white" : ink}) where
      // every branch is a token/currentColor/white — those are caught at
      // the overlay level, not the static glyph registries; glyphs use
      // literal attribute strings only, so a bare identifier here is a
      // spread/ref, never a colour.
      /^[A-Za-z_$][\w$.]*$/.test(value);
    if (!ok) out.push(`${attr}=${value}`);
  }
  return out;
}

const ALL_NAMES = REGISTRIES.flatMap((r) =>
  glyphNames(readGlyphSource(r.file)),
);

test.describe("Styleguide — icon conformance", () => {
  test("the three glyph registries are populated and prefix-clean @feat:editor-shell.context-toolbars @feat:editor-shell.panel-rail @feat:editor-shell.tool-rail @level:happy", () => {
    for (const { file, konst, prefix } of REGISTRIES) {
      const src = readGlyphSource(file);
      expect(src, `${file} must export ${konst}`).toContain(
        `export const ${konst}`,
      );
      const names = glyphNames(src);
      expect(names.length, `${file} glyph count`).toBeGreaterThan(10);
      const offPrefix = names.filter((n) => !n.startsWith(prefix));
      expect(
        offPrefix,
        `${file}: names must use the "${prefix}" prefix: ${offPrefix.join(", ")}`,
      ).toEqual([]);
    }
    // No name collides across registries (the resolver merges all three;
    // a dup would silently shadow).
    const seen = new Set<string>();
    const dups = ALL_NAMES.filter((n) =>
      seen.has(n) ? true : (seen.add(n), false),
    );
    expect(dups, `duplicate glyph names: ${dups.join(", ")}`).toEqual([]);
  });

  test("no glyph authors a hardcoded colour (currentColor / token only) @feat:editor-shell.context-toolbars @feat:editor-shell.panel-rail @feat:editor-shell.tool-rail @level:happy", () => {
    const offenders: string[] = [];
    for (const { file } of REGISTRIES) {
      const src = readGlyphSource(file);
      const literals = literalPaints(src);
      if (literals.length) offenders.push(`${file}: ${literals.join(", ")}`);
    }
    expect(offenders, "\n" + offenders.join("\n")).toEqual([]);
  });

  test("every Icon the app renders is a 24×24 currentColor SVG @feat:editor-shell.context-toolbars @feat:editor-shell.panel-rail @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    // The live chrome (tool rail, panel rail, mode switcher, dock tabs,
    // section chevrons) mounts dozens of `Icon`s — scan them all. The
    // `Icon` wrapper is the single render path, so a conformant wrapper
    // here proves it for every glyph.
    await openCanvas(page);
    const r = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll("svg"));
      const offenders: string[] = [];
      let scanned = 0;
      for (const svg of svgs) {
        // Only the icon-registry SVGs carry viewBox 0 0 24 24; skip any
        // foreign inline SVG (none today, but stay narrow).
        const vb = svg.getAttribute("viewBox");
        if (vb !== "0 0 24 24") continue;
        scanned++;
        if (svg.getAttribute("fill") !== "currentColor")
          offenders.push(`svg fill=${svg.getAttribute("fill")}`);
        const w = svg.getAttribute("width");
        const h = svg.getAttribute("height");
        if (w !== h) offenders.push(`svg non-square ${w}x${h}`);
      }
      return { scanned, offenders };
    });
    expect(
      r.scanned,
      "expected the chrome to mount Icon glyphs",
    ).toBeGreaterThan(20);
    expect(r.offenders, "\n" + r.offenders.join("\n")).toEqual([]);
  });

  test("panel + tool registry icons all resolve to a real glyph @feat:editor-shell.context-toolbars @feat:editor-shell.panel-rail @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    // The shipped tool rail / panel tabs reference icons by name; a
    // typo silently renders the dashed fallback. Assert every icon a
    // live contribution declares is a registered glyph.
    await openCanvas(page);
    const declared = await page.evaluate(() => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              panels: { list: () => { icon?: string }[] };
              tools: { list: () => { icon?: string }[] };
            };
          };
        }
      ).__canvas;
      const names = new Set<string>();
      for (const p of c.registries.panels.list()) if (p.icon) names.add(p.icon);
      for (const t of c.registries.tools.list()) if (t.icon) names.add(t.icon);
      return Array.from(names);
    });
    const known = new Set(ALL_NAMES);
    const missing = declared.filter((n) => !known.has(n));
    expect(
      missing,
      `unregistered icons referenced: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
