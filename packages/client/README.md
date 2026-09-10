# @paged-media/client

The programmable Paged SDK. One class, `CanvasClient`, over the
[`@paged-media/canvas-wasm`](https://www.npmjs.com/package/@paged-media/canvas-wasm)
engine: load a document, mutate it, read it back, render it, export it —
across a Web Worker, over the same typed wire the Paged editor itself
speaks.

There is no second engine here and no second vocabulary. This package is
the editor's own client, published.

## Which SDK is which

Paged ships two, and they are different on purpose.

| | `@paged-media/idml-viewer` | `@paged-media/client` (this one) |
|---|---|---|
| what it does | shows a document | **changes** a document |
| engine deps | renderer-core only | the full canvas engine |
| writes | none, structurally | all 117 mutations |
| runs in | any page with WebGPU | a page with cross-origin isolation (SharedArrayBuffer) |

The viewer is read-only by design — "sibling, not a shrunk app" — and
growing it into a write surface would undo that decision. If you want to
display an IDML, use the viewer. If you want to author one, use this.

## Install

```sh
npm install @paged-media/client @paged-media/canvas-wasm
```

The package constructs a `Worker` and reads a `SharedArrayBuffer`, so the
serving page must be cross-origin isolated (`Cross-Origin-Opener-Policy:
same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). Emitted
imports are extensionless ESM: every consumer of this package is a
browser bundle, and already runs a bundler.

## Use

```ts
import { CanvasClient } from "@paged-media/client";

const client = new CanvasClient({
  workerFactory: () => new Worker(new URL("./canvas.worker.ts", import.meta.url), { type: "module" }),
});

await client.loadDocument(idmlBytes);

// Read: any of the document's 26 collections, generic over the shape
// you expect back.
const pages = await client.collection<{ selfId: string }>("pages");
const meta = await client.documentMeta();

// Write: one door, every operation. A Mutation is `{ op, args }`.
const reply = await client.mutate({
  op: "insertTextFrame",
  args: { pageId: pages[0].selfId, bounds: [72, 72, 720, 540] },
});
// reply.kind === "mutationApplied" — `minted` carries the ids the
// engine just created, which is how you address what you made.

// Out: IDML, .paged, or PDF.
const idml = await client.exportIdml();
```

`mutate()` takes the engine's `Mutation` type rather than offering a
method per operation, which is why an operation added to the engine is
reachable from here as soon as the types are re-vendored. The typed
helpers (`setSelection`, `registerFont`, `beginGesture`, …) exist where a
call needs shaping; `send()` reaches anything they do not.

## The catalog

`api-catalog.json`, shipped in this package, is the machine-readable
surface: every public member with its signature and summary, plus
`wireKinds` — which of the engine's message kinds this client reaches.
It is **generated** from the source (`scripts/client-api-catalog.mjs` in
the editor repo), so it cannot drift from the code, and a public method
without a doc comment fails the build rather than shipping undocumented.

Read it to answer "can the SDK do X" without reading the source:

```ts
import catalog from "@paged-media/client/api-catalog.json";
catalog.wireKinds.includes("exportPdfBegin"); // true
```

## Versioning

`0.<protocol>.<patch>` — the same scheme as `@paged-media/canvas-wasm`.
The minor is the wire protocol version this client speaks, so a client
and an engine that share a minor are compatible by construction.

## License

AGPL-3.0-only OR the Paged Media Enterprise License (PMEL). See
`LICENSE.md` in the repository root.
