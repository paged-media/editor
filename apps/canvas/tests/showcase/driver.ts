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

// `ShowcaseDoc` — the authoring surface the showcase page modules use.
//
// It is a thin layer over the journey `Designer`, not a replacement.
// Designer already owns the primitives (draw, select, fill, render,
// count, layers, swatches, runCommand) and every plugin journey is
// written against it, so the recipes here stay recognisable to anyone
// who has read those specs. What this adds is the handful of doors a
// long-form DOCUMENT needs and a single-page journey does not: pages
// addressed by index, text poured and styled by NAME, frames threaded
// into a story, items assigned to layers, and the container written
// out at the end.
//
// Two rules the modules rely on:
//
//   · Everything is addressed BY NAME, never by index into a
//     collection. The corpus campaign's sharpest lesson was a spec
//     that took the LAST paragraph style and went quietly green for
//     two months when a regenerated fixture appended one more. Style
//     and swatch lookups here resolve by name and THROW when the name
//     is absent, so a drifted base fixture fails loudly on page one.
//
//   · `mutate` never rejects. `client.mutate` resolves with
//     `mutationFailed` rather than throwing, so every wrapper here
//     checks the reply kind and throws with the engine's own error.
//     A silent refusal would otherwise show up much later as an empty
//     frame nobody ordered.

import { expect, type Page } from "@playwright/test";

import { mutate as rawMutate, script } from "../e2e/harness/ui";
import { Designer } from "../journey/driver/designer";
import type { Ledger } from "./ledger";

/** One page, as `paged.pages()` reports it (`PageSummary` on the wire:
 *  `selfId`, 1-based `index`, `sizePt` and the four margins). The
 *  driver keeps the wire's own field names rather than renaming them —
 *  the spelling here was guessed once as `pageId`/`widthPt` and the
 *  driver's spec caught it, which is the argument for not guessing. */
export interface PageInfo {
  selfId: string;
  index: number;
  sizePt: [number, number];
  marginTopPt?: number;
  marginLeftPt?: number;
  marginBottomPt?: number;
  marginRightPt?: number;
}

export interface NamedItem {
  selfId: string;
  name?: string;
}

/** `[top, left, bottom, right]`, the engine's bounds order. */
export type Bounds = [number, number, number, number];

/** One element a batch minted, as the engine reports it beside
 *  `createdId` (`MutationApplied.minted`, additive on wire v62). */
export interface MintedElement {
  handle: string | null;
  element: { kind: string; id: string };
  storyId: string | null;
}

/** A page + box, as `storyOf` and `textFrame` both name it. */
function boxKey(pageId: string, bounds: Bounds): string {
  return `${pageId}:${bounds.join(",")}`;
}

/** The C-15 handle-reference prefix, as the engine spells it. */
const HANDLE_PREFIX = "$h:";

/** Where a reference sits, which decides WHICH id resolves it: a
 *  `storyId` position takes the story an insert minted, every other
 *  address position takes the element. */
type RefPosition = "element" | "story";

function isRef(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(HANDLE_PREFIX);
}

function positionOf(key: string | undefined): RefPosition {
  return key === "storyId" || key === "story_id" ? "story" : "element";
}

/** Does anything under `value` look like a handle reference? */
function hasRef(value: unknown): boolean {
  if (isRef(value)) return true;
  if (Array.isArray(value)) return value.some(hasRef);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasRef);
  }
  return false;
}

/** Replace every reference `resolve` knows, leaving the rest in place
 *  (the engine resolves those itself, inside the batch). */
function rewriteRefs(
  value: unknown,
  resolve: (ref: string, position: RefPosition) => string | null,
  key?: string,
): unknown {
  if (isRef(value)) return resolve(value, positionOf(key)) ?? value;
  if (Array.isArray(value)) return value.map((v) => rewriteRefs(v, resolve, key));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteRefs(v, resolve, k);
    }
    return out;
  }
  return value;
}

/**
 * Is a reference left in a position the ENGINE will not rewrite?
 *
 * `batch_handles.rs` rewrites exactly two shapes: a serialised
 * `ElementId` (`{kind, id}`, `id` a reference) and a bare string under
 * a key ending in `Id` / `Ids`. A `storyRange` address carries its
 * story under `story_id` inside an object of three keys — neither
 * shape — so a pending handle there has to be resolved before the op
 * is queued.
 */
function hasUnrewritableRef(value: unknown, key?: string): boolean {
  if (isRef(value)) {
    return !(key !== undefined && (key.endsWith("Id") || key.endsWith("Ids")));
  }
  if (Array.isArray(value)) {
    return value.some((v) => hasUnrewritableRef(v, key));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    // Rule 1 — a whole `ElementId`: the engine replaces it outright,
    // whatever the placeholder kind says.
    if (
      entries.length === 2 &&
      typeof (value as { kind?: unknown }).kind === "string" &&
      isRef((value as { id?: unknown }).id)
    ) {
      return false;
    }
    return entries.some(([k, v]) => hasUnrewritableRef(v, k));
  }
  return false;
}

export class ShowcaseDoc {
  readonly designer: Designer;

  private pagesCache: PageInfo[] = [];

  /** When set, every wire op that passes through {@link mutate} is
   *  tallied (ops + property paths) for the three-axis ledger. The
   *  chapter runner sets it; standalone driver tests leave it unset. */
  ledger?: Ledger;

  /**
   * Every `page.evaluate` flushes the queue first.
   *
   * Deferred mode's one invariant is that nothing ever reads a document
   * that is missing this module's queued writes. The driver's own reads
   * flush explicitly, but sixty-odd module call sites and the plugin
   * helpers reach the page directly — `sceneRefs`, `geometryOf`,
   * `invokeWith`, every `host.*` call. Wrapping the one door they all
   * go through is what makes the invariant true everywhere instead of
   * at the call sites someone remembered. Re-entrant by construction:
   * `flush` empties the queue BEFORE it sends, so the send's own
   * evaluate finds nothing left to do.
   */
  private hookPageReads(page: Page): void {
    for (const name of ["evaluate", "evaluateHandle"] as const) {
      const raw = page[name].bind(page) as (...a: unknown[]) => Promise<unknown>;
      (page as unknown as Record<string, unknown>)[name] = async (
        ...args: unknown[]
      ) => {
        await this.flush();
        // …and the ARGUMENT is resolved too. A module holds a handle
        // string, and after the flush that handle names a real element
        // — but the string in its hand still says `$h:m3`. Rewriting it
        // here is what lets `geometryOf(page, [{kind, id}])` and every
        // other raw read take a handle exactly like an id. (Found by
        // the drawing chapter's spread-offset probe, which inserted a
        // rectangle and asked for its geometry: "answered no geometry",
        // because it had asked about `$h:m3`.)
        // Only when a reference is actually in there: the argument may
        // be a JSHandle, which must be passed through untouched.
        const rest = args.slice(1);
        if (rest.length > 0 && hasRef(rest[0])) {
          rest[0] = rewriteRefs(rest[0], (ref, position) => {
            // KNOWN refs only. The driver's own batch payload travels
            // through this same door carrying the handles the ENGINE is
            // meant to resolve; rewriting those would be the harness
            // answering a question addressed to the engine.
            const hit = this.refs.get(ref);
            if (!hit) return null;
            return position === "story" ? (hit.storyId ?? hit.id) : hit.id;
          });
        }
        return raw(args[0], ...rest);
      };
    }
  }

  constructor(readonly page: Page) {
    this.designer = new Designer(page);
    this.hookPageReads(page);
  }

  // ── document ────────────────────────────────────────────────────

  /**
   * Load an IDML/`.paged` from an absolute path through the editor's REAL
   * open flow — the file input the drop zone and File ▸ Open both feed.
   *
   * It used to call `client.loadDocument` directly, and that one shortcut
   * cost the showcase its GPU. `client.loadDocument` reaches the WORKER
   * only: the shell's `useDocument().handle` stays null, so
   * `canvas-panel.tsx` renders its "Drop an IDML file here" placeholder
   * instead of `<ViewportCanvas>`, so no OffscreenCanvas is ever
   * transferred, so `attachCanvas` → `initGpu` never runs and
   * `__canvas.gpuActive` sits at `null` forever. The whole document still
   * built (every read here is worker-side), which is why it looked like a
   * missing adapter rather than a missing canvas — but paged.image's
   * GPU-only kernels degraded to a note on a machine that has a perfectly
   * good Metal adapter.
   *
   * Driving the input is the same idiom the panel specs use
   * (`loadViaInput` in navigator-panel.spec.ts et al) and it goes through
   * `loadDocumentFile` — which also hands the engine the default font, so
   * text shapes here exactly as it does for a user.
   */
  async load(absPath: string): Promise<number> {
    await this.page.setInputFiles('input[type="file"]', absPath);
    await this.page.waitForFunction(
      () =>
        (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas
          ?.ready === true,
      null,
      // 12 min, not 2: opening a checkpoint is parse + FIRST COMPOSE,
      // and composition cost scales with authored content — the
      // ninety-page document with the full drawing office aboard blew
      // the two-minute wait at the load door itself.
      { timeout: 720_000 },
    );
    const count = await this.page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { handle: { pageCount: number } };
          }
        ).__canvas.handle.pageCount,
    );
    this.pagesCache = [];
    return count;
  }

  /** Every page, in document order. Cached; call `refreshPages()` after
   *  a structural change. */
  async pages(): Promise<PageInfo[]> {
    await this.flush();
    if (this.pagesCache.length === 0) await this.refreshPages();
    return this.pagesCache;
  }

  async refreshPages(): Promise<PageInfo[]> {
    await this.flush();
    // `paged.pages()` returns a JSON STRING (every read in the Boa
    // surface does). Evaluating the expression is enough — wrapping it
    // in `console.log` would come back through the capture channel
    // prefixed with `[log] ` and fail to parse, which is exactly what
    // the driver's own spec caught.
    const raw = await script(this.page, "paged.pages()");
    this.pagesCache = JSON.parse(raw[0] ?? "[]") as PageInfo[];
    return this.pagesCache;
  }

  /** Engine page id for a ZERO-based index. `PageSummary.index` is
   *  1-based (it is what a "go to page" box shows), so the two are not
   *  interchangeable and the conversion lives here rather than in
   *  fifteen page modules. */
  async pageId(index: number): Promise<string> {
    const all = await this.pages();
    const p = all[index];
    if (!p) throw new Error(`no page at index ${index} (have ${all.length})`);
    return p.selfId;
  }

  // ── the raw wire, with refusals made loud ───────────────────────

  /**
   * Apply one mutation and return the id of whatever it minted.
   *
   * Throws with the engine's own error on refusal, because
   * `client.mutate` RESOLVES with `mutationFailed` rather than
   * rejecting — a wrapper that forwarded the promise would swallow
   * every engine error and surface it much later as an empty frame
   * nobody ordered.
   *
   * The return type is `unknown` rather than `string` on purpose.
   * `ElementId.id` is usually a raw self_id string, but not always:
   * `insertTable` mints a STRUCTURED id (`{ story_id, table_id }`),
   * and reading that as a string is a bug paged.sheet already shipped
   * once. Callers that know they created a simple element use
   * {@link mutateId}; callers of a structured op narrow it themselves.
   */
  /** True once any reply loss was classified this session — enables
   *  the cheap pre-reads that make insertText recovery decidable. */
  static replyLossSeen = false;
  private preInsertChars: number | null = null;
  private preMintIds: Set<string> | null = null;

  /** Wire op → the scene kind it mints, for reply-loss re-discovery. */
  static readonly MINT_KINDS: Record<string, string> = {
    insertTextFrame: "textFrame",
    insertFrame: "rectangle",
    insertOval: "oval",
    insertLine: "graphicLine",
    insertPath: "polygon",
  };

  /** Every scene id of one kind — the re-discovery diff's raw list. */
  private async sceneIds(kind: string): Promise<string[]> {
    await this.flush();
    return this.page.evaluate(async (k) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { sceneTree: () => Promise<Array<{ kind: string; id: string; children?: unknown[] }>> };
          };
        }
      ).__canvas;
      const roots = (await c.client.sceneTree()) as Array<{
        kind: string;
        id: string;
        children?: Array<{ kind: string; id: string }>;
      }>;
      const out: string[] = [];
      const walk = (nodes: Array<{ kind: string; id: string; children?: unknown }>) => {
        for (const n of nodes) {
          if (n.kind === k) out.push(n.id);
          if (Array.isArray((n as { children?: unknown[] }).children)) {
            walk((n as { children: Array<{ kind: string; id: string }> }).children);
          }
        }
      };
      walk(roots);
      return out;
    }, kind);
  }

  /** One unraced wire send — the recovery path's retry lane. */
  private async mutateOnce(op: string, args: unknown): Promise<unknown> {
    const reply = (await rawMutate(this.page, { op, args })) as {
      kind?: string;
      payload?: {
        createdId?: { kind: string; id: unknown } | null;
        error?: unknown;
      };
    };
    if (reply?.kind !== "mutationApplied") {
      throw new Error(
        `mutation ${op} refused on reply-loss retry: ${JSON.stringify(reply?.payload?.error ?? reply?.kind)}`,
      );
    }
    return reply.payload?.createdId?.id ?? null;
  }

  /**
   * Send one mutation — or QUEUE it, when the document is in deferred
   * mode ({@link defer}).
   *
   * What a mutation costs is the engine's rebuild: `apply_mutation`
   * walks the whole document, so the price scales with the pages
   * already authored, not with the edit. Measured on the annual's
   * finished 134-page book that is ~14 s per operation in wasm — which
   * is where the fifteen hours of the first build went. A batch pays it
   * ONCE for all its children (core's `apply_mixed_batch` defers the
   * rebuild to the end), so deferred mode collects a module's ops and
   * sends them as one `batch`.
   */
  async mutate(op: string, args: unknown): Promise<unknown> {
    if (this.deferring && ShowcaseDoc.batchable(op)) {
      await this.enqueue(op, args);
      return null;
    }
    if (ShowcaseDoc.touchesCollections(op)) this.collectionCache.clear();
    await this.flush();
    return this.sendMutation(op, await this.resolveRefs(op, args));
  }

  /** One mutation, sent now — the wire lane with its reply-loss
   *  classifier. {@link mutate} is the door callers use. */
  private async sendMutation(op: string, args: unknown): Promise<unknown> {
    this.lastMinted = [];
    this.preInsertChars = null;
    this.preMintIds = null;
    // Pre-capture is UNCONDITIONAL for minting ops: the adaptive
    // capture left the session's FIRST loss unrecoverable (no
    // pre-list, no diff — the darkroom died to exactly that). One
    // sceneTree read per mint is the premium for never losing a
    // chapter to a lost reply.
    if (ShowcaseDoc.MINT_KINDS[op]) {
      this.preMintIds = new Set(
        await this.sceneIds(ShowcaseDoc.MINT_KINDS[op]).catch(() => []),
      );
    }
    if (op === "insertText") {
      const a = args as { storyId?: string };
      if (typeof a?.storyId === "string") {
        this.preInsertChars = await this.storyChars(a.storyId).catch(() => null);
      }
    }
    if (process.env.ANNUAL_TRACE) {
      // eslint-disable-next-line no-console
      console.log(`[trace] ${op} ${JSON.stringify(args)?.slice(0, 120)}`);
    }
    if (this.ledger) {
      this.ledger.record(op, args);
      // A batch counts its inner ops too — "exercised inside a batch"
      // is exercised; only counting the wrapper would leave every
      // batched op looking unused.
      if (op === "batch" && typeof args === "object" && args !== null) {
        const inner = (args as { ops?: Array<{ op?: string; args?: unknown }> })
          .ops;
        for (const o of inner ?? []) {
          if (typeof o?.op === "string") this.ledger.record(o.op, o.args);
        }
      }
    }
    // A mutate whose reply never arrives is indistinguishable from a
    // slow one — until you ask the worker something else. The 90 s race
    // + read-probe below classifies the stall the annual keeps hitting
    // on the in-chain document (ops ~100+ of a heavy chapter): if the
    // probe answers, the WORKER IS ALIVE and this op's reply was lost;
    // if the probe hangs too, the worker is deadlocked. Either way the
    // failure is diagnosed in 100 s instead of a silent 25-minute
    // timeout. No retry — the op may have applied.
    const stallMs = Number(process.env.ANNUAL_STALL_MS ?? 90_000);
    if (process.env.ANNUAL_TRACE) {
      // eslint-disable-next-line no-console
      console.log(`[trace-race] arming ${stallMs}ms for ${op}`);
    }
    const raced = await Promise.race([
      rawMutate(this.page, { op, args }).then((r) => ({ kind: "reply" as const, r })),
      new Promise<{ kind: "stall" }>((resolve) =>
        setTimeout(() => resolve({ kind: "stall" }), stallMs),
      ),
    ]);
    if (process.env.ANNUAL_TRACE) {
      // eslint-disable-next-line no-console
      console.log(`[trace-race] settled ${raced.kind} for ${op}`);
    }
    if (raced.kind === "stall") {
      const probe = await Promise.race([
        this.page
          .evaluate(async () => {
            const c = (
              globalThis as unknown as {
                __canvas: { client: { documentMeta: () => Promise<unknown> } };
              }
            ).__canvas;
            await c.client.documentMeta();
            return "alive";
          })
          .catch(() => "evaluate-failed"),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("dead"), 10_000),
        ),
      ]);
      if (probe !== "alive") {
        throw new Error(
          `mutation ${op} stalled 90s with worker DEADLOCKED (reads hang too) — args ${JSON.stringify(args)?.slice(0, 200)}`,
        );
      }
      // WORKER ALIVE, REPLY LOST — the classified race this classifier
      // was built for (first fired on an insertText mid-wrap-catalog).
      // Recovery is op-shaped, never blind for non-idempotent ops:
      //   · idempotent property/style writes retry once;
      //   · insertText verifies application via the story's contiguous
      //     length before deciding to retry or continue;
      //   · minting ops fail diagnosed (a retry could double-mint).
      ShowcaseDoc.replyLossSeen = true;
      const idempotent = new Set([
        "setElementProperty",
        "setStyleProperty",
        "applyStyle",
      ]);
      if (idempotent.has(op)) {
        // eslint-disable-next-line no-console
        console.log(`[reply-lost] ${op} — idempotent, retrying once`);
        return this.mutateOnce(op, args);
      }
      if (op === "insertText" && this.preInsertChars !== null) {
        const a = args as { storyId: string; text: string };
        const now = await this.storyChars(a.storyId);
        const expected = this.preInsertChars + a.text.replace(/\n/g, "").length;
        // eslint-disable-next-line no-console
        console.log(
          `[reply-lost] insertText — story ${now === expected ? "ADVANCED (treating as applied)" : "unchanged, retrying once"}`,
        );
        if (now === expected) return null;
        return this.mutateOnce(op, args);
      }
      // Minting ops recover by RE-DISCOVERY: the op may have applied
      // with its reply lost, so the scene is diffed for exactly one new
      // element of the minted kind — one → that IS the created id;
      // none → the op never landed, retry once; several → ambiguous,
      // fail diagnosed. Pre-lists are captured lazily once a loss has
      // been seen (the adaptive pre-read pattern insertText uses).
      const mintKind = ShowcaseDoc.MINT_KINDS[op];
      if (mintKind && this.preMintIds !== null) {
        const after = await this.sceneIds(mintKind);
        const fresh = after.filter((id) => !this.preMintIds?.has(id));
        // eslint-disable-next-line no-console
        console.log(
          `[reply-lost] ${op} — ${fresh.length} new ${mintKind}(s) found ${fresh.length === 1 ? "(recovered id)" : fresh.length === 0 ? "(retrying once)" : "(ambiguous)"}`,
        );
        if (fresh.length === 1) return fresh[0];
        if (fresh.length === 0) return this.mutateOnce(op, args);
      }
      throw new Error(
        `mutation ${op} stalled 90s with worker ALIVE (reply lost) — args ${JSON.stringify(args)?.slice(0, 200)}`,
      );
    }
    const reply = raced.r as {
      kind?: string;
      payload?: {
        createdId?: { kind: string; id: unknown } | null;
        minted?: MintedElement[];
        error?: unknown;
      };
    };
    if (reply?.kind !== "mutationApplied") {
      const err = JSON.stringify(reply?.payload?.error ?? reply?.kind);
      throw new Error(`mutation ${op} refused: ${err}`);
    }
    // Every id a batch minted, in mint order (core reports it beside
    // `createdId`, which can only ever name the LAST). {@link flush}
    // reads it to give each queued handle its real id.
    this.lastMinted = (reply.payload as { minted?: MintedElement[] })?.minted ?? [];
    return reply.payload?.createdId?.id ?? null;
  }

  /** {@link mutate} for an op that mints a simple element id. Throws
   *  when the engine returned a structured id instead, rather than
   *  stringifying it into something that addresses nothing. */
  async mutateId(op: string, args: unknown): Promise<string> {
    if (this.deferring && ShowcaseDoc.batchable(op)) {
      return this.enqueueMint(op, args);
    }
    const id = await this.mutate(op, args);
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(
        `${op} did not mint a simple element id (got ${JSON.stringify(id)}) — ` +
          `use mutate() and narrow it`,
      );
    }
    return id;
  }

  /** Several mutations as ONE undo step. Note the engine's batch
   *  executor does not dispatch image ops and does not substitute
   *  `$created` into a `storyId` (wire v62) — compound inserts that
   *  need either stay sequential on purpose. */
  async batch(ops: Array<{ op: string; args: unknown }>): Promise<void> {
    // `batch` is on NEVER_BATCH, so this flushes the queue and sends —
    // an explicit batch never nests inside the implicit one.
    await this.mutate("batch", { ops });
  }

  // ── deferred authoring: one rebuild per module ───────────────────
  //
  // The wire lane pays a full document rebuild PER OPERATION. Deferred
  // mode queues everything a module authors and sends it as one
  // `batch`, which the engine rebuilds once. Nothing about a module's
  // code changes: a minting call still returns something addressable —
  // a C-15 handle reference (`$h:m12`) that the engine resolves inside
  // the batch and this driver resolves to the real id once the batch
  // has landed (core reports every mint on the reply).
  //
  // Three rules keep it honest:
  //  1. every READ flushes first, so a module never reads a document
  //     that is missing its own queued writes;
  //  2. a queued handle that would land in a position the ENGINE
  //     cannot rewrite (the `story_id` inside a `storyRange` address,
  //     say) flushes first too, so the reference resolves here instead;
  //  3. after a flush the handle a module still holds resolves in the
  //     ARGUMENT of any raw `page.evaluate` as well, so a handle reads
  //     like an id everywhere, not only through this driver's doors.
  //
  // What deferral cannot cover: a module that drives the editor's UI
  // (the app shows what has been APPLIED) and an op carrying an
  // absolute index measured before the batch (`reorderElement
  // { index }` — the engine's own docs prefer the relative verbs for
  // exactly this reason). The chapter runner authors batched on the
  // first attempt and one-op-per-mutation on a retry, so those modules
  // still land; `SpreadSpec.unbatched` makes the choice permanent.

  /** Queued ops, in the order the module wrote them. */
  private queue: Array<{ op: string; args: unknown }> = [];
  /** Handle refs minted by the queue, in mint order. */
  private queuedRefs: string[] = [];
  /** Resolved handles: `$h:m12` → the ids the engine minted for it. */
  private refs = new Map<string, { id: string; storyId: string | null }>();
  /** Mints reported by the last reply (`MutationApplied.minted`). */
  private lastMinted: MintedElement[] = [];
  private handleSeq = 0;
  private deferring = false;
  /** Story handle for the frame minted at a page+box, so `storyOf`
   *  answers from the queue instead of hit-testing a stale document. */
  private framesByBox = new Map<string, string>();

  /**
   * Ops that must NOT ride a batch. Image lanes carry bytes and are
   * dispatched outside the batch executor; `batch` itself never nests
   * here (the queue IS the batch).
   */
  static readonly NEVER_BATCH = new Set([
    "batch",
    "placeImage",
    "replaceImageBytes",
    "importSwatchLibrary",
    "registerFont",
    "registerColorProfile",
    // MINTING ops the driver does not route through `mutateId` — their
    // reply carries a STRUCTURED id (`insertTable`) or the caller needs
    // it synchronously. Queued, they would return null to a module that
    // is about to address what it just made, and they would also land
    // in the batch's mint list unnamed, where nothing could tell them
    // apart from a handle's. Sent alone, they answer as they always did.
    // (Derived from the engine's own minting set: the arms of
    // `try_translate_frame_mutation_to_operation` that build an
    // `InsertNode` / `CreateGroup` / `InsertAnchoredFrame`, plus the
    // planar ops whose applier builds an internal batch of inserts.)
    "insertTable",
    "createGroup",
    "insertAnchoredFrame",
    "pathfinderRegion",
    "pathfinderBoolean",
    "pathfinderFaces",
  ]);

  static batchable(op: string): boolean {
    return !ShowcaseDoc.NEVER_BATCH.has(op);
  }

  /** Does this op change what a NAMED lookup would answer? The style /
   *  swatch / layer / condition / section CRUD does; authoring ops
   *  (insert a frame, pour text, apply an existing style) do not. */
  private static touchesCollections(op: string): boolean {
    return (
      /^(create|delete|rename|edit|import)/.test(op) ||
      op.startsWith("layer") ||
      op.includes("Section") ||
      op.includes("Condition")
    );
  }

  /** Author with the queue on: every mutation the body sends rides one
   *  batch, flushed when the body returns (or earlier, at any read). */
  async defer<T>(body: () => Promise<T>): Promise<T> {
    const outer = this.deferring;
    this.deferring = true;
    try {
      const out = await body();
      await this.flush();
      return out;
    } catch (err) {
      // A failed module's queue must not leak into the next one — the
      // retry re-authors from the checkpoint, and a stray op from the
      // attempt that failed would author twice.
      this.queue = [];
      this.queuedRefs = [];
      throw err;
    } finally {
      this.deferring = outer;
    }
  }

  private async enqueue(op: string, args: unknown): Promise<void> {
    if (ShowcaseDoc.touchesCollections(op)) this.collectionCache.clear();
    // NOT recorded here: the ledger tallies a batch's inner ops when the
    // batch is SENT, which keeps `recordPath`'s rule — record only once
    // the lane reports the write applied — true of the op axis too.
    this.queue.push({ op, args: await this.resolveRefs(op, args) });
  }

  /** Queue a minting op and name its result, so the very next child can
   *  address it. Returns the handle reference — an id everywhere this
   *  driver accepts one. */
  private async enqueueMint(op: string, args: unknown): Promise<string> {
    const handle = `m${++this.handleSeq}`;
    const ref = `$h:${handle}`;
    await this.enqueue(op, args);
    this.queue.push({ op: "bindCreated", args: { handle } });
    this.queuedRefs.push(ref);
    return ref;
  }

  /** Send whatever is queued as ONE batch and learn what it minted.
   *  A no-op when the queue is empty, so reads may call it freely. */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const ops = this.queue;
    const refs = this.queuedRefs;
    this.queue = [];
    this.queuedRefs = [];
    // `sendMutation` tallies the wrapper AND every inner op — the
    // batch-aware arm the ledger has always had, which is why moving
    // authoring onto batches needs no new accounting.
    await this.sendMutation("batch", { ops });
    const minted = this.lastMinted;
    // NAME first: a batch that reaches the mixed lane (any text child)
    // comes back with each mint under the handle that bound it, so
    // extra mints from an op the driver did not name are ignored
    // rather than mistaken for one. ORDER is the fallback, and it is
    // the only contract the translatable lane offers — there the count
    // has to agree, or nothing can be told apart.
    const named = refs.every((ref) =>
      minted.some((m) => m.handle === ref.slice(3)),
    );
    if (!named && minted.length !== refs.length) {
      throw new Error(
        `batch of ${ops.length} ops minted ${minted.length} element(s) but ` +
          `${refs.length} handle(s) were bound, and the reply named none of ` +
          `them — an op in this batch mints without going through ` +
          `mutateId; add it to ShowcaseDoc.NEVER_BATCH`,
      );
    }
    for (const [i, ref] of refs.entries()) {
      const hit = named
        ? minted.find((m) => m.handle === ref.slice(3))
        : minted[i];
      const id = hit?.element?.id;
      if (typeof id !== "string" || id.length === 0) {
        throw new Error(
          `batch mint ${ref} came back as ${JSON.stringify(hit?.element)} — ` +
            `not a simple element id`,
        );
      }
      this.refs.set(ref, { id, storyId: hit?.storyId ?? null });
    }
  }

  /** The real ELEMENT id behind a handle reference (or the id itself).
   *  Throws while the handle is still queued — a caller that needs the
   *  real id should read, which flushes. */
  resolve(id: string): string {
    return this.resolveAs(id, "element");
  }

  /** The real STORY id behind a handle reference — the story the
   *  minting op created (a text frame's `ParentStory`), which is what
   *  a pour or a story read addresses. */
  resolveStory(id: string): string {
    return this.resolveAs(id, "story");
  }

  private resolveAs(id: string, position: RefPosition): string {
    if (!isRef(id)) return id;
    const hit = this.refs.get(id);
    if (!hit) {
      throw new Error(
        `handle ${id} has not been flushed yet — read through the driver ` +
          `(every read flushes) rather than resolving by hand`,
      );
    }
    return position === "story" ? (hit.storyId ?? hit.id) : hit.id;
  }

  /**
   * Substitute every handle reference this driver can already resolve,
   * and flush first when one it cannot would land somewhere the ENGINE
   * will not rewrite either.
   *
   * The engine rewrites two shapes (`batch_handles.rs`): a whole
   * serialised `ElementId` (`{kind, id}` with a reference `id`), and a
   * bare string under a key ending in `Id`/`Ids` — where a `storyId`
   * takes the story the insert minted. Everything else is content. A
   * `storyRange` address carries its story under `story_id`, which is
   * NOT one of those positions: that is the case this flushes for.
   */
  private async resolveRefs(op: string, args: unknown): Promise<unknown> {
    if (!hasRef(args)) return args;
    let out = rewriteRefs(args, (ref, position) => {
      const hit = this.refs.get(ref);
      if (!hit) return null;
      return position === "story" ? (hit.storyId ?? hit.id) : hit.id;
    });
    if (hasUnrewritableRef(out)) {
      // The reference is still pending: only a flush can give it a
      // real id in a position the engine leaves alone.
      await this.flush();
      out = rewriteRefs(out, (ref, position) => {
        const hit = this.refs.get(ref);
        if (!hit) {
          throw new Error(
            `${op} references ${ref}, which nothing in this session minted`,
          );
        }
        return position === "story" ? (hit.storyId ?? hit.id) : hit.id;
      });
    }
    return out;
  }

  /**
   * `setElementProperty`, with both halves in the shapes the wire
   * actually wants.
   *
   * `id` is `unknown`, not `string`, because `ElementId` is not a
   * uniform `{kind, id: string}` pair: a `storyRange` carries a STRUCT
   * (`{story_id, start, end}`) and a `tableCell` another one. Passing
   * the pretty `story@start..end` form the id grammar prints is
   * refused as a malformed message — the grammar is for addressing in
   * SCRIPTS, not on this door. {@link storyRangeId} builds the right
   * one.
   *
   * `value` must be an adjacently-tagged `Value` — `{type: "colorRef",
   * value: …}`, `{type: "text", value: …}` — never a bare string.
   */
  async setProperty(
    kind: string,
    id: unknown,
    path: string,
    value: unknown,
  ): Promise<void> {
    await this.mutate("setElementProperty", {
      elementId: { kind, id },
      path,
      value,
    });
  }

  /** The `storyRange` ElementId payload: a struct, not the printed
   *  `Story/u1@0..10` form. */
  storyRangeId(storyId: string, start: number, end: number) {
    return { story_id: storyId, start, end };
  }

  // ── named lookups (never positional) ────────────────────────────

  /**
   * Named collections (styles, swatches, conditions, gradients,
   * layers), CACHED for the life of the queue.
   *
   * `proseFrame` asks for a paragraph style per paragraph and a layer
   * per frame; each ask was a page round trip, and in deferred mode a
   * read also flushes the batch it is standing in — so an uncached
   * lookup would take the batching apart from the inside. The cache is
   * dropped whenever an op that can change one of these collections is
   * sent ({@link COLLECTION_WRITERS}).
   */
  private collectionCache = new Map<string, NamedItem[]>();

  private async collectionByName(
    collection: string,
    name: string,
  ): Promise<string> {
    await this.flush();
    let items = this.collectionCache.get(collection);
    if (items === undefined) {
      items = (await this.designer.collection(
        collection,
      )) as unknown as NamedItem[];
      this.collectionCache.set(collection, items);
    }
    const hit = items.find((i) => i.name === name);
    if (!hit) {
      throw new Error(
        `${collection} has no entry named ${JSON.stringify(name)} — ` +
          `have [${items.map((i) => i.name ?? "?").join(", ")}]. ` +
          `The base fixture drifted; fix it rather than taking an index.`,
      );
    }
    return hit.selfId;
  }

  paragraphStyle(name: string): Promise<string> {
    return this.collectionByName("paragraphStyles", name);
  }

  characterStyle(name: string): Promise<string> {
    return this.collectionByName("characterStyles", name);
  }

  swatch(name: string): Promise<string> {
    return this.collectionByName("swatches", name);
  }

  /** Condition SELF-ID by user-visible name. The wire's condition ops
   *  and the `appliedConditions` value both key the styles map by
   *  self-id (`Condition/Draft`), not by display name — passing the
   *  name is refused as "entry not found". */
  condition(name: string): Promise<string> {
    return this.collectionByName("conditions", name);
  }

  conditionSet(name: string): Promise<string> {
    return this.collectionByName("conditionSets", name);
  }

  gradient(name: string): Promise<string> {
    return this.collectionByName("gradients", name);
  }

  async layerId(name: string): Promise<string> {
    let layers = this.collectionCache.get("layers");
    if (layers === undefined) {
      await this.flush();
      layers = (await this.designer.layers()) as unknown as NamedItem[];
      this.collectionCache.set("layers", layers);
    }
    const hit = layers.find((l) => (l as { name?: string }).name === name);
    if (!hit) {
      throw new Error(
        `no layer named ${JSON.stringify(name)} — have ` +
          `[${layers.map((l) => (l as { name?: string }).name ?? "?").join(", ")}]`,
      );
    }
    return hit.selfId;
  }

  // ── authoring ───────────────────────────────────────────────────

  /** A text frame on `pageId`; returns its element id. */
  /**
   * Geometry helpers take page-space `(x0, y0, x1, y1)` — the order a
   * layout sketch reads in — and convert to the WIRE's IDML order
   * `[top, left, bottom, right]` here, once. This seam exists because
   * the annual shipped its whole front matter transposed and the
   * change-only pixel gate stayed green: a heading exported as a 52 pt
   * vertical sliver at x 54..106 and nothing said so. Raw `Bounds`
   * VALUES (e.g. a `frameBounds` write) remain wire-ordered — the
   * conversion belongs to these helpers only.
   */
  private static toWire(bounds: Bounds): Bounds {
    const [x0, y0, x1, y1] = bounds;
    return [y0, x0, y1, x1];
  }

  async textFrame(pageId: string, bounds: Bounds): Promise<string> {
    const id = await this.mutateId("insertTextFrame", {
      pageId,
      bounds: ShowcaseDoc.toWire(bounds),
    });
    // `storyOf` hit-tests the built page for the story a frame owns.
    // A QUEUED frame is not on any built page yet, so remember which
    // handle covers this box and answer from that instead.
    if (id.startsWith(HANDLE_PREFIX)) {
      this.framesByBox.set(boxKey(pageId, bounds), id);
    }
    return id;
  }

  async rectangle(pageId: string, bounds: Bounds): Promise<string> {
    return this.mutateId("insertFrame", {
      pageId,
      bounds: ShowcaseDoc.toWire(bounds),
    });
  }

  async oval(pageId: string, bounds: Bounds): Promise<string> {
    return this.mutateId("insertOval", {
      pageId,
      bounds: ShowcaseDoc.toWire(bounds),
    });
  }

  /**
   * The story a text frame owns. There is no frame→story read door on
   * the wire, so this recovers it the way paged.sheet and paged.doc do:
   * a hit test at the frame's centre. Both of those plugins learned it
   * the same way, and duplicating the trick here keeps the showcase on
   * the same footing as the shipping code rather than inventing a
   * private door.
   */
  async storyOf(pageId: string, bounds: Bounds): Promise<string> {
    // A frame queued in this batch owns a story the engine has not
    // minted yet. Its handle addresses that story in every `storyId`
    // position (the engine's own rule 2), so hand the handle back and
    // let the batch resolve it.
    const queued = this.framesByBox.get(boxKey(pageId, bounds));
    if (queued !== undefined) {
      const resolved = this.refs.get(queued);
      if (resolved?.storyId) return resolved.storyId;
      if (!resolved) return queued;
    }
    await this.flush();
    // Same (x0, y0, x1, y1) contract as the insert helpers above.
    const [left, top, right, bottom] = bounds;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const storyId = await this.page.evaluate(
      async ({ pageId, cx, cy }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                send: (m: unknown) => Promise<{
                  kind: string;
                  payload: { storyId?: string | null };
                }>;
              };
            };
          }
        ).__canvas;
        const reply = await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [cx, cy], filter: "text" },
        });
        return reply.payload.storyId ?? null;
      },
      { pageId, cx, cy },
    );
    if (!storyId) {
      throw new Error(
        `no story under (${cx}, ${cy}) on ${pageId} — the frame is not ` +
          `where the caller thinks it is`,
      );
    }
    return storyId;
  }

  /** Pour text into a story at `offset` (default: append at 0). */
  async insertText(storyId: string, text: string, offset = 0): Promise<void> {
    await this.mutate("insertText", { storyId, offset, text });
  }

  /** Apply a named paragraph or character style to a story range. */
  async applyStyle(
    storyId: string,
    start: number,
    end: number,
    styleId: string,
    scope: "paragraph" | "character",
  ): Promise<void> {
    await this.mutate("applyStyle", {
      storyId,
      start,
      end,
      style: styleId,
      scope,
    });
  }

  /** Thread `from` into `to` so one story flows across both frames. */
  async linkFrames(from: string, to: string): Promise<void> {
    await this.mutate("linkFrames", { from, to });
  }

  /**
   * C-35 (protocol 62) — put a page item on a layer. Before v62 this
   * was inexpressible and items could only be BORN onto a layer by a
   * generated fixture; the showcase's layers page is the first
   * document to author it live.
   */
  async assignLayer(kind: string, id: string, layerId: string): Promise<void> {
    // `Value` is an adjacently-tagged enum on the wire, so a bare
    // string is rejected as a malformed message rather than coerced —
    // the empty string is how `itemLayer` clears to the default layer,
    // and it has to arrive tagged too.
    await this.setProperty(kind, id, "itemLayer", {
      type: "text",
      value: layerId,
    });
  }

  async storyChars(storyId: string): Promise<number> {
    await this.flush();
    return this.designer.storyChars(this.resolveStory(storyId));
  }

  // ── output ──────────────────────────────────────────────────────

  /** The `.paged` container bytes for the document as it stands. */
  /**
   * `exportIdml`, but reading BOTH halves of the wire reply. The typed
   * `client.exportIdml()` returns only the bytes and discards
   * `payload.lost` — the v58/C-28 honest-loss ledger (opacity masks and
   * every other `.paged`-native construct IDML cannot carry). The
   * assembly spec asserts that list EQUALS the expected loss set, so a
   * new silent loss fails the build instead of vanishing.
   */
  async exportIdmlWithLost(): Promise<{ bytes: Buffer; lost: string[] }> {
    await this.flush();
    const out = await this.page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              send: (m: unknown) => Promise<{
                kind: string;
                payload?: { idmlBytes?: number[]; lost?: string[]; error?: string };
              }>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.send({ kind: "exportIdml", payload: {} });
      if (reply.kind !== "idmlExported") {
        throw new Error(
          `exportIdml failed: ${reply.payload?.error ?? reply.kind}`,
        );
      }
      const bytes = new Uint8Array(reply.payload?.idmlBytes ?? []);
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return { b64: btoa(s), lost: reply.payload?.lost ?? [] };
    });
    return { bytes: Buffer.from(out.b64, "base64"), lost: out.lost };
  }

  /**
   * Register the annual's font palette with the engine, from the core
   * checkout's `corpus/fonts/`. Fonts reach the page via a routed
   * fetch (`/__annual-fonts/*`) rather than an `evaluate` argument —
   * serialising a 9.6 MB CJK face through CDP as a JSON number array
   * is the kind of cost you pay once per chapter, sixteen times.
   *
   * Every load starts from the engine's default font, so this must run
   * after EVERY `load()` — registration does not survive a reload.
   */
  async registerFonts(fontsDir: string): Promise<void> {
    const faces: Array<{ family: string; style: string | null; file: string }> =
      [
        { family: "Inter", style: null, file: "Inter.ttf" },
        { family: "Open Sans", style: null, file: "OpenSans.ttf" },
        { family: "Open Sans", style: "Italic", file: "OpenSans-Italic.ttf" },
        { family: "Source Serif 4", style: null, file: "SourceSerif4.ttf" },
        { family: "EB Garamond", style: null, file: "EBGaramond-VF.ttf" },
        {
          family: "EB Garamond",
          style: "Italic",
          file: "EBGaramond-Italic-VF.ttf",
        },
        { family: "Fraunces", style: null, file: "Fraunces-VF.ttf" },
        {
          family: "Fraunces",
          style: "Italic",
          file: "Fraunces-Italic-VF.ttf",
        },
        { family: "JetBrains Mono", style: null, file: "JetBrainsMono-VF.ttf" },
        {
          family: "JetBrains Mono",
          style: "Italic",
          file: "JetBrainsMono-Italic-VF.ttf",
        },
        { family: "Space Grotesk", style: null, file: "SpaceGrotesk-VF.ttf" },
        {
          family: "Noto Sans Arabic",
          style: null,
          file: "NotoSansArabic-VF.ttf",
        },
        { family: "Noto Sans JP", style: null, file: "NotoSansJP-VF.ttf" },
      ];
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const present = faces.filter((f) => existsSync(join(fontsDir, f.file)));
    await this.page.route("**/__annual-fonts/*", (route) => {
      const name = route.request().url().split("/__annual-fonts/")[1];
      const face = present.find((f) => f.file === decodeURIComponent(name));
      if (!face) return route.fulfill({ status: 404 });
      return route.fulfill({
        status: 200,
        contentType: "font/ttf",
        body: readFileSync(join(fontsDir, face.file)),
      });
    });
    try {
      await this.page.evaluate(
        async (list) => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                client: {
                  registerFont: (
                    family: string,
                    bytes: Uint8Array,
                    style: string | null,
                  ) => Promise<void>;
                };
              };
            }
          ).__canvas;
          for (const f of list) {
            const res = await fetch(
              `/__annual-fonts/${encodeURIComponent(f.file)}`,
            );
            if (!res.ok) throw new Error(`font fetch failed: ${f.file}`);
            const bytes = new Uint8Array(await res.arrayBuffer());
            await c.client.registerFont(f.family, bytes, f.style);
          }
        },
        present.map(({ family, style, file }) => ({ family, style, file })),
      );
    } finally {
      await this.page.unroute("**/__annual-fonts/*");
    }
  }

  async exportPaged(): Promise<Buffer> {
    await this.flush();
    const b64 = await this.page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { exportPaged: () => Promise<Uint8Array> } };
        }
      ).__canvas;
      const bytes = await c.client.exportPaged();
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    return Buffer.from(b64, "base64");
  }

  async exportIdml(): Promise<Buffer> {
    await this.flush();
    const b64 = await this.page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { exportIdml: () => Promise<Uint8Array> } };
        }
      ).__canvas;
      const bytes = await c.client.exportIdml();
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    return Buffer.from(b64, "base64");
  }

  /**
   * Render one page to PNG bytes (the deterministic CPU snapshot).
   *
   * Same snapshot door as `Designer.renderBytes`, but the page list is
   * taken from `paged.pages()` (the engine) rather than from the React
   * shell's `__canvas.handle`. The showcase authors pages structurally,
   * and the engine's list is the one that is always current; dpi is
   * derived per page so a mixed-size document still renders each page
   * at the requested pixel width.
   */
  async renderPage(pageIndex: number, widthPx = 1024): Promise<Buffer> {
    await this.flush();
    const all = await this.pages();
    const info = all[pageIndex];
    if (!info) {
      throw new Error(`no page at index ${pageIndex} (have ${all.length})`);
    }
    const dpi = (widthPx * 72) / info.sizePt[0];
    const arr = await this.page.evaluate(
      async ({ pageId, widthPx, dpi }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                requestSnapshot: (
                  id: string,
                  w: number,
                  d: number,
                ) => Promise<{ pngBytes: Uint8Array }>;
              };
            };
          }
        ).__canvas;
        const snap = await c.client.requestSnapshot(pageId, widthPx, dpi);
        return Array.from(snap.pngBytes);
      },
      { pageId: info.selfId, widthPx, dpi },
    );
    return Buffer.from(Uint8Array.from(arr));
  }

  /**
   * Is a real WebGPU adapter attached? paged.image's kernels need one.
   *
   * WAITS for the answer rather than sampling it. `gpuActive` is `null`
   * until the worker's `attachReady` lands, and `null` reads as "no GPU"
   * — so a plain read taken moments after the document loads reports a
   * CPU lane on a GPU machine. Settling on `true`/`false` turns a race
   * into an answer; the timeout falls through to whatever is there,
   * which on a genuinely adapter-less lane is the honest `null`.
   */
  async gpuActive(): Promise<boolean> {
    await this.flush();
    await this.page
      .waitForFunction(
        () => {
          const v = (
            globalThis as unknown as { __canvas?: { gpuActive?: unknown } }
          ).__canvas?.gpuActive;
          return v === true || v === false;
        },
        null,
        { timeout: 30_000 },
      )
      .catch(() => undefined);
    return this.designer.gpuActive();
  }

  /**
   * Why there is no GPU, measured — not guessed.
   *
   * "No adapter on this lane" was the story the showcase told for its
   * whole first life, and it was wrong: the browser had an adapter and
   * the editor had never attached a canvas. So when the answer is "no
   * GPU", ask the browser directly and say which of the two it is. Only
   * called on the degrade path, so it costs nothing on a green run.
   */
  async gpuReason(): Promise<string> {
    const probe = await this.page.evaluate(async () => {
      // Typed structurally: the showcase tsconfig has no WebGPU lib.
      const nav = navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<unknown> };
      };
      const flag = (
        globalThis as unknown as { __canvas?: { gpuActive?: unknown } }
      ).__canvas?.gpuActive;
      if (!nav.gpu) return { flag, adapter: false, why: "navigator.gpu absent" };
      try {
        const a = await nav.gpu.requestAdapter();
        return {
          flag,
          adapter: !!a,
          why: a ? "requestAdapter() resolved" : "requestAdapter() -> null",
        };
      } catch (e) {
        return { flag, adapter: false, why: `requestAdapter() threw: ${String(e)}` };
      }
    });
    if (!probe.adapter) {
      return (
        `this browser has no WebGPU adapter (${probe.why}) — an environment ` +
        `limit, not a product defect`
      );
    }
    return (
      `the BROWSER has a WebGPU adapter (${probe.why}) but the editor's ` +
      `renderer never attached one (__canvas.gpuActive=${String(probe.flag)}). ` +
      `That is ours: the viewport must mount (a real document open through ` +
      `the shell) before the worker runs initGpu`
    );
  }

  /** Invoke a command exactly as a menu, palette or shortcut would. */
  async runCommand(id: string): Promise<void> {
    // A command runs against the document the editor HOLDS, so the
    // queue has to have landed before it does.
    await this.flush();
    return this.designer.runCommand(id);
  }

  async select(kind: string, id: string): Promise<void> {
    await this.flush();
    await this.designer.selectElement(kind, this.resolve(id));
  }

  /** Poll until the page's rendered bytes differ from `before`. The
   *  single-sample form flakes cold — see the journey render-flake
   *  note; always poll. */
  async expectRenderChanged(pageIndex: number, before: Buffer): Promise<void> {
    await this.flush();
    await expect
      .poll(
        async () => {
          const after = await this.renderPage(pageIndex);
          return after.equals(before) ? 0 : 1;
        },
        { message: `page ${pageIndex} never repainted`, timeout: 15_000 },
      )
      .toBe(1);
  }
}
