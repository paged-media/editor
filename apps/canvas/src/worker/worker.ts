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

// Web Worker entry. The main thread spawns this with
// `new Worker(new URL('./worker/worker.ts', import.meta.url),
//             { type: 'module' })`.
//
// Responsibilities:
//   - Load the `paged-canvas-wasm` bundle.
//   - Accept the camera SAB and the OffscreenCanvas via side-channel
//     messages (transferables, outside the typed JSON envelope).
//   - Run the worker-side render loop (see `./render.ts`).
//   - Receive `MainToWorker` envelopes, forward them to the wasm
//     `CanvasWorker::handleMessage`, post the reply back.
//
// Phase 1 sub-phase A wires the render loop using the CPU
// (tiny-skia) snapshot tier. Later sub-phases add WebGPU + Vello.

/// <reference lib="webworker" />
import type {
  CameraSabLayout,
  GestureSabLayout,
  MainToWorker,
  SnapLine,
  WorkerToMain,
} from "@paged-media/client";
import { PROTOCOL_VERSION } from "@paged-media/client";
import {
  CameraBuffer,
  CAMERA_SAB_BYTES,
  OFFSET_GEN_LO as CAMERA_OFFSET_GEN_LO,
  OFFSET_GEN_HI as CAMERA_OFFSET_GEN_HI,
  OFFSET_SCALE as CAMERA_OFFSET_SCALE,
  OFFSET_TX as CAMERA_OFFSET_TX,
  OFFSET_TY as CAMERA_OFFSET_TY,
} from "@paged-media/client";
// `@paged-media/client` has no React; safe to import from the barrel.
// (Pre-Phase-1 this was a deep-import to bypass the @paged-media/shell
// barrel; after the package split that workaround is unnecessary
// because client's barrel is React-free by lint.)
import {
  GestureBuffer,
  GESTURE_SAB_BYTES,
  GESTURE_MODIFIER_SHIFT,
  GESTURE_MODIFIER_ALT,
  GESTURE_MODIFIER_DISABLE_SNAP,
  GESTURE_SAB_OFFSETS,
} from "@paged-media/client";
import { WorkerRenderer, type RendererWasm } from "./render";
// Decision-B package boundary: the engine wasm now ships in the
// published `@paged-media/canvas-wasm` package. The wasm-bindgen
// `--target web` loader's `default()` would, with no argument, fetch
// `new URL('paged_canvas_wasm_bg.wasm', import.meta.url)` relative to
// the loader JS *inside node_modules* — which Vite does not rewrite to
// a served/hashed asset URL for worker chunks. So we hand Vite the
// asset explicitly with a `?url` import: in dev it resolves to a
// `/@fs/.../node_modules/...` URL, and in `vite build` it is emitted as
// a fingerprinted asset and the URL is inlined. We pass that URL to
// `default(wasmUrl)` below.
import canvasWasmUrl from "@paged-media/canvas-wasm/paged_canvas_wasm_bg.wasm?url";
import { drainWorkerJournal } from "./journal";

interface CanvasWorkerInstance {
  protocolVersion: number;
  handleMessage(input: string): string;
  /**
   * Step 5d/5e — raw-arg updateGesture entry. Returns an empty string
   * on failure (no document loaded or gesture has gone stale). On
   * success returns a JSON string of `{ pageIds, snapLines }` so the
   * worker can post a `gestureSnapLines` notify + scope its dirty
   * invalidation without re-querying.
   */
  updateGestureRaw(
    handleLo: number,
    handleHi: number,
    dx: number,
    dy: number,
    modifierBits: number,
  ): string;
  pageCount(): number;
  pageInfo(index: number): unknown;
  /**
   * S-13 (K-7) — measure a text run against the loaded document's
   * font registry. Returns a plain JS object
   * `{ advance, ascender, descender }` (POINTS; `descender` negative)
   * or `null` when no document is loaded / the family resolves to no
   * face. A READ — no wire/protocol change, no mutation. Mirrors
   * `paged-inspect`'s shaper resolution (styled → bare-family →
   * document-default).
   */
  measureText(
    family: string,
    style: string | null | undefined,
    text: string,
    sizePt: number,
  ): { advance: number; ascender: number; descender: number } | null;
  renderTilePng(pageId: string, targetWidthPx: number): Uint8Array | undefined;
  runResolveJson(): string | undefined;
  free(): void;
  // GPU surface, only present when the `gpu` feature is enabled at
  // build time. The worker probes via `gpuReady` after `initGpu`.
  initGpu?(
    canvas: OffscreenCanvas,
    width: number,
    height: number,
  ): Promise<boolean>;
  resizeGpu?(width: number, height: number): void;
  presentFrame?(scale: number, tx: number, ty: number, dpr: number): boolean;
  gpuReady?(): boolean;
  /** Sub-phase D — Vello/GPU readback path for the fidelity suite. */
  renderPageVelloPng?(
    pageId: string,
    dpi: number,
  ): Promise<Uint8Array | undefined>;
  loadDocumentDirect(
    seq: number,
    bytes: Uint8Array,
    font?: Uint8Array,
    cmykIccProfile?: Uint8Array,
  ): string;
  // v66 binary doors (protocol 66). Optional so an older wasm still
  // satisfies the interface; a missing one answers the caller with a
  // `dispatchError` instead of a TypeError in the pump.
  submitSceneImageDirect?(
    seq: number,
    elementId: string,
    caller: string | undefined,
    rgba: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ): string;
  submitSceneImageTilesDirect?(
    seq: number,
    elementId: string,
    caller: string | undefined,
    rects: Uint32Array,
    rgba: Uint8Array,
  ): string;
  writePagedPartDirect?(
    seq: number,
    path: string,
    caller: string | undefined,
    bytes: Uint8Array,
  ): string;
  readPagedPartDirect?(path: string): Uint8Array | undefined;
  placedAssetBytesDirect?(elementId: string):
    | { uri: string; width: number; height: number; encoded: Uint8Array }
    | undefined;
  mutateWithBytesDirect?(seq: number, mutationJson: string, bytes: Uint8Array): string;
}

interface CanvasWasmModule {
  default: (input?: unknown) => Promise<unknown>;
  CanvasWorker: new () => CanvasWorkerInstance;
  /** SAB byte size + offsets — Rust is the single source of truth.
   *  TS-side mirrors get reconciled in `assertSabContract` below. */
  cameraSabBytes: () => number;
  cameraSabLayout: () => CameraSabLayout;
  gestureSabBytes: () => number;
  gestureSabLayout: () => GestureSabLayout;
}

let worker: CanvasWorkerInstance | null = null;
let cameraBuffer: CameraBuffer | null = null;
let gestureBuffer: GestureBuffer | null = null;
let gestureDrainHandle: ReturnType<typeof setTimeout> | null = null;
let renderer: WorkerRenderer | null = null;
/** Pending canvas attach that arrived before the wasm finished loading. */
let pendingAttach: {
  canvas: OffscreenCanvas;
  dpr: number;
  cssWidth: number;
  cssHeight: number;
} | null = null;

/**
 * SAB-contract reconciliation. Rust owns the canonical byte size +
 * offsets + modifier bit masks (see `crates/paged-canvas/src/camera.rs`
 * + `gesture.rs`). The TS-side mirrors live in `@paged-media/client`'s
 * `sab/camera.ts` + `sab/gesture.ts` modules — same values declared
 * inline so they can be used at module-load time (the SAB is
 * allocated before wasm has finished loading). This function runs
 * once wasm is up and asserts the two sides match — a Rust-side
 * change to the layout that ships without a TS-side update fires a
 * `protocolMismatch` warning here, the same shape the PROTOCOL_VERSION
 * reconciliation uses.
 */
function assertSabContract(mod: CanvasWasmModule): string | null {
  const cam = mod.cameraSabLayout();
  const ges = mod.gestureSabLayout();
  const drift: string[] = [];
  if (cam.bytes !== CAMERA_SAB_BYTES) {
    drift.push(`camera.bytes ${cam.bytes} != TS ${CAMERA_SAB_BYTES}`);
  }
  if (cam.offsetScale !== CAMERA_OFFSET_SCALE) {
    drift.push(
      `camera.offsetScale ${cam.offsetScale} != TS ${CAMERA_OFFSET_SCALE}`,
    );
  }
  if (cam.offsetTx !== CAMERA_OFFSET_TX) {
    drift.push(`camera.offsetTx ${cam.offsetTx} != TS ${CAMERA_OFFSET_TX}`);
  }
  if (cam.offsetTy !== CAMERA_OFFSET_TY) {
    drift.push(`camera.offsetTy ${cam.offsetTy} != TS ${CAMERA_OFFSET_TY}`);
  }
  if (cam.offsetGenLo !== CAMERA_OFFSET_GEN_LO) {
    drift.push(
      `camera.offsetGenLo ${cam.offsetGenLo} != TS ${CAMERA_OFFSET_GEN_LO}`,
    );
  }
  if (cam.offsetGenHi !== CAMERA_OFFSET_GEN_HI) {
    drift.push(
      `camera.offsetGenHi ${cam.offsetGenHi} != TS ${CAMERA_OFFSET_GEN_HI}`,
    );
  }
  if (ges.bytes !== GESTURE_SAB_BYTES) {
    drift.push(`gesture.bytes ${ges.bytes} != TS ${GESTURE_SAB_BYTES}`);
  }
  if (ges.offsetHandleLo !== GESTURE_SAB_OFFSETS.handleLo) {
    drift.push(
      `gesture.offsetHandleLo ${ges.offsetHandleLo} != TS ${GESTURE_SAB_OFFSETS.handleLo}`,
    );
  }
  if (ges.offsetHandleHi !== GESTURE_SAB_OFFSETS.handleHi) {
    drift.push(
      `gesture.offsetHandleHi ${ges.offsetHandleHi} != TS ${GESTURE_SAB_OFFSETS.handleHi}`,
    );
  }
  if (ges.offsetDx !== GESTURE_SAB_OFFSETS.dx) {
    drift.push(
      `gesture.offsetDx ${ges.offsetDx} != TS ${GESTURE_SAB_OFFSETS.dx}`,
    );
  }
  if (ges.offsetDy !== GESTURE_SAB_OFFSETS.dy) {
    drift.push(
      `gesture.offsetDy ${ges.offsetDy} != TS ${GESTURE_SAB_OFFSETS.dy}`,
    );
  }
  if (ges.offsetModifiers !== GESTURE_SAB_OFFSETS.modifiers) {
    drift.push(
      `gesture.offsetModifiers ${ges.offsetModifiers} != TS ${GESTURE_SAB_OFFSETS.modifiers}`,
    );
  }
  if (ges.offsetSeq !== GESTURE_SAB_OFFSETS.seq) {
    drift.push(
      `gesture.offsetSeq ${ges.offsetSeq} != TS ${GESTURE_SAB_OFFSETS.seq}`,
    );
  }
  if (ges.offsetGenLo !== GESTURE_SAB_OFFSETS.genLo) {
    drift.push(
      `gesture.offsetGenLo ${ges.offsetGenLo} != TS ${GESTURE_SAB_OFFSETS.genLo}`,
    );
  }
  if (ges.offsetGenHi !== GESTURE_SAB_OFFSETS.genHi) {
    drift.push(
      `gesture.offsetGenHi ${ges.offsetGenHi} != TS ${GESTURE_SAB_OFFSETS.genHi}`,
    );
  }
  if (ges.modifierShift !== GESTURE_MODIFIER_SHIFT) {
    drift.push(
      `gesture.modifierShift ${ges.modifierShift} != TS ${GESTURE_MODIFIER_SHIFT}`,
    );
  }
  if (ges.modifierAlt !== GESTURE_MODIFIER_ALT) {
    drift.push(
      `gesture.modifierAlt ${ges.modifierAlt} != TS ${GESTURE_MODIFIER_ALT}`,
    );
  }
  if (ges.modifierDisableSnap !== GESTURE_MODIFIER_DISABLE_SNAP) {
    drift.push(
      `gesture.modifierDisableSnap ${ges.modifierDisableSnap} != TS ${GESTURE_MODIFIER_DISABLE_SNAP}`,
    );
  }
  return drift.length === 0 ? null : drift.join("; ");
}

async function init() {
  // Decision-B package boundary — the wasm-bindgen loader is the
  // published `@paged-media/canvas-wasm` package (no longer the
  // vendored `packages/client/src/wasm` dir). Dynamic-import the loader
  // so nothing is pre-evaluated, then drive `default()` with the
  // explicit `?url`-resolved wasm asset (see the top-of-file import) so
  // the fetch works in both `vite dev` and `vite build` worker chunks.
  const mod =
    (await import("@paged-media/canvas-wasm")) as unknown as CanvasWasmModule;
  // Object form (`{ module_or_path }`) — the bare-URL positional form is
  // deprecated by current wasm-bindgen loaders and logs a warning.
  await mod.default({ module_or_path: canvasWasmUrl });
  worker = new mod.CanvasWorker();
  if (worker.protocolVersion !== PROTOCOL_VERSION) {
    postBack({
      seq: null,
      protocol: worker.protocolVersion,
      kind: "warning",
      payload: {
        kind: "protocolMismatch",
        details: `worker WASM is v${worker.protocolVersion}, JS bundle is v${PROTOCOL_VERSION}`,
      },
    });
  }
  const sabDrift = assertSabContract(mod);
  if (sabDrift !== null) {
    postBack({
      seq: null,
      protocol: worker.protocolVersion,
      kind: "warning",
      payload: {
        kind: "protocolMismatch",
        details: `SAB layout drift between Rust and TS: ${sabDrift}`,
      },
    });
  }
  // Drain pending attach if the canvas arrived before the wasm.
  if (pendingAttach && cameraBuffer) {
    attachRenderer(
      pendingAttach.canvas,
      pendingAttach.dpr,
      pendingAttach.cssWidth,
      pendingAttach.cssHeight,
    );
    pendingAttach = null;
  }
}

const initPromise = init().catch((err) => {
  postBack({
    seq: null,
    protocol: PROTOCOL_VERSION,
    kind: "warning",
    payload: { kind: "initFailed", details: String(err) },
  });
});

// Incoming messages must be processed strictly in order. The wasm
// `handleMessage` call is synchronous and short, but `attachCanvas`'s
// `initGpu` is async — during its awaits the event loop is free to
// fire another `message` listener, which would re-enter wasm with a
// stale borrow. Rust panics with "recursive use of an object detected
// which would lead to unsafe aliasing in rust". Queue every event and
// drain via a single async pump.
type IncomingMessage =
  | { kind: "channel"; msg: MainToWorker }
  | { kind: "cameraSab"; buffer: SharedArrayBuffer | ArrayBuffer }
  | { kind: "gestureSab"; buffer: SharedArrayBuffer | ArrayBuffer }
  | {
      kind: "attachCanvas";
      canvas: OffscreenCanvas;
      dpr: number;
      cssWidth: number;
      cssHeight: number;
    }
  | { kind: "resizeCanvas"; dpr: number; cssWidth: number; cssHeight: number }
  | { kind: "renderPageVelloPng"; seq: number; pageId: string; dpi: number }
  | {
      kind: "loadDocumentBinary";
      seq: number;
      bytes: Uint8Array;
      font: Uint8Array | null;
      cmykIccProfile: Uint8Array | null;
    }
  // Demo capture only (CI): tap rendered document frames for rrweb replay.
  | { kind: "startFrameTap"; fps: number }
  | { kind: "stopFrameTap" }
  // v66 — the binary doors: pixels and part bytes as transferred
  // Uint8Arrays, never `number[]` through the JSON envelope. Replies that
  // are `WorkerToMain` envelopes go back through `postBack` (the client
  // settles them by seq); byte READS answer on `directBytesReply`.
  | DirectMessage
  // ADR 025 — hand the worker's journal ring to the main thread. A TS-ONLY
  // side-channel: it never touches `channel.rs`, so the whole worker->main
  // journal path costs zero engine wire surface and no protocol bump.
  | { kind: "journalDrain"; seq: number };

type DirectMessage =
  | {
      kind: "direct";
      op: "submitSceneImage";
      seq: number;
      elementId: string;
      caller: string | null;
      rgba: Uint8Array;
      width: number;
      height: number;
      dest: [number, number, number, number];
    }
  | {
      kind: "direct";
      op: "submitSceneImageTiles";
      seq: number;
      elementId: string;
      caller: string | null;
      tiles: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        rgba: Uint8Array;
      }>;
    }
  | {
      kind: "direct";
      op: "writePagedPart";
      seq: number;
      path: string;
      caller: string | null;
      bytes: Uint8Array;
    }
  | { kind: "direct"; op: "readPagedPart"; seq: number; path: string }
  | { kind: "direct"; op: "placedAssetBytes"; seq: number; elementId: string }
  | {
      kind: "direct";
      op: "mutateWithBytes";
      seq: number;
      mutationJson: string;
      bytes: Uint8Array;
    };

/** v66 — pack tiles for `submitSceneImageTilesDirect`: one `x, y, w, h`
 *  quad per tile and the pixels back to back. Done here, off the main
 *  thread; one tile passes its buffer through untouched. */
function packSceneTiles(
  tiles: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    rgba: Uint8Array;
  }>,
): { rects: Uint32Array; rgba: Uint8Array } {
  const rects = new Uint32Array(tiles.length * 4);
  let total = 0;
  tiles.forEach((t, i) => {
    rects.set([t.x, t.y, t.width, t.height], i * 4);
    total += t.rgba.byteLength;
  });
  if (tiles.length === 1) return { rects, rgba: tiles[0].rgba };
  const rgba = new Uint8Array(total);
  let at = 0;
  for (const t of tiles) {
    rgba.set(t.rgba, at);
    at += t.rgba.byteLength;
  }
  return { rects, rgba };
}

/** The reply effects shared by the JSON channel and the binary doors:
 *  a fresh document re-lays the renderer; a change repaints the pages it
 *  names (all of them when it names none). */
function applyReplyEffects(reply: WorkerToMain): void {
  if (reply.kind === "documentLoaded") {
    if (renderer) {
      renderer.refreshLayout();
    }
    const resolutionJson = worker?.runResolveJson();
    if (resolutionJson) {
      try {
        const payload = JSON.parse(resolutionJson);
        postBack({
          seq: null,
          protocol: PROTOCOL_VERSION,
          kind: "resolutionDone",
          payload,
        });
      } catch (e) {
        console.warn("resolution JSON parse failed:", e);
      }
    }
  } else if (
    reply.kind === "mutationApplied" ||
    reply.kind === "undoApplied" ||
    reply.kind === "redoApplied"
  ) {
    // Model has changed — invalidate cached tiles for the
    // affected pages and let the render loop redraw on the next
    // tick. On the GPU path the worker already cleared its
    // scene_cache so presentFrame rebuilds.
    if (renderer) {
      renderer.markDirty(reply.payload?.pageIds ?? []);
    }
  } else if (reply.kind === "scriptResult") {
    // A paged.* run may have mutated the model. Its reply carries no
    // pageIds (a script can touch any page), so markDirty([]) clears all
    // tiles + flags dirty — without this a pure paged.* mutation lands in
    // the model but the canvas never repaints.
    if (renderer) {
      renderer.markDirty([]);
    }
  } else if (reply.kind === "sceneLayerApplied") {
    // v66 — a scene layer changes what a page draws, and nothing used to
    // flag the render loop: the GPU cache was dropped in the engine, but
    // the loop only redrew on the next camera move. The binary doors
    // name the pages (an empty list: the frame draws nowhere, so nothing
    // to repaint); the JSON doors do not, so every page repaints.
    if (renderer && reply.payload.applied) {
      const pageIds = (reply.payload as { pageIds?: string[] | null }).pageIds;
      if (pageIds == null) renderer.markDirty([]);
      else if (pageIds.length > 0) renderer.markDirty(pageIds as never);
    }
  }
}

function dispatchError(seq: number, details: string): void {
  postBack({
    seq,
    protocol: PROTOCOL_VERSION,
    kind: "warning",
    payload: { kind: "dispatchError", details },
  });
}

/** v66 — run one binary door. */
function dispatchDirect(w: CanvasWorkerInstance, m: DirectMessage): void {
  const missing = () =>
    dispatchError(
      m.seq,
      `direct ${m.op}: this canvas-wasm has no binary door (protocol < 66)`,
    );
  const settle = (replyJson: string) => {
    const reply = JSON.parse(replyJson) as WorkerToMain;
    postBack(reply);
    applyReplyEffects(reply);
  };
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  switch (m.op) {
    case "submitSceneImage": {
      if (!w.submitSceneImageDirect) return missing();
      const [x, y, dw, dh] = m.dest;
      settle(
        w.submitSceneImageDirect(
          m.seq,
          m.elementId,
          m.caller ?? undefined,
          m.rgba,
          m.width,
          m.height,
          x,
          y,
          dw,
          dh,
        ),
      );
      return;
    }
    case "submitSceneImageTiles": {
      if (!w.submitSceneImageTilesDirect) return missing();
      const { rects, rgba } = packSceneTiles(m.tiles);
      settle(
        w.submitSceneImageTilesDirect(
          m.seq,
          m.elementId,
          m.caller ?? undefined,
          rects,
          rgba,
        ),
      );
      return;
    }
    case "writePagedPart": {
      if (!w.writePagedPartDirect) return missing();
      settle(w.writePagedPartDirect(m.seq, m.path, m.caller ?? undefined, m.bytes));
      return;
    }
    case "mutateWithBytes": {
      if (!w.mutateWithBytesDirect) return missing();
      settle(w.mutateWithBytesDirect(m.seq, m.mutationJson, m.bytes));
      return;
    }
    case "readPagedPart": {
      if (!w.readPagedPartDirect) return missing();
      const bytes = w.readPagedPartDirect(m.path) ?? null;
      scope.postMessage(
        { kind: "directBytesReply", seq: m.seq, bytes },
        bytes ? [bytes.buffer] : [],
      );
      return;
    }
    case "placedAssetBytes": {
      if (!w.placedAssetBytesDirect) return missing();
      const asset = w.placedAssetBytesDirect(m.elementId) ?? null;
      scope.postMessage(
        { kind: "directBytesReply", seq: m.seq, asset },
        asset ? [asset.encoded.buffer] : [],
      );
      return;
    }
  }
}

const messageQueue: IncomingMessage[] = [];
let pumping = false;

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (messageQueue.length > 0) {
      const data = messageQueue.shift()!;
      try {
        await dispatch(data);
      } catch (err) {
        // Surface the failure but keep draining — a hung pump strands
        // every subsequent message (e.g. a failing attachCanvas would
        // block every requestSnapshot behind it).
        // Carry the failed request's seq (channel messages have one), so
        // the client rejects THAT caller instead of leaving it pending.
        postBack({
          seq:
            data.kind === "channel"
              ? data.msg.seq
              : data.kind === "direct"
                ? data.seq
                : null,
          protocol: PROTOCOL_VERSION,
          kind: "warning",
          payload: {
            kind: "dispatchError",
            details: `${data.kind}: ${String(err)}`,
          },
        });
      }
    }
  } finally {
    pumping = false;
  }
}

self.addEventListener("message", (event: MessageEvent) => {
  messageQueue.push(event.data as IncomingMessage);
  void pump();
});

async function dispatch(data: IncomingMessage): Promise<void> {
  if (data.kind === "cameraSab") {
    cameraBuffer = new CameraBuffer(data.buffer);
    return;
  }
  if (data.kind === "gestureSab") {
    gestureBuffer = new GestureBuffer(data.buffer);
    startGestureDrain();
    return;
  }
  if (data.kind === "startFrameTap") {
    renderer?.setFrameTap(data.fps, (f) => {
      (self as unknown as DedicatedWorkerGlobalScope).postMessage(
        { kind: "frameTap", bytes: f.bytes, width: f.width, height: f.height, ts: f.ts },
        [f.bytes],
      );
    });
    return;
  }
  if (data.kind === "journalDrain") {
    // Drain, never stream: the cost lands when somebody actually looks
    // (panel open, export), not on the render loop.
    const drained = drainWorkerJournal();
    postBack({
      kind: "journalDrainReply",
      seq: data.seq,
      entries: drained.entries,
      ledger: drained.ledger,
      epochWallMs: drained.epochWallMs,
    } as unknown as WorkerToMain);
    return;
  }
  if (data.kind === "stopFrameTap") {
    renderer?.setFrameTap(0);
    return;
  }
  if (data.kind === "attachCanvas") {
    await initPromise;
    if (!cameraBuffer) {
      pendingAttach = data;
      return;
    }
    await attachRenderer(data.canvas, data.dpr, data.cssWidth, data.cssHeight);
    return;
  }
  if (data.kind === "direct") {
    await initPromise;
    if (!worker) {
      dispatchError(data.seq, `direct ${data.op}: worker not initialised`);
      return;
    }
    dispatchDirect(worker, data);
    return;
  }
  if (data.kind === "loadDocumentBinary") {
    await initPromise;
    if (!worker) {
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({
        kind: "loadDocumentBinaryReply",
        seq: data.seq,
        replyJson: JSON.stringify({
          seq: data.seq,
          protocol: PROTOCOL_VERSION,
          kind: "loadFailed",
          payload: {
            error: { kind: "parse", message: "worker not initialised" },
          },
        }),
      });
      return;
    }
    const replyJson = worker.loadDocumentDirect(
      data.seq,
      data.bytes,
      data.font ?? undefined,
      data.cmykIccProfile ?? undefined,
    );
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      kind: "loadDocumentBinaryReply",
      seq: data.seq,
      replyJson,
    });
    // Mirror the post-load side-effects of the JSON channel:
    // refresh the renderer's page layout + run the Tier 3 resolver.
    try {
      const reply = JSON.parse(replyJson) as WorkerToMain;
      if (reply.kind === "documentLoaded") {
        if (renderer) renderer.refreshLayout();
        const resolutionJson = worker.runResolveJson();
        if (resolutionJson) {
          const payload = JSON.parse(resolutionJson);
          postBack({
            seq: null,
            protocol: PROTOCOL_VERSION,
            kind: "resolutionDone",
            payload,
          });
        }
      }
    } catch (e) {
      console.warn("loadDocumentBinary post-process:", e);
    }
    return;
  }
  if (data.kind === "renderPageVelloPng") {
    await initPromise;
    let pngBytes: Uint8Array | undefined;
    if (worker?.renderPageVelloPng) {
      try {
        pngBytes = await worker.renderPageVelloPng(data.pageId, data.dpi);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("renderPageVelloPng threw:", err);
      }
    }
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      kind: "velloPngReply",
      seq: data.seq,
      pngBytes: pngBytes ? Array.from(pngBytes) : null,
    });
    return;
  }
  if (data.kind === "resizeCanvas") {
    if (renderer) {
      renderer.applySize(data.dpr, data.cssWidth, data.cssHeight);
    }
    if (worker?.resizeGpu) {
      const w = Math.max(1, Math.round(data.cssWidth * data.dpr));
      const h = Math.max(1, Math.round(data.cssHeight * data.dpr));
      worker.resizeGpu(w, h);
    }
    return;
  }

  // S-13 (K-7) — text measurement rides the typed `channel` envelope
  // but is served by the dedicated `CanvasWorker.measureText` query
  // (the v38 wasm method) rather than the generic `handleMessage`
  // dispatch: it returns a plain JS object, not a JSON envelope. Reply
  // with the `measureTextResult` wire kind, correlated on `seq`. A
  // `null` shaper result (no document / unresolved face) normalises to
  // zeroed metrics so the `measureTextResult` payload stays total.
  if (data.kind === "channel" && data.msg.kind === "requestMeasureText") {
    await initPromise;
    if (!worker) return;
    const { family, style, text, sizePt } = data.msg.payload;
    const metrics = worker.measureText(family, style ?? null, text, sizePt);
    postBack({
      seq: data.msg.seq,
      protocol: PROTOCOL_VERSION,
      kind: "measureTextResult",
      payload: metrics ?? { advance: 0, ascender: 0, descender: 0 },
    });
    return;
  }

  // Default: the typed JSON channel.
  await initPromise;
  if (!worker) {
    return;
  }
  const replyJson = worker.handleMessage(JSON.stringify(data.msg));
  if (replyJson) {
    const reply = JSON.parse(replyJson) as WorkerToMain;
    postBack(reply);
    applyReplyEffects(reply);
  }
}

async function attachRenderer(
  canvas: OffscreenCanvas,
  dpr: number,
  cssWidth: number,
  cssHeight: number,
): Promise<void> {
  if (!worker || !cameraBuffer) return;
  if (renderer) {
    renderer.stop();
  }

  // GPU-first attempt: a successful `initGpu` claims the
  // OffscreenCanvas's WebGPU context. If it fails, the canvas is
  // still virgin and we can still grab a 2D context for the CPU
  // path. The order matters — once `getContext("2d")` is called,
  // requesting WebGPU on the same canvas is illegal.
  let gpuActive = false;
  if (worker.initGpu) {
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    try {
      gpuActive = await worker.initGpu(canvas, w, h);
    } catch (err) {
      console.warn("initGpu threw:", err);
      gpuActive = false;
    }
  }

  const wasmShim: RendererWasm = {
    pageCount: () => worker!.pageCount(),
    pageInfo: (index) => {
      const arr = worker!.pageInfo(index) as unknown as
        | [string, number, number]
        | undefined;
      return arr;
    },
    renderTilePng: (pageId, widthPx) => worker!.renderTilePng(pageId, widthPx),
    presentFrame:
      gpuActive && worker.presentFrame
        ? (s, x, y, d) => worker!.presentFrame!(s, x, y, d)
        : undefined,
  };

  renderer = new WorkerRenderer(
    canvas,
    wasmShim,
    cameraBuffer,
    dpr,
    cssWidth,
    cssHeight,
    {
      gpuActive,
    },
  );
  if (worker.pageCount() > 0) {
    renderer.refreshLayout();
  }
  renderer.start();
  // Notify the main thread so the HUD can show the GPU/CPU badge
  // and the developer console can confirm initGpu's outcome.
  postBack({
    seq: null,
    protocol: PROTOCOL_VERSION,
    kind: "attachReady",
    payload: { gpuActive, sceneCacheBudget: 200 },
  });
}

function postBack(msg: WorkerToMain) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

// Step 5d/5e — gesture SAB drain loop. Polls the gesture buffer
// every 8ms (~120 Hz so pointer-rate updates land in the next
// tick). On a fresh record the wasm `updateGestureRaw` applies
// the delta directly — no JSON envelope, no postMessage in. The
// returned JSON carries the dirty page set + the active snap
// guides; 5e surfaces those as an unsolicited
// `gestureSnapLines` notification so the overlay can still
// render guides while the gesture takes the SAB hot path.
const GESTURE_DRAIN_INTERVAL_MS = 8;

interface GestureRawOutcome {
  pageIds: string[];
  snapLines: SnapLine[];
}

function startGestureDrain() {
  if (gestureDrainHandle !== null) return;
  const tick = () => {
    gestureDrainHandle = setTimeout(tick, GESTURE_DRAIN_INTERVAL_MS);
    if (!worker || !gestureBuffer) return;
    const record = gestureBuffer.drainLatest();
    if (!record) return;
    const handleLo = Number(record.handle & 0xffff_ffffn);
    const handleHi = Number((record.handle >> 32n) & 0xffff_ffffn);
    let mods = 0;
    if (record.modifiers.shift) mods |= 0b001;
    if (record.modifiers.alt) mods |= 0b010;
    if (record.modifiers.disableSnap) mods |= 0b100;
    const outcomeJson = worker.updateGestureRaw(
      handleLo,
      handleHi,
      record.dx,
      record.dy,
      mods,
    );
    if (!outcomeJson) {
      // Stale handle or no document. The main thread's
      // `cancelGesture` path will clear the overlay separately.
      return;
    }
    let outcome: GestureRawOutcome;
    try {
      outcome = JSON.parse(outcomeJson) as GestureRawOutcome;
    } catch (e) {
      console.warn("updateGestureRaw outcome parse failed:", e);
      return;
    }
    renderer?.markDirty(outcome.pageIds);
    // Empty `snapLines` is meaningful — the gesture left a
    // previously-snapped axis and the overlay must clear its stale
    // guides. Post unconditionally so subscribers see every drain.
    postBack({
      seq: null,
      protocol: PROTOCOL_VERSION,
      kind: "gestureSnapLines",
      payload: { snapLines: outcome.snapLines },
    });
  };
  tick();
}
