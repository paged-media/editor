# ADR 202 — The render worker owns the canvas; main thread and engine talk over a sequenced channel and shared memory

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `apps/canvas/src/worker/`, `apps/canvas/src/ui/ViewportCanvas.tsx`, `packages/client/src/client.ts`, `packages/client/src/sab/`

## Context

The engine is a wasm module; the editor's interface is React on the main thread. ADR 115 in
the engine repository records the engine's side of that boundary, this record the editor's.

Comments state the rule that the main thread does no rendering and cite a spec that is not
in this repository (`apps/canvas/src/ui/ViewportCanvas.tsx:33-35`,
`apps/canvas/src/worker/render.ts:28-30`). The repository does not record why.

The reasons for the individual lanes are recorded. The camera is in shared memory so that
"panning and zooming never queue a message per frame" (`packages/client/src/client.ts:174-178`).
Gesture deltas are in shared memory because a drag fires at pointer-event rate, each message
pays a structured clone, and only the latest delta matters
(`packages/client/src/sab/gesture.ts:26-34`). Document bytes bypass the JSON envelope because
that path costs about eight times as much and overflows on wasm32 above about 80 MB
(`packages/client/src/client.ts:247-252`).

## Decision

The application transfers its `<canvas>` to a dedicated Web Worker. The worker owns the
engine wasm, the GPU surface and the render loop; `CanvasClient` on the main thread drives it
over four lanes.

- **Canvas.** `ViewportCanvas` calls `transferControlToOffscreen()` once and hands the result
  to `CanvasClient.attachCanvas`. The worker tries `initGpu` on it first and falls back to a
  2D context that blits PNG tiles from `renderTilePng`; the order is fixed because a canvas
  that has given out a 2D context can no longer take WebGPU. The loop is a 16 ms `setTimeout`
  that redraws only when something is dirty or the camera generation changed.
- **Envelope.** `send` posts `{seq, protocol, kind, payload}` and keeps a pending table;
  a reply is matched on `seq`, and a message with `seq: null` is a notification delivered to
  `subscribe` listeners. Every envelope message is also fanned out to those listeners.
- **Camera buffer.** 32 bytes of `SharedArrayBuffer`. The main thread is the only writer: it
  stores scale, tx and ty, then bumps a generation counter. The worker reads per frame.
- **Gesture buffer.** 32 bytes holding only the latest pointer delta. The worker drains it
  every 8 ms into `updateGestureRaw` and posts the snap guides back as `gestureSnapLines`.
- **Side messages.** `loadDocumentBinary` carries document, font and ICC bytes as
  transferables; the canvas, resize, buffer and journal messages also bypass the envelope.
  The worker queues every incoming message through one async pump, because `initGpu` awaits
  and a second message would re-enter the wasm object while it is borrowed.
- The buffer layouts are TypeScript constants that mirror the engine's, so the buffers can be
  allocated before the wasm loads. After loading, the worker compares both and posts
  `protocolMismatch` on a difference.
- The worker entry is `apps/canvas/src/worker/worker.ts`, in the application. `CanvasClient`
  receives a `workerFactory`; the client package contains no worker entry.

## Evidence

- `apps/canvas/src/ui/ViewportCanvas.tsx:303-317`, `packages/client/src/client.ts:1412-1428` — the transfer and `attachCanvas`
- `apps/canvas/src/worker/worker.ts:595-661`, `apps/canvas/src/worker/render.ts:250-289` — GPU first, 2D fallback; the render loop
- `packages/client/src/client.ts:218-236`, `:1621-1641` — the envelope, the pending table, the fan-out
- `packages/client/src/sab/camera.ts:20-41`, `:117-134` — camera layout, single writer, write order
- `packages/client/src/sab/gesture.ts:43-56`, `apps/canvas/src/worker/worker.ts:667-726` — gesture layout and the 8 ms drain
- `packages/client/src/client.ts:254-287`, `apps/canvas/src/worker/worker.ts:439-466`, `:321-392`, `:163-262`, `:288-299` — the binary load lane; the message pump; the layout comparison
- `packages/client/src/client.ts:98-132`, `apps/canvas/src/main.tsx:64-70`, `:1783-1791` — `workerFactory` and the `?worker` import

## Alternatives considered

- **A worker URL passed into the client.** The earlier shape: Vite could not see a worker
  constructed across the package boundary, so the production build "shipped a dead worker and
  no `.wasm`" (`packages/client/src/client.ts:110-120`). `workerUrl` remains for other bundlers.
- **Gesture updates as envelope messages.** Still the default mode of `updateGesture`; the
  shared buffer is the opt-in `"sab"` mode (`packages/client/src/client.ts:1099-1117`).
- **CPU tiles only.** The first step (`apps/canvas/src/worker/worker.ts:32-33`); now the fallback.

## Consequences

The shared buffers need a cross-origin isolated page. `main.tsx` runs a boot check that
prints a banner and does not throw (`apps/canvas/src/boot/cross-origin-isolation-check.ts:90-98`).
Outside an isolated page both buffers fall back to a plain `ArrayBuffer` and `updateGesture`
to the envelope. Overlays on the main thread are contributions drawn into one SVG above the
canvas (`packages/shell/src/overlays/overlay-host.tsx:92`). Worker code may import neither
React nor the shell (ADR 206). A second host of `@paged-media/client` must supply its own
worker entry (ADR 205). The worker reaches the wasm class through a locally declared
interface and a cast (`apps/canvas/src/worker/worker.ts:79-148`, `:271-272`).

Texts contradict the code. The boot check and `packages/client/README.md:33-35` name COEP
`require-corp`; `apps/canvas/public/_headers` and the dev server send `credentialless`. The
boot banner says the worker will throw when it allocates the camera buffer; the buffer is
allocated on the main thread, with the fallback above. The header of `worker.ts` (`:20-33`)
still shows URL-based construction and calls WebGPU a later step.

## Related

- [ADR 115](https://github.com/paged-media/core/blob/main/docs/adr/115-worker-boundary-transports.md), [ADR 114](https://github.com/paged-media/core/blob/main/docs/adr/114-interaction-lives-in-the-engine.md) — the engine side of the transports; the gestures the buffer feeds
- [ADR 200](200-engine-as-npm-wasm-packages.md), [ADR 205](205-client-packaged-as-write-sdk.md), [ADR 206](206-package-layering-lint-zones.md) — the package the worker loads; the client packaged as the write SDK; the worker lint zone
