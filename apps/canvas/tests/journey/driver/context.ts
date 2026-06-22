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

// The journey oracle — `readContext` snapshots the editor's observable
// context in one round-trip; `diffContext` compares it to an
// `ExpectedContext`; `expectContext` polls until they agree (selection
// round-trips through the worker) and throws a diff that names the exact
// intent + dimension that regressed — never a pixel blob.

import { expect, type Page } from "@playwright/test";

import type { ExpectedContext } from "./context-contract";

export interface ObservedContext {
  tool: string | null;
  inspectorKind: string | null;
  sectionsPresent: string[];
  elementCount: number;
  elementKinds: string[];
  contentSelection: "none" | "caret" | "range";
  panelsOpen: string[];
  activePanel: string | null;
  editContextType: string | null;
  overlayHandles: "frame8" | "textBeam" | "anchorPoints" | "none";
  handleCount: number;
}

/** Snapshot every declarative dimension atomically (DOM + `__canvas` +
 *  `debugContext`) so dimensions can't settle between reads. */
export async function readContext(page: Page): Promise<ObservedContext> {
  return page.evaluate(() => {
    const w = globalThis as unknown as {
      __canvas?: {
        activeTool?: string;
        elementSelection?: Array<{ kind?: string }>;
        contentSelection?: { start: number; end: number } | null;
        debugContext?: () => {
          panels?: { open?: string[]; active?: string | null };
          editContext?: { type?: string } | null;
        };
      };
    };
    const c = w.__canvas;

    const propsRoot = document.querySelector('[data-properties-panel="ready"]');
    const inspectorKind = propsRoot?.getAttribute("data-inspector-kind") ?? null;
    const sectionsPresent = Array.from(
      document.querySelectorAll("[data-properties-section]"),
    )
      .map((e) => e.getAttribute("data-properties-section"))
      .filter((s): s is string => !!s);

    // Active tool: prefer the rail's marked slot (matches activateTool);
    // fall back to the __canvas scalar.
    const toolEl = document.querySelector(
      '[data-tool-slot][data-active="true"]',
    );
    const tool =
      toolEl?.getAttribute("data-tool-slot") ?? c?.activeTool ?? null;

    const sel = c?.elementSelection ?? [];
    const elementKinds = sel
      .map((s) => s?.kind)
      .filter((k): k is string => !!k);

    const cs = c?.contentSelection ?? null;
    const contentSelection = !cs
      ? "none"
      : cs.start !== cs.end
        ? "range"
        : "caret";

    const dbg = c?.debugContext?.() ?? {};

    // Selection overlay (semantic markers on the SVG overlay): anchor
    // dots beat the text I-beam beat the eight resize handles.
    const handleCount = document.querySelectorAll(
      "[data-selection-handle]",
    ).length;
    const overlayHandles = document.querySelector("[data-anchor]")
      ? "anchorPoints"
      : document.querySelector("[data-text-caret]")
        ? "textBeam"
        : handleCount > 0
          ? "frame8"
          : "none";

    return {
      tool,
      inspectorKind,
      sectionsPresent,
      elementCount: sel.length,
      elementKinds,
      contentSelection,
      panelsOpen: dbg.panels?.open ?? [],
      activePanel: dbg.panels?.active ?? null,
      editContextType: dbg.editContext?.type ?? null,
      overlayHandles,
      handleCount,
    } as ObservedContext;
  });
}

/** Structured diffs — one readable line per regressed dimension. */
export function diffContext(
  obs: ObservedContext,
  exp: ExpectedContext,
): string[] {
  const d: string[] = [];
  const tag = exp.intent;
  const cmp = (dim: string, want: unknown, got: unknown) => {
    if (want !== undefined && want !== got) {
      d.push(`[${tag}] ${dim}: expected ${JSON.stringify(want)}, was ${JSON.stringify(got)}`);
    }
  };

  cmp("tool", exp.tool, obs.tool);
  cmp("inspectorKind", exp.inspectorKind, obs.inspectorKind);
  cmp("contentSelection", exp.contentSelection, obs.contentSelection);

  if (exp.elementSelection?.count !== undefined) {
    cmp("elementSelection.count", exp.elementSelection.count, obs.elementCount);
  }
  if (
    exp.elementSelection?.kind !== undefined &&
    !obs.elementKinds.includes(exp.elementSelection.kind)
  ) {
    d.push(
      `[${tag}] elementSelection.kind: expected a ${exp.elementSelection.kind}; kinds were [${obs.elementKinds.join(", ")}]`,
    );
  }

  for (const s of exp.sectionsPresent ?? []) {
    if (!obs.sectionsPresent.includes(s)) {
      d.push(
        `[${tag}] section "${s}" expected present; sections were [${obs.sectionsPresent.join(", ")}]`,
      );
    }
  }
  for (const s of exp.sectionsAbsent ?? []) {
    if (obs.sectionsPresent.includes(s)) {
      d.push(`[${tag}] section "${s}" expected ABSENT but was present`);
    }
  }

  for (const id of exp.panelsOpen ?? []) {
    if (!obs.panelsOpen.includes(id)) {
      d.push(
        `[${tag}] panel "${id}" expected open; open were [${obs.panelsOpen.join(", ")}]`,
      );
    }
  }
  cmp("activePanel", exp.activePanel, obs.activePanel);
  if (exp.editContext !== undefined) {
    cmp("editContext.type", exp.editContext.type, obs.editContextType);
  }
  if (exp.overlay?.handles !== undefined) {
    cmp("overlay.handles", exp.overlay.handles, obs.overlayHandles);
  }
  if (exp.overlay?.handleCount !== undefined) {
    cmp("overlay.handleCount", exp.overlay.handleCount, obs.handleCount);
  }

  return d;
}

/** Poll until the observed context matches `exp` (selection state
 *  round-trips through the worker, so the context settles a tick or two
 *  after the action). On timeout, throw a diff listing every regressed
 *  dimension prefixed with the intent. */
export async function expectContext(
  page: Page,
  exp: ExpectedContext,
): Promise<void> {
  let diffs: string[] = [];
  try {
    await expect
      .poll(
        async () => {
          diffs = diffContext(await readContext(page), exp);
          return diffs.length;
        },
        { timeout: 6000, message: exp.intent },
      )
      .toBe(0);
  } catch {
    throw new Error(
      `Context mismatch for intent "${exp.intent}":\n` +
        diffs.map((x) => "  • " + x).join("\n"),
    );
  }
}
