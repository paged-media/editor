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

// SDK Phase 3 — Character panel acceptance.
//
// The Character panel is the proof-of-concept declarative composition:
// every field renders from `character.composition.ts`, bindings
// resolve against the current content selection (mapped to
// `ElementId.storyRange`), and edits commit through the apply arm
// at `(NodeId::StoryRange, Character*)`.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 3 — Character panel (declarative composition)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    // The three property panels (Character, Stroke, Object) share
    // the "properties" group in dockview — only one is rendered
    // at a time. Activate Character explicitly before asserting.
    await openPanel(page, "paged.character");
  });

  test("AC-CHAR-1 — Character panel mounts and shows section title @feat:editor-shell.panels.character @feat:typography.font-selection @level:smoke", async ({
    page,
  }) => {
    // The Character panel is in `BUILT_IN_PANELS` with title "Character".
    // Dockview renders it as a tab; it should be visible by default in
    // the right-side group alongside Inspector / Layers.
    await expect(page.locator('[data-character-panel="ready"]')).toBeVisible();
    // The section hook comes from the composition's
    // `paged.layout.section` leaf with props.title = "Character".
    await expect(
      page.locator('[data-character-panel="ready"] [data-section="Character"]'),
    ).toBeVisible();
    // W2.1 (2026-06-06): every character formatting field flipped
    // seam→live on protocol v28. W2.4 (2026-06-07): the OPENTYPE chip
    // row also went live — each chip now WRITES its OT feature tag into
    // `characterOtfFeatures`. The composition carries ZERO `data-seam`
    // nodes.
    const seams = page.locator('[data-character-panel="ready"] [data-seam]');
    await expect(seams).toHaveCount(0);
    // The live family select is bespoke (reads the `fonts` collection).
    await expect(
      page.locator('[data-character-panel="ready"] [data-character-family]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-character-panel="ready"] [data-opentype-chip]'),
    ).toHaveCount(4);
    // Without a content selection the chips have no commit path → still
    // disabled (the mixed-state contract).
    await expect(
      page
        .locator('[data-character-panel="ready"] [data-opentype-chip]')
        .first(),
    ).toBeDisabled();
  });

  test("AC-CHAR-2 — fields render em-dash placeholder when no content selection @feat:editor-shell.panels.character @feat:typography.font-selection @level:happy", async ({
    page,
  }) => {
    // No content selection by default → every binding resolves to
    // null → every live leaf shows the em-dash placeholder INSIDE the
    // control (gallery pixel-parity: the chrome always renders).
    // W2.1: the panel is now fully live, so the mixed-control count
    // grew well past the pre-flip 4 (family/style/kerning/scale/skew/
    // case/position/language all render mixed). Assert the family
    // select + metric fields carry the sentinel rather than pinning a
    // brittle exact count.
    const mixed = page.locator('[data-character-panel="ready"] [data-mixed]');
    await expect(mixed.first()).toBeVisible();
    expect(await mixed.count()).toBeGreaterThanOrEqual(4);
    await expect(
      page.locator(
        '[data-character-panel="ready"] [data-character-family] [data-mixed]',
      ),
    ).toBeVisible();
  });

  test("AC-CHAR-3 — content selection over a real story populates Character fields @feat:editor-shell.panels.character @feat:typography.font-selection @level:happy", async ({
    page,
  }) => {
    // Use `paged.stories()` to find a valid story id without
    // hardcoding fixture details. Pick the first story with
    // non-zero characters, then set ContentSelection to [0, min(3, len))
    // — a homogeneous range where every CharacterRun shares font
    // properties so the snapshot's collapse returns Some(value).
    const seeded = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              executeScript: (s: string) => Promise<{
                output: string[];
                error: string | null;
              }>;
            };
            setContentSelection: (
              sel: { storyId: string; start: number; end: number } | null,
            ) => void;
          };
        }
      ).__canvas;
      const result = await c.client.executeScript(
        `JSON.stringify(JSON.parse(paged.stories())[0] || null)`,
      );
      if (result.error) return null;
      // The script's last-expression value lands in result.output.
      const json = result.output[0] ?? null;
      if (!json) return null;
      const first = JSON.parse(json);
      if (!first || first.characterCount === 0) return null;
      const end = Math.min(3, first.characterCount);
      c.setContentSelection({
        storyId: first.selfId,
        start: 0,
        end,
      });
      return { storyId: first.selfId, end };
    });
    expect(seeded).not.toBeNull();
    // Panel should now resolve at least the characterFillColor
    // binding (whatever value the runs share). The em-dash count
    // drops below 4 (we don't assert "0" because some fields may
    // genuinely be `Value::Length(None)` — see the LengthLeaf
    // null-vs-mixed distinction).
    await expect
      .poll(
        async () =>
          await page
            .locator('[data-character-panel="ready"] [data-mixed]')
            .count(),
      )
      .toBeLessThan(4);
  });

  test("AC-CHAR-4 — setContentSelection routes through __canvas without throwing @feat:editor-shell.panels.character @feat:typography.font-selection @level:happy", async ({
    page,
  }) => {
    // The shell exposes `setContentSelection` on the __canvas debug
    // surface so tests can drive content-scope bindings without
    // needing a click → text-mode → drag flow. This smoke test
    // verifies the wire is in place. A richer end-to-end test that
    // populates Character fields needs a public surface listing
    // story ids; that's Phase 3.x scope (the natural addition is a
    // `paged.stories()` script-side function returning self_id +
    // first-run offsets so a test can pick a non-trivial range).
    const ok = await page.evaluate(() => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            setContentSelection: (
              sel: { storyId: string; start: number; end: number } | null,
            ) => void;
          };
        }
      ).__canvas;
      if (typeof c.setContentSelection !== "function") return false;
      // Passing a placeholder id is fine — the worker rejects it
      // gracefully (the script-side bridge already proves this in
      // crates/paged-script/tests/script_basics.rs).
      c.setContentSelection({ storyId: "Story/__test__", start: 0, end: 3 });
      // Clear so it doesn't leak into the next test.
      c.setContentSelection(null);
      return true;
    });
    expect(ok).toBe(true);
  });

  test("AC-CHAR-5 — OpenType chips write characterOtfFeatures over a story range; round-trips @feat:editor-shell.panels.character @feat:typography.font-selection @level:happy", async ({
    page,
  }) => {
    // W2.4 — the OTF chip row writes the opaque `characterOtfFeatures`
    // tag string. Drive the underlying path over a homogeneous story
    // range via `paged.set`; read back via `paged.inspect`; undo.
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          mutate(op: unknown): Promise<unknown>;
          undo(): Promise<unknown>;
        };
        setContentSelection?: (
          sel: { storyId: string; start: number; end: number } | null,
        ) => void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const stories = await dbg.client
        .executeScript("paged.stories()")
        .then((r) => JSON.parse(r.output[0] ?? "[]"));
      if (!stories.length) return null;
      const story = stories[0] as {
        selfId: string;
        characterCount: number;
      };
      if (!story || story.characterCount === 0) return null;
      const start = 0;
      const end = Math.max(1, Math.min(story.characterCount, 4));
      const addr = `storyRange:${story.selfId}@${start}..${end}`;
      // ElementId::StoryRange wire shape: { kind, id: { story_id,
      // start, end } } — the same the content-scope binding emits.
      const elementId = {
        kind: "storyRange",
        id: { story_id: story.selfId, start, end },
      };

      const readOtf = async () => {
        const json = await dbg.client!.executeScript(
          `paged.inspect(${JSON.stringify(addr)});`,
        ).then((r) => r.output[0] ?? "");
        const inspect = JSON.parse(json) as {
          entries: Array<{
            path: string;
            value: { type: string; value: unknown } | null;
          }>;
        };
        return (
          inspect.entries.find((e) => e.path === "characterOtfFeatures")?.value
            ?.value ?? null
        );
      };

      const before = await readOtf();
      // Write the tag string the chip row produces (Frac + Ordn →
      // "frac ordn") through the same setElementProperty op the chip's
      // onCommit takes.
      await dbg.client.mutate({
        op: "setElementProperty",
        args: {
          elementId,
          path: "characterOtfFeatures",
          value: { type: "text", value: "frac ordn" },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      const after = await readOtf();

      await dbg.client.undo();
      await new Promise((r) => setTimeout(r, 30));
      const restored = await readOtf();

      return { before, after, restored };
    });

    expect(result).not.toBeNull();
    expect(result!.after).toBe("frac ordn");
    expect(result!.restored).toBe(result!.before);
  });
});
