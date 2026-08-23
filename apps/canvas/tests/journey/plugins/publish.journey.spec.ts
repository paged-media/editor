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

// Journey: the paged.publish plugin round-trip through the editor host.
//
// ADR-022 Phase 4/5 host-integration smoke: author content, pull the IDML
// EXPORTER through the exporter registry (the Export Center path), then feed
// the produced bytes back through the IMPORTER registry (the same door the
// Open command and drag-drop use — a destructive nativeDocument.open) and
// prove the content survived by pixel delta against a blank document.
// IDML *fidelity* is core's gate; this journey proves the editor wiring.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const IDML_EXPORTER = "media.paged.publish.exporter.idml";

async function exportIdml(
  page: Page,
): Promise<{ bytes: number[]; magic: string } | { reason: string }> {
  return page.evaluate(async (exporterId) => {
    const reg = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            exporters?: {
              list: () => Array<{
                id: string;
                export: () =>
                  | Promise<{ bytes: Uint8Array; fileName: string } | null>
                  | { bytes: Uint8Array; fileName: string }
                  | null;
              }>;
            };
          };
        };
      }
    ).__canvas.registries.exporters;
    if (!reg) return { reason: "host serves no exporter registry" };
    const exp = reg.list().find((e) => e.id === exporterId);
    if (!exp) return { reason: `exporter ${exporterId} not registered` };
    const result = await exp.export();
    if (!result) return { reason: "exporter returned null" };
    const b = result.bytes;
    return {
      bytes: Array.from(b),
      magic: String.fromCharCode(b[0], b[1], b[2], b[3]),
    };
  }, IDML_EXPORTER);
}

async function importBytes(page: Page, name: string, bytes: number[]) {
  return page.evaluate(
    async ({ name, bytes }) => {
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              importers: {
                resolve: (
                  name: string,
                  mime?: string,
                ) => { id: string; import: (f: { name: string; bytes: Uint8Array }) => void | Promise<void> } | null;
              };
            };
          };
        }
      ).__canvas.registries.importers;
      const imp = reg.resolve(name);
      if (!imp) return { reason: `no importer claims ${name}` };
      await imp.import({ name, bytes: Uint8Array.from(bytes) });
      return { id: imp.id };
    },
    { name, bytes },
  );
}

test.describe("journey · paged.publish plugin", () => {
  test("a designer exports IDML through the publish exporter and reimports it through the importer registry @feat:plugin-publish.idml-importer @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Author something visible (a bare frame has no fill — paint it),
    // prove it painted.
    const blank = await designer.renderBytes();
    const rect = await designer.drawRectangle({ x0: 120, y0: 140, x1: 380, y1: 340 });
    await designer.applyFill("rectangle", rect);
    await expect
      .poll(async () => designer.renderDiffPixels(blank, await designer.renderBytes()), {
        timeout: 15_000,
      })
      .toBeGreaterThan(64);

    // EXPORT — the Export Center path (registry, not a menu click).
    const out = await exportIdml(page);
    expect("reason" in out ? out.reason : "", "idml export did not drive").toBe("");
    if ("reason" in out) return;
    expect(out.magic.startsWith("PK"), "IDML is a ZIP (PK…)").toBe(true);
    expect(out.bytes.length).toBeGreaterThan(1000);

    // Fresh blank document, then REIMPORT the produced bytes through the
    // importer registry (destructive nativeDocument.open — same lane as the
    // Open door / drag-drop).
    await designer.newDocument();
    const blank2 = await designer.renderBytes();
    const imported = await importBytes(page, "roundtrip.idml", out.bytes);
    expect(
      "reason" in imported ? imported.reason : "",
      "idml import did not drive",
    ).toBe("");

    // The rectangle must come back — poll the pixel delta against blank
    // (single cold sample flakes; see the journey-flake lesson).
    await expect
      .poll(async () => designer.renderDiffPixels(blank2, await designer.renderBytes()), {
        timeout: 20_000,
      })
      .toBeGreaterThan(64);
    // eslint-disable-next-line no-console
    console.log(`[journey] paged.publish round-trip bytes=${out.bytes.length}`);
  });
});
