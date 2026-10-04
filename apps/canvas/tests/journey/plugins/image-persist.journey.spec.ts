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

// Journey: a paged.image session PERSISTS in the document (protocol 66).
//
// Until protocol 66 a layer stack lived only in the plugin's engine: the
// document saw an Apply as a scene-layer preview and nothing else, so a
// save dropped the layers and a reopen showed the original image. The
// commit path changes three things at once, and this journey drives each
// through the real editor:
//
//   · COMMIT — one batch of `replaceImageBytes` (the baked composite, sent
//     as bytes through `mutateWithBytes`) + `setPluginMetadata` (marker v2
//     naming the stored revision). The layers are written as container
//     parts FIRST, so the marker never names a revision that is missing.
//   · UNDO — the batch is one document step: Edit ▸ Undo puts the original
//     image and the v1 marker back; Redo re-applies the commit.
//   · WILL-SAVE — Save (.paged) waits for the plugin, which commits edits
//     it has not given the document yet, so the file holds what the frame
//     shows.
//   · REOPEN — re-ingesting a frame whose placed bytes hash to the
//     marker's `baked` restores the stored layers, in the same session and
//     after the saved file is opened again through File ▸ Open.
//
// Lane split: ingest, the ownership marker and the edit-context entry are
// host state and run on both lanes. Every pixel edit (and so every commit,
// which bakes the GPU composite) needs a WebGPU device.

import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { readZipText, zipEntryNames } from "../../e2e/harness/read-zip";
import { Designer } from "../driver/designer";

const ADJ_PANEL = "media.paged.image.panel.adjustments";
const MARKER_KEY = "x-paged:media.paged.image";
const PARTS_BASE = "paged/media.paged.image/";

const CMD = {
  adjust: "media.paged.image.command.adjustSelected",
  addLayer: "media.paged.image.command.addLayer",
  fillNoise: "media.paged.image.command.fillNoise",
  fillForeground: "media.paged.image.command.fillForeground",
  commit: "media.paged.image.command.commitImage",
  undo: "paged.editor.undo",
  redo: "paged.editor.redo",
  savePaged: "paged.file.savePaged",
  open: "paged.file.openIdml",
} as const;

interface Marker {
  v?: number;
  data?: { owns?: string; rev?: number; record?: string; baked?: string };
}

/** Synthesize a real PNG in the page and PLACE it in `frame` through the
 *  binary commit lane — the frame then holds encoded bytes the plugin's
 *  `assets.getPlacedImage` reads, which a bare `placeImage` link does not.
 *  Returns the reply kind. */
async function placePng(
  page: Page,
  frame: string,
  width: number,
  height: number,
): Promise<string> {
  return page.evaluate(
    async ({ frame, width, height }) => {
      const cv = new OffscreenCanvas(width, height);
      const ctx = cv.getContext("2d");
      if (!ctx) return "no 2d context";
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, "#1830ff");
      g.addColorStop(0.5, "#20c040");
      g.addColorStop(1, "#ff3018");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      const bytes = new Uint8Array(
        await (await cv.convertToBlob({ type: "image/png" })).arrayBuffer(),
      );
      const paged = (
        globalThis as unknown as {
          __paged: {
            mutateWithBytes(m: unknown, b: Uint8Array, t?: boolean): Promise<{ kind: string }>;
          };
        }
      ).__paged;
      const reply = await paged.mutateWithBytes(
        {
          op: "batch",
          args: { ops: [{ op: "replaceImageBytes", args: { elementId: frame, bytes: [] } }] },
        },
        bytes,
        true,
      );
      return reply.kind;
    },
    { frame, width, height },
  );
}

/** SHA-256 (hex) of the frame's placed encoded bytes, or null. */
async function placedSha(page: Page, frame: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    const paged = (
      globalThis as unknown as {
        __paged: {
          client: {
            placedAssetBytesBinary(id: string): Promise<{ encoded: Uint8Array } | null>;
          };
        };
      }
    ).__paged;
    const placed = await paged.client.placedAssetBytesBinary(id);
    if (!placed) return null;
    const d = await crypto.subtle.digest("SHA-256", placed.encoded.slice());
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
  }, frame);
}

/** The paged.image marker on the frame — read the way the SDK's
 *  `document.getMetadata` reads it (the element's properties). */
async function marker(page: Page, frame: string): Promise<Marker | null> {
  return page.evaluate(
    async ({ id, key }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              send(m: unknown): Promise<{
                kind: string;
                payload: {
                  result?: {
                    entries: Array<{
                      value?: { type?: string; value?: { key?: string; value?: unknown } };
                    }>;
                  } | null;
                };
              }>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.send({
        kind: "requestElementProperties",
        payload: { id: { kind: "rectangle", id } },
      });
      if (reply.kind !== "elementProperties" || !reply.payload.result) return null;
      for (const e of reply.payload.result.entries) {
        const v = e.value;
        if (v?.type === "pluginMetadata" && v.value?.key === key && typeof v.value.value === "string") {
          return JSON.parse(v.value.value) as Marker;
        }
      }
      return null;
    },
    { id: frame, key: MARKER_KEY },
  );
}

/** A container part, by its full `paged/…` path, as text (or null). */
async function partText(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (p) => {
    const paged = (
      globalThis as unknown as {
        __paged: { parts: { read(path: string): Promise<Uint8Array | null> } };
      }
    ).__paged;
    const b = await paged.parts.read(p);
    return b ? new TextDecoder().decode(b) : null;
  }, path);
}

async function editContextType(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { debugContext?: () => { editContext?: { type?: string } | null } };
        }
      ).__canvas.debugContext?.().editContext?.type ?? null,
  );
}

/** "Layers (N)". */
async function layerCount(page: Page): Promise<number> {
  const t = (await page.locator("[data-image-layers-title]").first().textContent()) ?? "";
  const m = t.match(/\((\d+)\)/);
  return m ? Number(m[1]) : 0;
}

/** Undo depth from the journal readout ("History: N undo / M redo"). */
async function undoDepth(page: Page): Promise<number> {
  const el = page.locator("[data-image-history-readout]");
  if ((await el.count()) === 0) return 0;
  const m = ((await el.first().textContent()) ?? "").match(/History:\s*(\d+)\s*undo/);
  return m ? Number(m[1]) : 0;
}

async function statusText(page: Page): Promise<string> {
  return (await page.locator("[data-image-status]").first().textContent()) ?? "";
}

async function sourceNote(page: Page): Promise<string> {
  const el = page.locator("[data-image-layers-source-note]");
  return (await el.count()) ? ((await el.first().textContent()) ?? "") : "";
}

/** Select the frame and run "Adjust image": ingest its placed bytes into
 *  the session (restoring stored layers when the marker allows) and enter
 *  the `rasterImage` edit context. */
async function adjust(designer: Designer, page: Page, frame: string): Promise<void> {
  await designer.selectElement("rectangle", frame);
  await designer.runCommand(CMD.adjust);
  await designer.openPanel(ADJ_PANEL);
  await expect.poll(() => layerCount(page), { timeout: 20_000 }).toBeGreaterThan(0);
}

/** Save (.paged) through the real command and return the downloaded bytes. */
async function savePaged(designer: Designer, page: Page): Promise<Buffer> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await designer.runCommand(CMD.savePaged);
  const file = await (await download).path();
  return readFileSync(file);
}

test.describe("journey · paged.image persistence", () => {
  test("a committed layer stack is placed, undoable, saved before a save, and reopened from the file @feat:image.io.persistence @feat:image.editor.layers @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(8 * 60_000);
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 360, y1: 320 });
    expect(frame, "drew a target frame").not.toBe("");
    expect(await placePng(page, frame, 160, 120), "placed real PNG bytes").toBe(
      "mutationApplied",
    );
    const original = await placedSha(page, frame);
    expect(original, "the frame holds encoded bytes").not.toBeNull();

    // ── 1. INGEST + CONTEXT (both lanes). "Adjust image" reads the placed
    //    bytes, stamps the v1 ownership marker, and — protocol 66 — enters
    //    the rasterImage edit context through `shell.enterEditContext`. ──
    await adjust(designer, page, frame);
    await expect
      .poll(async () => (await marker(page, frame))?.v ?? null, {
        timeout: 15_000,
        message: "ingest stamps the v1 ownership marker",
      })
      .toBe(1);
    await expect
      .poll(() => editContextType(page), {
        timeout: 15_000,
        message: "Adjust image enters the rasterImage edit context",
      })
      .toBe("rasterImage");

    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "a commit bakes the GPU composite and every pixel edit is a WGSL dispatch (no CPU path). Ingest, the marker and the edit-context entry ran on this lane; run `pnpm --filter paged-canvas test:journeys:gpu` for commit / undo / will-save / reopen",
      );
    }

    // ── 2. AN UNCOMMITTED STACK EDIT: a new layer, filled with noise. ──
    const base = await layerCount(page);
    await designer.runCommand(CMD.addLayer);
    await expect.poll(() => layerCount(page), { timeout: 15_000 }).toBe(base + 1);
    await designer.runCommand(CMD.fillNoise);
    await expect.poll(() => undoDepth(page), { timeout: 20_000 }).toBeGreaterThan(0);
    expect(
      await placedSha(page, frame),
      "an edit alone does not touch the document",
    ).toBe(original);

    // ── 3. COMMIT — placed bytes change, marker v2 names revision 1, and
    //    the revision's record (the manifest's `imageSession` part type,
    //    `f/<frame>/r<rev>.json`) and every buffer it names (its
    //    `imageLayerData` parts, `px/<sha256>.bin`) are in the container. ──
    await designer.runCommand(CMD.commit);
    await expect
      .poll(async () => (await marker(page, frame))?.v ?? null, {
        timeout: 30_000,
        message: "the commit writes marker v2",
      })
      .toBe(2);
    const m1 = (await marker(page, frame))!;
    expect(m1.data).toMatchObject({ owns: "pixels", rev: 1 });
    expect(m1.data?.record).toMatch(/^f\/.+\/r1\.json$/);
    const baked1 = await placedSha(page, frame);
    expect(baked1, "the commit replaced the placed bytes").not.toBe(original);
    expect(baked1, "marker.baked is the hash of the placed bytes").toBe(m1.data?.baked);
    const record1 = JSON.parse((await partText(page, PARTS_BASE + m1.data!.record!)) ?? "null") as {
      v: number;
      manifest: string;
      buffers: string[];
      baked: string;
    } | null;
    expect(record1, "the revision record is a container part").not.toBeNull();
    expect(record1!.baked).toBe(baked1);
    expect(record1!.buffers.length, "both layers' pixels are stored").toBeGreaterThanOrEqual(2);
    for (const sha of [record1!.manifest, ...record1!.buffers]) {
      expect(
        await page.evaluate(
          async (p) =>
            (
              await (
                globalThis as unknown as {
                  __paged: { parts: { read(p: string): Promise<Uint8Array | null> } };
                }
              ).__paged.parts.read(p)
            ) !== null,
          `${PARTS_BASE}px/${sha}.bin`,
        ),
        `layer data px/${sha.slice(0, 12)}… is stored`,
      ).toBe(true);
    }
    // eslint-disable-next-line no-console
    console.log(`[journey] image commit: ${await statusText(page)}`);

    // ── 4. DOCUMENT UNDO reverts the commit; REDO re-applies it. Leave the
    //    edit context first: inside it Edit ▸ Undo steps the IMAGE's
    //    journal (ADR 012), which is the other tier. ──
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press("Escape");
    await expect
      .poll(() => editContextType(page), { timeout: 10_000, message: "Esc leaves the context" })
      .toBeNull();
    await designer.runCommand(CMD.undo);
    await expect
      .poll(() => placedSha(page, frame), {
        timeout: 15_000,
        message: "document undo puts the original image back",
      })
      .toBe(original);
    expect((await marker(page, frame))?.v, "…and the v1 marker").toBe(1);
    await designer.runCommand(CMD.redo);
    await expect
      .poll(() => placedSha(page, frame), { timeout: 15_000, message: "redo re-applies the commit" })
      .toBe(baked1);
    expect((await marker(page, frame))?.data?.rev).toBe(1);

    // ── 5. REOPEN IN-SESSION — re-ingesting the frame (whose bytes hash to
    //    marker.baked) restores the two stored layers, not one flat one. ──
    await adjust(designer, page, frame);
    await expect
      .poll(() => sourceNote(page), { timeout: 20_000 })
      .toContain("Reopened 2 stored layers (revision 1)");
    expect(await layerCount(page)).toBe(2);

    // ── 6. WILL-SAVE — an uncommitted edit, then Save (.paged): the plugin
    //    commits revision 2 before the container is written, and the
    //    saved file carries it. A foreground fill, not a second noise fill:
    //    the noise is seeded, so refilling the same layer reproduces the
    //    same pixels and the bake would not move. ──
    const depth = await undoDepth(page);
    await designer.runCommand(CMD.fillForeground);
    await expect.poll(() => undoDepth(page), { timeout: 20_000 }).toBeGreaterThan(depth);
    expect((await marker(page, frame))?.data?.rev, "not committed yet").toBe(1);
    const saved = await savePaged(designer, page);
    const m2 = (await marker(page, frame))!;
    expect(m2.data?.rev, "the save committed the pending edit first").toBe(2);
    const baked2 = await placedSha(page, frame);
    expect(baked2).toBe(m2.data?.baked);
    expect(baked2).not.toBe(baked1);

    const entries = zipEntryNames(saved);
    expect(entries, "revision 2's record is in the saved file").toContain(
      PARTS_BASE + m2.data!.record!,
    );
    const record2 = JSON.parse(readZipText(saved, PARTS_BASE + m2.data!.record!) ?? "{}") as {
      manifest: string;
      buffers: string[];
    };
    for (const sha of [record2.manifest, ...record2.buffers]) {
      expect(entries, `layer data ${sha.slice(0, 12)}… is in the saved file`).toContain(
        `${PARTS_BASE}px/${sha}.bin`,
      );
    }

    // ── 7. REOPEN FROM THE FILE — File ▸ New first, so nothing of this
    //    document is still live, then File ▸ Open the saved .paged (the
    //    user's door) and adjust the frame again: revision 2's layers come
    //    back from the file's parts. ──
    await designer.newDocument();
    expect(await placedSha(page, frame), "the frame is gone with the old document").toBeNull();
    expect(await partText(page, PARTS_BASE + m2.data!.record!), "and so are its parts").toBeNull();
    // The discard confirm is accepted by `openCanvas`'s dialog handler.
    const chooser = page.waitForEvent("filechooser", { timeout: 30_000 });
    const opening = designer.runCommand(CMD.open);
    await (
      await chooser
    ).setFiles({ name: "persist.paged", mimeType: "application/x-paged+zip", buffer: saved });
    await opening;
    await expect
      .poll(() => placedSha(page, frame), {
        timeout: 30_000,
        message: "the reopened document places revision 2's bake",
      })
      .toBe(baked2);
    await adjust(designer, page, frame);
    await expect
      .poll(() => sourceNote(page), { timeout: 20_000 })
      .toContain("Reopened 2 stored layers (revision 2)");
    expect(await layerCount(page), "the layer stack came back from the file").toBe(2);
  });
});
