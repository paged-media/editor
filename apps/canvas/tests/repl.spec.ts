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

// Scripting Stage 1.b — REPL acceptance. Tests the parser AND the
// dispatch chain end-to-end. The panel itself is a thin loop; the
// architectural commitment is that every command produces a typed
// Mutation indistinguishable from one a UI control would have
// fired.

import { dirname, resolve as pathResolve } from "node:path";
import type { ElementId } from "@paged-media/client";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";
import { parseLine } from "../src/repl/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;
const TEXT_FRAME_ID = "ua365e1";

interface PropertyEntry {
  path: string;
  value: { type: string; value: unknown };
}
interface ElementProperties {
  id: { kind: string; id: string };
  kind: string;
  entries: PropertyEntry[];
}
interface CanvasGlobal {
  client: {
    mutate: (m: unknown) => Promise<unknown>;
    undo: () => Promise<unknown>;
    redo: () => Promise<unknown>;
    // `ElementId`, not a hand-narrowed `{kind: string; id: string}`.
    // The real union's table / tableCell / storyRange variants carry
    // OBJECT ids, so the narrowed mirror rejected exactly the ids the
    // wire actually uses — a second, smaller copy of a real type, which
    // is the trap this codebase already records for the plugin contract.
    elementProperties: (id: ElementId) => Promise<ElementProperties | null>;
  };
}

async function dispatch(
  page: import("@playwright/test").Page,
  line: string,
): Promise<{ kind: string; payload: unknown }> {
  // Parse the line in this process (avoiding a worker round-trip
  // for the grammar) then route through the page's __canvas client.
  const parsed = parseLine(line);
  if (parsed.kind === "error") {
    return { kind: "error", payload: parsed.message };
  }
  if (parsed.kind === "undo") {
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    return { kind: "undo", payload: null };
  }
  if (parsed.kind === "redo") {
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.redo();
    });
    return { kind: "redo", payload: null };
  }
  if (parsed.kind === "inspect") {
    const props = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementProperties(id);
      },
      { id: parsed.elementId },
    );
    return { kind: "inspect", payload: props };
  }
  await page.evaluate(
    async ({ mutation }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.mutate(mutation);
    },
    { mutation: parsed.mutation },
  );
  return { kind: "mutation", payload: parsed.mutation };
}

async function fetchOpacity(
  page: import("@playwright/test").Page,
  id: string,
): Promise<unknown> {
  const props = await page.evaluate(
    async ({ id }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.elementProperties({ kind: "textFrame", id });
    },
    { id },
  );
  if (!props) throw new Error("element not found");
  const entry = props.entries.find((e: PropertyEntry) => e.path === "frameOpacity");
  if (!entry) throw new Error("frameOpacity missing");
  return entry.value.value;
}

test.describe("Scripting Stage 1.b — REPL", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-REPL-1 — `set <frame> frameOpacity length:50` updates the frame @feat:scripting.repl @level:happy", async ({
    page,
  }) => {
    await dispatch(
      page,
      `set textFrame:${TEXT_FRAME_ID} frameOpacity length:50`,
    );
    expect(await fetchOpacity(page, TEXT_FRAME_ID)).toBe(50);
  });

  test("AC-REPL-2 — `set <frame> frameFillColor colorRef:Color/Red` updates fill @feat:scripting.repl @level:happy", async ({
    page,
  }) => {
    await dispatch(
      page,
      `set textFrame:${TEXT_FRAME_ID} frameFillColor colorRef:Color/Red`,
    );
    const props = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementProperties({ kind: "textFrame", id });
      },
      { id: TEXT_FRAME_ID },
    );
    const fill = props!.entries.find(
      (e: PropertyEntry) => e.path === "frameFillColor",
    )!.value.value;
    expect(fill).toBe("Color/Red");
  });

  test("AC-REPL-3 — undo and redo round-trip @feat:scripting.repl @level:happy", async ({ page }) => {
    await dispatch(
      page,
      `set textFrame:${TEXT_FRAME_ID} frameOpacity length:25`,
    );
    expect(await fetchOpacity(page, TEXT_FRAME_ID)).toBe(25);
    await dispatch(page, "undo");
    expect(await fetchOpacity(page, TEXT_FRAME_ID)).not.toBe(25);
    await dispatch(page, "redo");
    expect(await fetchOpacity(page, TEXT_FRAME_ID)).toBe(25);
  });

  test("AC-REPL-4 — inspect returns an ElementProperties payload @feat:scripting.repl @level:happy", async ({
    page,
  }) => {
    const result = await dispatch(page, `inspect textFrame:${TEXT_FRAME_ID}`);
    expect(result.kind).toBe("inspect");
    const props = result.payload as ElementProperties;
    expect(props.kind).toBe("TextFrame");
    expect(props.entries.length).toBeGreaterThan(0);
  });

  test("AC-REPL-5 — parse errors don't dispatch", async ({ page }) => {
    const before = await fetchOpacity(page, TEXT_FRAME_ID);
    const result = await dispatch(page, "set");
    expect(result.kind).toBe("error");
    // Document state untouched.
    expect(await fetchOpacity(page, TEXT_FRAME_ID)).toEqual(before);
  });
});
