// Journey: C-1 Stage-B pixel layer + image save-back (protocol v50).
//
// REQUIRES the local v50 canvas-wasm (`~/paged/sync-wasm.sh`) OR a published
// v50 — the editor's PROTOCOL_VERSION pin is 50 on this branch, so booting at
// all proves the v50 handshake matches. Then exercises the three new wire
// methods end-to-end: submit an ephemeral per-drag pixel layer, clear it, and
// commit a pixel save-back mutation. This validates the SubmitPixelLayer /
// ClearPixelLayer messages + Mutation::ReplaceImageBytes the core agent landed.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · Stage-B pixel layer (protocol v50)", () => {
  test("submit + clear a pixel layer and save image bytes through the v50 wire @feat:plugin-platform.scene-layer @feat:the-renderer.pipeline @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open(); // boots → the worker handshake proves protocol v50
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 350, y1: 320 });
    await designer.placeImageLink(id);

    // SUBMIT — an ephemeral pixel layer (one RGBA8 tile) composites into the
    // frame; the worker replies sceneLayerApplied (same lane as scene layers).
    const submit = await page.evaluate(async (eid) => {
      const c = (globalThis as unknown as { __canvas: { client: { submitPixelLayer: (i: string, l: unknown) => Promise<void> } } }).__canvas.client;
      const tile = { rgba: Array(2 * 2 * 4).fill(200), width: 2, height: 2, x: 0, y: 0, w: 24, h: 24 };
      try {
        await c.submitPixelLayer(eid, { tiles: [tile] });
        return "ok";
      } catch (e) {
        return String(e);
      }
    }, id);
    expect(submit, "submitPixelLayer round-trips (sceneLayerApplied)").toBe("ok");

    // CLEAR — return the frame to its native content.
    const clear = await page.evaluate(async (eid) => {
      const c = (globalThis as unknown as { __canvas: { client: { clearPixelLayer: (i: string) => Promise<void> } } }).__canvas.client;
      try {
        await c.clearPixelLayer(eid);
        return "ok";
      } catch (e) {
        return String(e);
      }
    }, id);
    expect(clear, "clearPixelLayer round-trips").toBe("ok");

    // SAVE-BACK — replace the frame's inline image bytes (a committed,
    // undoable mutation, not the ephemeral layer).
    const save = await page.evaluate(async (eid) => {
      const c = (globalThis as unknown as { __canvas: { client: { replaceImageBytes: (i: string, b: number[] | null) => Promise<{ kind?: string }> } } }).__canvas.client;
      const r = await c.replaceImageBytes(eid, [1, 2, 3, 4]);
      return r?.kind ?? "?";
    }, id);
    expect(save, "replaceImageBytes commits a mutation").toBe("mutationApplied");
  });
});
