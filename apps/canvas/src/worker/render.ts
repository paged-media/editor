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

// Worker-side render loop for the IDML canvas.
//
// Owns the OffscreenCanvas, the camera SAB read side, the per-page
// tile cache, and the setTimeout-driven render loop (workers have no
// requestAnimationFrame; spec §3.1 accepts this).
//
// Sub-phase A: every tile is the existing 256-px tiny-skia snapshot
// (via `renderTilePng`). Composition is `ctx.drawImage` over the
// OffscreenCanvasRenderingContext2D. Per spec AC-V-7 no rendering
// happens on the main thread; the main thread only writes the camera
// SAB and posts attach/resize messages.
//
// Sub-phases B/C/D layer in WebGPU + Vello underneath the same render
// loop — see /Users/drietsch/.claude/plans/...canvas... for the full
// plan.

import { CameraBuffer, type Camera } from "@paged-media/client";
import { layoutPages, type PageRect } from "../ui/layout";
import type { PageId } from "@paged-media/client";
import { workerJournal } from "./journal";

/**
 * Wasm-side bindings the renderer needs. Subset of the
 * `CanvasWorker` wasm-bindgen surface from `crates/paged-canvas-wasm`.
 * Declared as an interface so this module doesn't depend on the
 * generated wasm types at import time (the worker imports them
 * separately).
 */
export interface RendererWasm {
  pageCount(): number;
  pageInfo(index: number): [string, number, number] | undefined;
  renderTilePng(pageId: string, targetWidthPx: number): Uint8Array | undefined;
  /**
   * When set, the renderer uses Vello via the worker's WebGPU
   * surface for the hot path. Returns true on a successful present;
   * false means the wasm side detected a fault and the renderer
   * should fall back (snapshot blit) for this frame.
   */
  presentFrame?: (scale: number, tx: number, ty: number, dpr: number) => boolean;
}

interface PageGeometry {
  pageId: PageId;
  rect: PageRect; // doc-space (pt)
  /** Index in the model's page vector, for staleness invalidation. */
  index: number;
}

interface TileKey {
  pageId: PageId;
  widthPx: number;
}

interface CachedTile {
  bitmap: ImageBitmap;
  widthPx: number;
  heightPx: number;
}

interface RendererOptions {
  /** Width of the snapshot tile in device pixels. Per spec 256–512. */
  snapshotWidthPx?: number;
  /** Background fill drawn beneath pages. Defaults to spec-grey. */
  background?: string;
  /**
   * When true, the worker has claimed the OffscreenCanvas for
   * WebGPU rendering (via `wasm.initGpu`) — the renderer must NOT
   * call `getContext("2d")` on it. The render loop dispatches to
   * `wasm.presentFrame` instead of the blit path.
   */
  gpuActive?: boolean;
}

const DEFAULT_SNAPSHOT_WIDTH_PX = 256;
const DEFAULT_BACKGROUND = "#e5e7eb";

export class WorkerRenderer {
  private readonly canvas: OffscreenCanvas;
  /**
   * 2D context — `undefined` when the renderer is in GPU mode and
   * the OffscreenCanvas's WebGPU context is owned by Vello via
   * wasm. The render loop checks `gpuActive` first; if not in GPU
   * mode it falls back to `ctx`.
   */
  private readonly ctx: OffscreenCanvasRenderingContext2D | undefined;
  private readonly wasm: RendererWasm;
  private readonly cameraBuffer: CameraBuffer;
  private readonly snapshotWidthPx: number;
  private readonly background: string;
  private readonly gpuActive: boolean;

  /** Tiles in cache; key = `${pageId}:${widthPx}`. */
  private readonly tiles = new Map<string, CachedTile>();
  /** Set of `${pageId}:${widthPx}` requests currently being awaited. */
  private readonly pendingTiles = new Set<string>();

  private dpr = 1;
  /** Page layout in document space. Recomputed when the document changes. */
  private pages: PageGeometry[] = [];

  private lastCameraGeneration = -1n;
  /** Set when something changed and the next tick must redraw even if camera is steady. */
  private dirty = true;
  private running = false;
  private loopHandle: ReturnType<typeof setTimeout> | null = null;

  // ── demo frame-tap (OFF by default — enabled only for CI demo capture) ──
  // When fps > 0, after each present we read the OffscreenCanvas back as a webp
  // blob (throttled, fire-and-forget) and hand it to `onFrameTap`. convertToBlob
  // works on the OffscreenCanvas regardless of 2D vs WebGPU context, which is how
  // we bridge the worker/OffscreenCanvas boundary that main-thread session replay
  // (rrweb) cannot reach. Inert — a single fps<=0 check — when disabled.
  private frameTapFps = 0;
  private lastTapAt = 0;
  private tapInFlight = false;
  private onFrameTap:
    | ((f: { bytes: ArrayBuffer; width: number; height: number; ts: number }) => void)
    | undefined;

  constructor(
    canvas: OffscreenCanvas,
    wasm: RendererWasm,
    cameraBuffer: CameraBuffer,
    dpr: number,
    cssWidth: number,
    cssHeight: number,
    opts: RendererOptions = {},
  ) {
    this.canvas = canvas;
    this.gpuActive = opts.gpuActive ?? false;
    if (!this.gpuActive) {
      const ctx = canvas.getContext("2d");
      // A failed GPU init can still leave the OffscreenCanvas with a
      // context locked to webgpu, so the 2D fallback may not be
      // available. We log + continue with no compositor; snapshot
      // PNGs flow through `handleMessage` independently of `ctx`.
      this.ctx = ctx ?? undefined;
      if (!ctx) {
        console.warn(
          "OffscreenCanvas 2D context unavailable — live tile compositor disabled (snapshots still work)",
        );
      }
    } else {
      this.ctx = undefined;
    }
    this.wasm = wasm;
    this.cameraBuffer = cameraBuffer;
    this.snapshotWidthPx = opts.snapshotWidthPx ?? DEFAULT_SNAPSHOT_WIDTH_PX;
    this.background = opts.background ?? DEFAULT_BACKGROUND;
    this.applySize(dpr, cssWidth, cssHeight);
  }

  /**
   * Refresh the per-page layout from the wasm model. Call after
   * `LoadDocument` succeeds (worker.ts wires this).
   */
  refreshLayout(): void {
    const count = this.wasm.pageCount();
    const sizes: Array<[number, number]> = [];
    const ids: PageId[] = [];
    for (let i = 0; i < count; i++) {
      const info = this.wasm.pageInfo(i);
      if (!info) continue;
      ids.push(info[0]);
      sizes.push([info[1], info[2]]);
    }
    const rects = layoutPages(sizes);
    this.pages = ids.map((pageId, i) => ({ pageId, rect: rects[i], index: i }));
    // New document → previous tiles are stale. Clear them.
    for (const t of this.tiles.values()) t.bitmap.close();
    this.tiles.clear();
    this.pendingTiles.clear();
    this.dirty = true;
  }

  applySize(dpr: number, cssWidth: number, cssHeight: number): void {
    this.dpr = dpr;
    // In GPU mode the surface owns the bitmap dimensions through
    // `surface.configure()` (worker.ts also calls `wasm.resizeGpu`).
    // Setting canvas.width/height directly here would invalidate the
    // WebGPU surface — skip the resize when GPU is active.
    if (!this.gpuActive) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
    }
    this.dirty = true;
  }

  /**
   * Mark the next tick as dirty so it redraws even if the camera
   * generation hasn't changed. Called by worker.ts after the wasm
   * reports `mutationApplied` / `undoApplied` / `redoApplied`. On the
   * CPU path it also drops cached tiles for the affected pages so
   * the next draw fetches fresh PNG bytes instead of blitting stale
   * snapshots; on the GPU path the worker already cleared its
   * scene_cache so presentFrame rebuilds.
   */
  markDirty(pageIds: ReadonlyArray<PageId> = []): void {
    this.dirty = true;
    if (pageIds.length === 0) {
      for (const t of this.tiles.values()) t.bitmap.close();
      this.tiles.clear();
      return;
    }
    for (const pageId of pageIds) {
      const key = tileKey({ pageId, widthPx: this.snapshotWidthPx });
      const cached = this.tiles.get(key);
      if (cached) {
        cached.bitmap.close();
        this.tiles.delete(key);
      }
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.loopHandle !== null) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private tick = (): void => {
    if (!this.running) return;
    this.loopHandle = setTimeout(this.tick, 16);
    const generation = this.cameraBuffer.generation();
    if (!this.dirty && generation === this.lastCameraGeneration) {
      return;
    }
    this.lastCameraGeneration = generation;
    this.dirty = false;
    const camera = this.cameraBuffer.read();
    if (this.gpuActive && this.wasm.presentFrame) {
      // GPU hot path: hand the camera to wasm; wasm builds the
      // composite Vello scene and presents directly to the surface.
      // No CPU work in this branch.
      //
      // ADR 025 — two `performance.now()` calls per frame buy the single
      // highest-value measurement in the editor: how long a present actually
      // takes. The HUD has shown FPS since W1 with no way to tell whether a
      // dropped frame was the GPU, the layout or the main thread. The entry
      // is an `aggregate` code, so this emits ONE rollup per second, never
      // per frame.
      const t0 = performance.now();
      this.wasm.presentFrame(camera.scale, camera.tx, camera.ty, this.dpr);
      workerJournal.record({
        code: "worker.frame",
        durMs: performance.now() - t0,
        data: { gpu: true },
      });
      this.maybeTap();
      return;
    }
    const t0 = performance.now();
    this.draw(camera);
    workerJournal.record({
      code: "worker.frame",
      durMs: performance.now() - t0,
      data: { gpu: false },
    });
    this.maybeTap();
  };

  /**
   * Demo capture only: enable/disable the frame tap. `fps <= 0` disables it
   * (the default), making the tap a single no-op check on the hot path.
   */
  setFrameTap(
    fps: number,
    onFrame?: (f: { bytes: ArrayBuffer; width: number; height: number; ts: number }) => void,
  ): void {
    this.frameTapFps = Math.max(0, fps);
    this.onFrameTap = this.frameTapFps > 0 ? onFrame : undefined;
  }

  /** Read the current canvas back as a webp blob (throttled, non-blocking). */
  private maybeTap(): void {
    if (this.frameTapFps <= 0 || !this.onFrameTap || this.tapInFlight) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastTapAt < 1000 / this.frameTapFps) return;
    this.lastTapAt = now;
    this.tapInFlight = true;
    const { width, height } = this.canvas;
    this.canvas
      .convertToBlob({ type: "image/webp", quality: 0.8 })
      .then((blob) => blob.arrayBuffer())
      .then((bytes) => {
        this.tapInFlight = false;
        this.onFrameTap?.({ bytes, width, height, ts: now });
      })
      .catch(() => {
        this.tapInFlight = false;
      });
  }

  private draw(camera: Camera): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Reset transform + background.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply the camera × DPR transform. The camera operates in CSS
    // pixels (the main thread writes it that way for input events);
    // we multiply by DPR so the doc-space units land on device
    // pixels. setTransform = a, b, c, d, e, f corresponds to
    // matrix(scale*dpr, 0, 0, scale*dpr, tx*dpr, ty*dpr).
    const k = camera.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, camera.tx * this.dpr, camera.ty * this.dpr);

    // Per-page draws. Visibility-cull by viewport bounds in doc
    // space so we don't issue drawImage for off-screen pages —
    // matters for the 500-page target. The doc-space viewport is
    // the inverse camera mapping of the device viewport.
    const docViewport = this.docSpaceViewport(camera);

    for (const page of this.pages) {
      if (!intersects(page.rect, docViewport)) continue;
      this.drawPage(page);
    }
  }

  private drawPage(page: PageGeometry): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const r = page.rect;

    // Page chrome: white background + thin border. The browser
    // device-pixel-rounds 1px strokes so they stay visible at any
    // camera scale.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Bind a tile to this page. Sub-phase A only has one tile size
    // (snapshot). Sub-phase B introduces mid-res; this method is
    // where the tier decision lives.
    const tile = this.bestTileFor(page.pageId);
    if (tile) {
      ctx.drawImage(tile.bitmap, r.x, r.y, r.w, r.h);
    }

    // Border drawn last so it sits on top of the tile.
    ctx.lineWidth = 1 / (this.dpr || 1);
    ctx.strokeStyle = "#cccccc";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  private bestTileFor(pageId: PageId): CachedTile | undefined {
    const key = tileKey({ pageId, widthPx: this.snapshotWidthPx });
    const cached = this.tiles.get(key);
    if (cached) return cached;
    // Miss → request asynchronously; current frame draws nothing
    // for the page body (the chrome border still shows location).
    void this.loadTile(pageId, this.snapshotWidthPx);
    return undefined;
  }

  /**
   * Async tile load. Decodes PNG bytes into an ImageBitmap, stores
   * in the cache, marks dirty so the next render-loop tick blits it.
   * Deduplicates concurrent requests for the same key.
   */
  private async loadTile(pageId: PageId, widthPx: number): Promise<void> {
    const key = tileKey({ pageId, widthPx });
    if (this.pendingTiles.has(key) || this.tiles.has(key)) return;
    this.pendingTiles.add(key);
    try {
      const bytes = this.wasm.renderTilePng(pageId, widthPx);
      if (!bytes) {
        // Unknown page or no document — drop.
        return;
      }
      // ImageBitmap is the fastest decode path in workers — the
      // browser does the PNG decode + GPU upload in parallel and
      // returns a transferable handle.
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);
      this.tiles.set(key, {
        bitmap,
        widthPx: bitmap.width,
        heightPx: bitmap.height,
      });
      this.dirty = true;
    } finally {
      this.pendingTiles.delete(key);
    }
  }

  private docSpaceViewport(camera: Camera): PageRect {
    // Device-pixel viewport is (0, 0, canvas.width, canvas.height).
    // Camera transform: doc → device. Invert to find which doc-space
    // rectangle is visible.
    const k = camera.scale * this.dpr;
    if (k <= 0) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    const x = -camera.tx * this.dpr / k;
    const y = -camera.ty * this.dpr / k;
    const w = this.canvas.width / k;
    const h = this.canvas.height / k;
    return { x, y, w, h };
  }
}

function tileKey(k: TileKey): string {
  return `${k.pageId}:${k.widthPx}`;
}

function intersects(a: PageRect, b: PageRect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}
