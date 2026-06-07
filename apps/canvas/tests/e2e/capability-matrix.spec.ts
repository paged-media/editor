// E2E op suite — the capability matrix. Probes EVERY wire Mutation
// op against a live document with minimal valid args, classifies
// the outcome (supported / unsupported), and asserts the
// classification matches the checked-in table
// (harness/capabilities.ts). Engine support changing in EITHER
// direction fails here with instructions: update the table AND
// add/upgrade the real domain test.
//
// Edit/delete/rename/property probes create their OWN scratch
// resource first (setupUndo cleans it up on BOTH paths), so the
// classification reflects the engine — never whether the fixture
// happened to hold a deletable swatch or a non-builtin style.
//
// Capture mode: `E2E_CAPS=capture npx playwright test
// e2e/capability-matrix` prints the observed table (and writes
// /tmp/paged-e2e-capabilities.json) instead of asserting.

import { writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  CAPABILITIES,
  expectedStatus,
  type CapabilityStatus,
} from "./harness/capabilities";
import { loadFixture, type LoadedFixture } from "./harness/fixtures";

const CAPTURE = process.env.E2E_CAPS === "capture";

interface ProbeResult {
  op: string;
  status: CapabilityStatus;
  error?: string;
  skipped?: string;
}

interface Ctx {
  page: Page;
  fx: LoadedFixture;
}

/** Run one mutation; resolve {ok} or {error string}. `mutate()`
 *  RESOLVES with the reply envelope on failure (it never throws) —
 *  a rejected op comes back as `{kind:"mutationFailed", payload:
 *  {error}}`, a successful one as `mutationApplied`. So classify by
 *  the reply kind, not by a thrown error. */
async function tryMutate(
  page: Page,
  m: unknown,
): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(async (mm) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            mutate: (
              x: unknown,
            ) => Promise<{ kind: string; payload?: { error?: unknown } }>;
          };
        };
      }
    ).__canvas;
    try {
      const reply = await c.client.mutate(mm);
      if (reply?.kind === "mutationApplied") return { ok: true };
      const err = reply?.payload?.error;
      const errStr =
        err == null
          ? `reply kind: ${reply?.kind}`
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      return { ok: false, error: errStr.slice(0, 300) };
    } catch (err) {
      return {
        ok: false,
        error: `threw: ${err instanceof Error ? err.message : JSON.stringify(err).slice(0, 280)}`,
      };
    }
  }, m);
}

async function undoN(page: Page, n: number): Promise<void> {
  if (n <= 0) return;
  await page.evaluate(async (count) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas;
    for (let i = 0; i < count; i++) await c.client.undo();
  }, n);
}

async function lastCollectionId(
  page: Page,
  name: string,
): Promise<string | null> {
  return page.evaluate(async (n) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<Array<{ selfId: string }>>;
          };
        };
      }
    ).__canvas;
    const items = await c.client.collection(n);
    return items[items.length - 1]?.selfId ?? null;
  }, name);
}

async function firstLayerId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { layers: () => Promise<Array<{ selfId: string }>> };
        };
      }
    ).__canvas;
    const layers = await c.client.layers();
    return layers[0]?.selfId ?? null;
  });
}

const RGB_SPEC = (selfId: string | null, name: string) => ({
  selfId,
  name,
  space: "RGB",
  value: [10, 120, 220],
  model: "Process",
  alternateSpace: null,
  alternateValue: [],
  tint: null,
  alpha: null,
});

/** Create a scratch swatch; return its id (or null if create failed). */
async function newSwatch(page: Page): Promise<string | null> {
  const r = await tryMutate(page, {
    op: "createSwatch",
    args: { spec: RGB_SPEC(null, "scratch swatch") },
  });
  return r.ok ? lastCollectionId(page, "swatches") : null;
}

/** Create a scratch gradient (referencing any existing swatch). */
async function newGradient(page: Page): Promise<string | null> {
  const sw = await lastCollectionId(page, "swatches");
  if (!sw) return null;
  const r = await tryMutate(page, {
    op: "createGradient",
    args: {
      spec: {
        selfId: null,
        name: "scratch gradient",
        kind: "Linear",
        stops: [
          { stopColor: sw, locationPct: 0, midpointPct: null },
          { stopColor: sw, locationPct: 100, midpointPct: null },
        ],
      },
    },
  });
  return r.ok ? lastCollectionId(page, "gradients") : null;
}

/** Insert a scratch layer; return its id (generated fixtures expose
 *  no document layer, so set/move/remove probes target this). */
async function newLayer(page: Page): Promise<string | null> {
  const r = await tryMutate(page, {
    op: "layerInsert",
    args: { position: 0, name: "scratch layer" },
  });
  return r.ok ? firstLayerId(page) : null;
}

/** Create a scratch spot swatch (registers a spot ink); return the
 *  first ink's id, or null if the engine doesn't surface one. */
async function newSpotInk(page: Page): Promise<string | null> {
  const r = await tryMutate(page, {
    op: "createSwatch",
    args: {
      spec: {
        selfId: null,
        name: "PANTONE probe",
        space: "CMYK",
        value: [0, 100, 100, 0],
        model: "Spot",
        alternateSpace: "CMYK",
        alternateValue: [0, 100, 100, 0],
        tint: null,
        alpha: null,
      },
    },
  });
  if (!r.ok) return null;
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<Array<{ selfId: string }>>;
          };
        };
      }
    ).__canvas;
    try {
      // InkSummary keys the spot colour as `spotId`, not `selfId`.
      const inks = (await c.client.collection("inks")) as unknown as Array<{
        spotId: string;
      }>;
      return inks[inks.length - 1]?.spotId ?? null;
    } catch {
      return null;
    }
  });
}

async function newColorGroup(page: Page): Promise<string | null> {
  const r = await tryMutate(page, {
    op: "createColorGroup",
    args: { spec: { selfId: null, name: "scratch group", members: [] } },
  });
  return r.ok ? lastCollectionId(page, "colorGroups") : null;
}

const STYLE_COLLECTION: Record<string, string> = {
  Paragraph: "paragraphStyles",
  Character: "characterStyles",
  Object: "objectStyles",
  Cell: "cellStyles",
  Table: "tableStyles",
};

async function newStyle(page: Page, kind: string): Promise<string | null> {
  const r = await tryMutate(page, {
    op: `create${kind}Style`,
    args: { name: `scratch ${kind.toLowerCase()}` },
  });
  return r.ok ? lastCollectionId(page, STYLE_COLLECTION[kind]) : null;
}

/** Valid one-loose-colour ASE ("P", RGB 0.5/0.5/0.5, process) — the
 *  byte layout `paged_color::ase::write_ase` emits. An EMPTY ASE
 *  yields zero ops and the import translates to `None` (→ falsely
 *  "unsupported"); one real swatch exercises the supported path. */
function oneColorAseBytes(): number[] {
  return [
    0x41,
    0x53,
    0x45,
    0x46, // "ASEF"
    0x00,
    0x01,
    0x00,
    0x00, // version 1.0
    0x00,
    0x00,
    0x00,
    0x01, // 1 block
    0x00,
    0x01, // block type: colour
    0x00,
    0x00,
    0x00,
    0x18, // block length = 24
    0x00,
    0x02, // name length 2 (incl. null)
    0x00,
    0x50,
    0x00,
    0x00, // "P\0" UTF-16BE
    0x52,
    0x47,
    0x42,
    0x20, // "RGB "
    0x3f,
    0x00,
    0x00,
    0x00, // 0.5
    0x3f,
    0x00,
    0x00,
    0x00, // 0.5
    0x3f,
    0x00,
    0x00,
    0x00, // 0.5
    0x00,
    0x02, // colour type: process
  ];
}

const ANCHOR = (x: number, y: number) => ({
  anchor: [x, y] as [number, number],
  left: [x, y] as [number, number],
  right: [x, y] as [number, number],
});

/** Insert a scratch 4-anchor closed path on a page; return its
 *  created ElementId. Path-point ops need a real path node — the
 *  generated geometry fixture exposes only rectangles, which the
 *  point resolver rejects ("node not found"). */
async function newPath(
  page: Page,
  pageId: string,
): Promise<{ kind: string; id: string } | null> {
  return page.evaluate(async (pid) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            mutate: (m: unknown) => Promise<{
              kind: string;
              payload?: { createdId?: { kind: string; id: string } | null };
            }>;
          };
        };
      }
    ).__canvas;
    const a = (x: number, y: number) => ({
      anchor: [x, y],
      left: [x, y],
      right: [x, y],
    });
    const reply = await c.client.mutate({
      op: "insertPath",
      args: {
        pageId: pid,
        anchors: [a(20, 20), a(120, 20), a(120, 120), a(20, 120)],
        open: false,
      },
    });
    return reply.kind === "mutationApplied"
      ? (reply.payload?.createdId ?? null)
      : null;
  }, pageId);
}

/** Sweep the loaded fixture's first page for a table cell, returning
 *  `{ storyId, tableId, row, col }` from `HitResult.tableContext` — the
 *  table ops address the cell by story + table id + index. Null when no
 *  cell is found (the fixture carries no table). */
async function firstTableCell(
  page: Page,
  pageId: string,
  widthPt: number,
  heightPt: number,
): Promise<{
  storyId: string;
  tableId: string;
  row: number;
  col: number;
} | null> {
  return page.evaluate(
    async ({ pageId, widthPt, heightPt }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              send: (m: unknown) => Promise<{
                kind: string;
                payload?: {
                  storyId?: string | null;
                  tableContext?: {
                    tableId: string;
                    row: number;
                    col: number;
                  } | null;
                };
              }>;
            };
          };
        }
      ).__canvas;
      for (let gy = 0.04; gy < 0.97; gy += 0.04) {
        for (let gx = 0.04; gx < 0.97; gx += 0.04) {
          const reply = await c.client.send({
            kind: "hitTest",
            payload: {
              pageId,
              docPoint: [widthPt * gx, heightPt * gy],
              filter: "any",
            },
          });
          const p = reply.payload;
          if (reply.kind === "hitResult" && p?.tableContext && p.storyId) {
            return {
              storyId: p.storyId,
              tableId: p.tableContext.tableId,
              row: p.tableContext.row,
              col: p.tableContext.col,
            };
          }
        }
      }
      return null;
    },
    { pageId, widthPt, heightPt },
  );
}

/** A probe: build the mutation (null = prerequisites missing → skip).
 *  setupUndo = undo steps to ALWAYS apply afterward (cleans up
 *  whatever build() created); undo = ADDITIONAL steps on success (the
 *  probe op's own reversal, default 1). */
interface Probe {
  op: string;
  build: (ctx: Ctx) => Promise<unknown | null>;
  setupUndo?: number;
  undo?: number;
}

// ── probes on the `text` fixture ────────────────────────────────
const TEXT_PROBES: Probe[] = [
  {
    op: "insertText",
    build: async ({ fx }) =>
      fx.firstStory
        ? {
            op: "insertText",
            args: { storyId: fx.firstStory.selfId, offset: 0, text: "X" },
          }
        : null,
  },
  {
    op: "deleteRange",
    build: async ({ fx }) =>
      fx.firstStory && fx.firstStory.characterCount > 1
        ? {
            op: "deleteRange",
            args: { storyId: fx.firstStory.selfId, start: 0, end: 1 },
          }
        : null,
  },
  {
    op: "applyStyle",
    build: async ({ page, fx }) => {
      // v28 shape: a named style ref + scope (range attributes go
      // through setElementProperty / the splitters instead).
      const style = await lastCollectionId(page, "paragraphStyles");
      return fx.firstStory && style
        ? {
            op: "applyStyle",
            args: {
              storyId: fx.firstStory.selfId,
              start: 0,
              end: 1,
              style,
              scope: "paragraph",
            },
          }
        : null;
    },
  },
  {
    op: "insertField",
    build: async ({ fx }) =>
      fx.firstStory
        ? {
            op: "insertField",
            args: {
              storyId: fx.firstStory.selfId,
              offset: 0,
              field: "pageNumber",
            },
          }
        : null,
  },
  {
    op: "moveFrame",
    build: async ({ fx }) =>
      fx.firstTextFrame
        ? {
            op: "moveFrame",
            args: {
              frameId: fx.firstTextFrame.id,
              transform: [1, 0, 0, 1, 4, 4],
            },
          }
        : null,
  },
  {
    op: "resizeFrame",
    build: async ({ fx }) =>
      fx.firstTextFrame
        ? {
            op: "resizeFrame",
            args: { frameId: fx.firstTextFrame.id, bounds: [0, 0, 180, 120] },
          }
        : null,
  },
  {
    op: "linkFrames",
    build: async ({ page, fx }) => {
      // v28 semantics: `to` must be an EMPTY frame — insert a scratch
      // text frame to thread into (setupUndo rolls it back).
      const from = fx.frames.find((f) => f.ref.kind === "textFrame");
      if (!from) return null;
      const createdId = await page.evaluate(async (pageId) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                mutate: (x: unknown) => Promise<{
                  kind: string;
                  payload?: { createdId?: unknown };
                }>;
              };
            };
          }
        ).__canvas;
        // Threading requires an EMPTY TEXT frame target (v28
        // insertTextFrame; a rectangle is not linkable).
        const reply = await c.client.mutate({
          op: "insertTextFrame",
          args: { pageId, bounds: [400, 400, 520, 480] },
        });
        if (reply?.kind !== "mutationApplied") return null;
        // createdId is an ElementId object ({kind, id}); the wire
        // wants the bare id string.
        const created = reply.payload?.createdId as
          | { id?: string }
          | string
          | null
          | undefined;
        return typeof created === "string" ? created : (created?.id ?? null);
      }, fx.pages[0].pageId);
      return createdId
        ? {
            op: "linkFrames",
            args: { from: from.ref.id, to: createdId },
          }
        : null;
    },
    setupUndo: 1, // the scratch frame
  },
  {
    op: "unlinkFrames",
    build: async ({ fx }) =>
      fx.firstTextFrame
        ? {
            op: "unlinkFrames",
            args: { frame: fx.firstTextFrame.id },
          }
        : null,
  },
  {
    op: "insertPage",
    build: async () => ({
      op: "insertPage",
      args: { afterPageId: null, masterId: null },
    }),
  },
  {
    op: "deletePage",
    build: async ({ fx }) =>
      fx.pageCount > 1
        ? {
            op: "deletePage",
            args: { pageId: fx.pages[fx.pageCount - 1].pageId },
          }
        : null,
  },
  {
    op: "resizePage",
    build: async ({ fx }) => ({
      op: "resizePage",
      args: { pageId: fx.pages[0].pageId, bounds: [0, 0, 700, 900] },
    }),
  },
  {
    op: "insertFrame",
    build: async ({ fx }) => ({
      op: "insertFrame",
      args: { pageId: fx.pages[0].pageId, bounds: [10, 10, 80, 80] },
    }),
  },
  {
    op: "deleteFrame",
    build: async ({ fx }) => {
      // Scratch frame so deletion is always legal and reversible.
      const rect = fx.frames.find((f) => f.ref.kind === "rectangle");
      const any = rect ?? fx.frames[fx.frames.length - 1];
      return any ? { op: "deleteFrame", args: { frameId: any.ref.id } } : null;
    },
  },
  {
    op: "insertLine",
    build: async ({ fx }) => ({
      op: "insertLine",
      args: { pageId: fx.pages[0].pageId, start: [10, 10], end: [120, 120] },
    }),
  },
  {
    op: "insertPath",
    build: async ({ fx }) => ({
      op: "insertPath",
      args: {
        pageId: fx.pages[0].pageId,
        anchors: [ANCHOR(20, 20), ANCHOR(120, 30), ANCHOR(70, 120)],
        open: false,
      },
    }),
  },
  {
    op: "setDocumentDefaults",
    build: async () => ({
      op: "setDocumentDefaults",
      args: { fillColor: null, strokeColor: null, strokeWeight: 2 },
    }),
  },
  {
    op: "setColorSettings",
    build: async () => ({
      op: "setColorSettings",
      args: { cmykProfileName: null, rgbPolicy: null, intent: null, bpc: true },
    }),
  },
  {
    op: "setProofSetup",
    build: async () => ({
      op: "setProofSetup",
      args: { profileName: null, intent: null },
    }),
  },
  {
    op: "importSwatchLibrary",
    build: async () => ({
      op: "importSwatchLibrary",
      args: { bytes: oneColorAseBytes(), groupName: "probe" },
    }),
  },
  {
    op: "setInkSetting",
    build: async ({ page }) => {
      const spotId = await newSpotInk(page);
      return spotId
        ? { op: "setInkSetting", args: { spotId, convertToProcess: true } }
        : null;
    },
    setupUndo: 1, // the scratch spot swatch
  },
  {
    op: "setUseStandardLabForSpots",
    build: async () => ({
      op: "setUseStandardLabForSpots",
      args: { enabled: true },
    }),
  },
  {
    op: "batch",
    build: async ({ fx }) =>
      fx.firstTextFrame
        ? {
            op: "batch",
            args: {
              ops: [
                {
                  op: "setElementProperty",
                  args: {
                    elementId: fx.firstTextFrame,
                    path: "frameOpacity",
                    value: { type: "length", value: 70 },
                  },
                },
              ],
            },
          }
        : null,
  },
  {
    op: "setElementProperty",
    build: async ({ fx }) =>
      fx.firstTextFrame
        ? {
            op: "setElementProperty",
            args: {
              elementId: fx.firstTextFrame,
              path: "frameOpacity",
              value: { type: "length", value: 55 },
            },
          }
        : null,
  },
  // ── layers (each set/move/remove targets a scratch layer, since
  //    generated fixtures report no document layer) ───────────────
  {
    op: "layerInsert",
    build: async () => ({
      op: "layerInsert",
      args: { position: 0, name: "probe layer" },
    }),
  },
  {
    op: "layerSetVisible",
    build: async ({ page }) => {
      const id = await newLayer(page);
      return id
        ? { op: "layerSetVisible", args: { layerId: id, visible: false } }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "layerSetLocked",
    build: async ({ page }) => {
      const id = await newLayer(page);
      return id
        ? { op: "layerSetLocked", args: { layerId: id, locked: true } }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "layerSetPrintable",
    build: async ({ page }) => {
      const id = await newLayer(page);
      return id
        ? { op: "layerSetPrintable", args: { layerId: id, printable: false } }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "layerSetName",
    build: async ({ page }) => {
      const id = await newLayer(page);
      return id
        ? { op: "layerSetName", args: { layerId: id, name: "probe renamed" } }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "layerMove",
    build: async ({ page }) => {
      const id = await newLayer(page);
      return id
        ? { op: "layerMove", args: { layerId: id, newIndex: 0 } }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "layerRemove",
    build: async ({ page }) => {
      const id = await newLayer(page);
      return id ? { op: "layerRemove", args: { layerId: id } } : null;
    },
    setupUndo: 1, // the scratch layerInsert (undone alongside on success)
  },
  // ── colour resources ──────────────────────────────────────────
  {
    op: "createSwatch",
    build: async () => ({
      op: "createSwatch",
      args: { spec: RGB_SPEC(null, "probe swatch") },
    }),
  },
  {
    op: "editSwatch",
    build: async ({ page }) => {
      const id = await newSwatch(page);
      return id
        ? {
            op: "editSwatch",
            args: { swatchId: id, spec: RGB_SPEC(id, "probe swatch 2") },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "deleteSwatch",
    build: async ({ page }) => {
      const id = await newSwatch(page);
      return id ? { op: "deleteSwatch", args: { swatchId: id } } : null;
    },
    setupUndo: 1,
  },
  {
    op: "createGradient",
    build: async ({ page }) => {
      const sw = await lastCollectionId(page, "swatches");
      return sw
        ? {
            op: "createGradient",
            args: {
              spec: {
                selfId: null,
                name: "probe gradient",
                kind: "Linear",
                stops: [
                  { stopColor: sw, locationPct: 0, midpointPct: null },
                  { stopColor: sw, locationPct: 100, midpointPct: null },
                ],
              },
            },
          }
        : null;
    },
  },
  {
    op: "editGradient",
    build: async ({ page }) => {
      const id = await newGradient(page);
      const sw = await lastCollectionId(page, "swatches");
      return id && sw
        ? {
            op: "editGradient",
            args: {
              gradientId: id,
              spec: {
                selfId: id,
                name: "probe gradient 2",
                kind: "Radial",
                stops: [
                  { stopColor: sw, locationPct: 0, midpointPct: null },
                  { stopColor: sw, locationPct: 100, midpointPct: null },
                ],
              },
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "deleteGradient",
    build: async ({ page }) => {
      const id = await newGradient(page);
      return id ? { op: "deleteGradient", args: { gradientId: id } } : null;
    },
    setupUndo: 1,
  },
  {
    op: "createColorGroup",
    build: async () => ({
      op: "createColorGroup",
      args: { spec: { selfId: null, name: "probe group", members: [] } },
    }),
  },
  {
    op: "editColorGroup",
    build: async ({ page }) => {
      const id = await newColorGroup(page);
      return id
        ? {
            op: "editColorGroup",
            args: {
              groupId: id,
              spec: { selfId: id, name: "probe group 2", members: [] },
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "deleteColorGroup",
    build: async ({ page }) => {
      const id = await newColorGroup(page);
      return id ? { op: "deleteColorGroup", args: { groupId: id } } : null;
    },
    setupUndo: 1,
  },
  // ── styles ×5 (create / rename / delete, each self-contained) ──
  ...(["Paragraph", "Character", "Object", "Cell", "Table"] as const).flatMap(
    (kind): Probe[] => [
      {
        op: `create${kind}Style`,
        build: async () => ({
          op: `create${kind}Style`,
          args: { name: `probe ${kind.toLowerCase()} style` },
        }),
      },
      {
        op: `rename${kind}Style`,
        build: async ({ page }) => {
          const id = await newStyle(page, kind);
          return id
            ? {
                op: `rename${kind}Style`,
                args: { styleId: id, name: "probe renamed" },
              }
            : null;
        },
        setupUndo: 1,
      },
      {
        op: `delete${kind}Style`,
        build: async ({ page }) => {
          const id = await newStyle(page, kind);
          return id
            ? { op: `delete${kind}Style`, args: { styleId: id } }
            : null;
        },
        setupUndo: 1,
      },
    ],
  ),
  {
    op: "setStyleProperty",
    build: async ({ page }) => {
      const id = await newStyle(page, "Paragraph");
      return id
        ? {
            op: "setStyleProperty",
            args: {
              collection: "paragraph",
              styleId: id,
              path: "characterFontSize",
              value: { type: "length", value: 13 },
            },
          }
        : null;
    },
    setupUndo: 1,
  },
];

// ── probes on the `geometry` fixture (paths + boolean) ──────────
// Path-point ops target a scratch path created per probe (setupUndo
// undoes the insert on both paths) so the classification is the
// engine's, never the fixture's shape inventory.
const GEOMETRY_PROBES: Probe[] = [
  {
    op: "pathPointInsert",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? {
            op: "pathPointInsert",
            args: { elementId: t, index: 1, anchor: ANCHOR(30, 30) },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "pathPointRemove",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? { op: "pathPointRemove", args: { elementId: t, index: 0 } }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "pathPointCurveType",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? {
            op: "pathPointCurveType",
            args: { elementId: t, index: 0, smooth: true },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "pathPointSet",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? {
            op: "pathPointSet",
            args: {
              elementId: t,
              index: 0,
              role: "anchor",
              position: [15, 15],
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "pathOpenAt",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t ? { op: "pathOpenAt", args: { elementId: t, index: 0 } } : null;
    },
    setupUndo: 1,
  },
  // ── v30 kernel path ops (outline / offset / simplify) ───────────
  // Each targets a scratch path created per probe (setupUndo undoes
  // the insert on both paths) so the classification is the engine's.
  {
    op: "outlineStroke",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? {
            op: "outlineStroke",
            args: {
              elementId: t,
              width: 2,
              cap: "butt",
              join: "miter",
              miterLimit: 4,
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "offsetPath",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? {
            op: "offsetPath",
            args: { elementId: t, delta: 3, join: "miter", miterLimit: 4 },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "simplifyPath",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? { op: "simplifyPath", args: { elementId: t, tolerance: 1.5 } }
        : null;
    },
    setupUndo: 1,
  },
  // ── group ops (v32) ───────────────────────────────────────────
  {
    op: "createGroup",
    build: async ({ page, fx }) => {
      const ids = await page.evaluate(async (pageId) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                mutate: (m: unknown) => Promise<{
                  kind: string;
                  payload?: {
                    createdId?: { kind: string; id: string } | null;
                  };
                }>;
              };
            };
          }
        ).__canvas;
        const a = await c.client.mutate({
          op: "insertFrame",
          args: { pageId, bounds: [10, 10, 60, 60] },
        });
        const b = await c.client.mutate({
          op: "insertFrame",
          args: { pageId, bounds: [70, 70, 120, 120] },
        });
        return { a: a.payload?.createdId, b: b.payload?.createdId };
      }, fx.pages[0].pageId);
      if (!ids.a || !ids.b) return null;
      return { op: "createGroup", args: { memberIds: [ids.a, ids.b] } };
    },
    setupUndo: 2, // the two scratch insertFrame ops
  },
  {
    op: "dissolveGroup",
    build: async ({ page, fx }) => {
      const groupId = await page.evaluate(async (pageId) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                mutate: (m: unknown) => Promise<{
                  kind: string;
                  payload?: {
                    createdId?: { kind: string; id: string } | null;
                  };
                }>;
              };
            };
          }
        ).__canvas;
        const a = await c.client.mutate({
          op: "insertFrame",
          args: { pageId, bounds: [10, 10, 60, 60] },
        });
        const b = await c.client.mutate({
          op: "insertFrame",
          args: { pageId, bounds: [70, 70, 120, 120] },
        });
        if (!a.payload?.createdId || !b.payload?.createdId) return null;
        const g = await c.client.mutate({
          op: "createGroup",
          args: { memberIds: [a.payload.createdId, b.payload.createdId] },
        });
        return g.payload?.createdId?.id ?? null;
      }, fx.pages[0].pageId);
      if (!groupId) return null;
      return { op: "dissolveGroup", args: { groupId } };
    },
    setupUndo: 3, // two inserts + the createGroup
  },
  // ── plugin-metadata carrier (v33) ─────────────────────────────
  {
    op: "setPluginMetadata",
    build: async ({ page, fx }) => {
      const t = await newPath(page, fx.pages[0].pageId);
      return t
        ? {
            op: "setPluginMetadata",
            args: {
              elementId: t,
              key: "x-paged:probe",
              value: '{"v":1,"data":{}}',
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "pathfinderBoolean",
    build: async ({ page, fx }) => {
      const ids = await page.evaluate(async (pageId) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                mutate: (m: unknown) => Promise<{
                  payload?: { createdId?: { kind: string; id: string } };
                }>;
              };
            };
          }
        ).__canvas;
        const a = await c.client.mutate({
          op: "insertFrame",
          args: { pageId, bounds: [10, 10, 90, 90] },
        });
        const b = await c.client.mutate({
          op: "insertFrame",
          args: { pageId, bounds: [50, 50, 140, 140] },
        });
        return { a: a.payload?.createdId, b: b.payload?.createdId };
      }, fx.pages[0].pageId);
      if (!ids.a || !ids.b) return null;
      return {
        op: "pathfinderBoolean",
        args: { kept: ids.a, others: [ids.b], kind: "union" },
      };
    },
    setupUndo: 2, // the two scratch insertFrame ops
  },
  // ── v28 operations (W0.5 batch) ───────────────────────────────
  {
    op: "insertTextFrame",
    build: async ({ fx }) => ({
      op: "insertTextFrame",
      args: { pageId: fx.pages[0].pageId, bounds: [30, 30, 140, 150] },
    }),
  },
  {
    op: "insertOval",
    build: async ({ fx }) => ({
      op: "insertOval",
      args: { pageId: fx.pages[0].pageId, bounds: [20, 20, 120, 90] },
    }),
  },
  {
    op: "insertGuide",
    build: async ({ page }) => {
      const spreadId = await lastCollectionId(page, "spreads");
      return spreadId
        ? {
            op: "insertGuide",
            args: { spreadId, orientation: "horizontal", position: 100 },
          }
        : null;
    },
  },
  {
    op: "moveGuide",
    build: async ({ page }) => {
      // Guides are addressed positionally (Guide/<spread>/<index>);
      // insert a scratch guide, then move index 0 on that spread.
      const spreadId = await lastCollectionId(page, "spreads");
      if (!spreadId) return null;
      const made = await tryMutate(page, {
        op: "insertGuide",
        args: { spreadId, orientation: "vertical", position: 50 },
      });
      return made.ok
        ? { op: "moveGuide", args: { guideId: `Guide/${spreadId}/0`, position: 80 } }
        : null;
    },
    setupUndo: 1, // the scratch guide
  },
  {
    op: "deleteGuide",
    build: async ({ page }) => {
      const spreadId = await lastCollectionId(page, "spreads");
      if (!spreadId) return null;
      const made = await tryMutate(page, {
        op: "insertGuide",
        args: { spreadId, orientation: "vertical", position: 60 },
      });
      return made.ok
        ? { op: "deleteGuide", args: { guideId: `Guide/${spreadId}/0` } }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "setConditionVisible",
    build: async ({ page }) => {
      const condition = await lastCollectionId(page, "conditions");
      return condition
        ? { op: "setConditionVisible", args: { condition, visible: false } }
        : null;
    },
  },
  {
    op: "activateConditionSet",
    build: async ({ page }) => {
      const set = await lastCollectionId(page, "conditionSets");
      return set ? { op: "activateConditionSet", args: { set } } : null;
    },
  },
  {
    op: "applyMasterToPage",
    build: async ({ fx }) => ({
      // master:null = detach — exercises the op without needing a
      // master spread in the fixture; undo restores the prior ref.
      op: "applyMasterToPage",
      args: { page: fx.pages[0].pageId, master: null },
    }),
  },
  {
    op: "duplicatePage",
    build: async ({ fx }) => ({
      op: "duplicatePage",
      args: { page: fx.pages[0].pageId },
    }),
  },
  {
    op: "insertSection",
    build: async ({ fx }) => ({
      op: "insertSection",
      args: { atPage: fx.pages[0].pageId, prefix: "A-", startAt: 1 },
    }),
  },
  {
    op: "editSection",
    build: async ({ page, fx }) => {
      const made = await tryMutate(page, {
        op: "insertSection",
        args: { atPage: fx.pages[0].pageId, prefix: "B-", startAt: 5 },
      });
      if (!made.ok) return null;
      const sectionId = await lastCollectionId(page, "sections");
      return sectionId
        ? { op: "editSection", args: { sectionId, prefix: "C-" } }
        : null;
    },
    setupUndo: 1, // the scratch section
  },
  {
    op: "deleteSection",
    build: async ({ page, fx }) => {
      const made = await tryMutate(page, {
        op: "insertSection",
        args: { atPage: fx.pages[0].pageId, prefix: "D-", startAt: 9 },
      });
      if (!made.ok) return null;
      const sectionId = await lastCollectionId(page, "sections");
      return sectionId
        ? { op: "deleteSection", args: { sectionId } }
        : null;
    },
    setupUndo: 1,
  },
];

// ── probes on the `tables` fixture (v30 table ops) ──────────────
// Each addresses the FIRST table cell (resolved via a hit-test sweep
// in the test body and passed through `ctx.fx`'s page geometry). The
// six ops target the cell's story + table id + row/col index; insert/
// delete are reversible (one undo). Row height / column width set an
// absolute value (reversible). The cell is resolved once and stashed
// on a module-level ref the build()s read.
let TABLE_CELL: {
  storyId: string;
  tableId: string;
  row: number;
  col: number;
} | null = null;

const TABLE_PROBES: Probe[] = [
  {
    op: "setRowHeight",
    build: async () =>
      TABLE_CELL
        ? {
            op: "setRowHeight",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
              row: TABLE_CELL.row,
              height: 36,
            },
          }
        : null,
  },
  {
    op: "setColumnWidth",
    build: async () =>
      TABLE_CELL
        ? {
            op: "setColumnWidth",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
              col: TABLE_CELL.col,
              width: 80,
            },
          }
        : null,
  },
  {
    op: "insertTableRow",
    build: async () =>
      TABLE_CELL
        ? {
            op: "insertTableRow",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
              at: TABLE_CELL.row,
            },
          }
        : null,
  },
  {
    op: "deleteTableRow",
    build: async ({ page }) => {
      if (!TABLE_CELL) return null;
      // Insert a scratch row first so the delete is always legal +
      // reversible (deleting the last row would empty the table).
      const made = await tryMutate(page, {
        op: "insertTableRow",
        args: {
          storyId: TABLE_CELL.storyId,
          tableId: TABLE_CELL.tableId,
          at: TABLE_CELL.row,
        },
      });
      return made.ok
        ? {
            op: "deleteTableRow",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
              at: TABLE_CELL.row,
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "insertTableColumn",
    build: async () =>
      TABLE_CELL
        ? {
            op: "insertTableColumn",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
              at: TABLE_CELL.col,
            },
          }
        : null,
  },
  {
    op: "deleteTableColumn",
    build: async ({ page }) => {
      if (!TABLE_CELL) return null;
      const made = await tryMutate(page, {
        op: "insertTableColumn",
        args: {
          storyId: TABLE_CELL.storyId,
          tableId: TABLE_CELL.tableId,
          at: TABLE_CELL.col,
        },
      });
      return made.ok
        ? {
            op: "deleteTableColumn",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
              at: TABLE_CELL.col,
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  // ── v35 table ops (header/footer rows + cell span) ──────────────
  // Header/footer ops take only story+table id; span addresses the
  // cell. All reversible by the engine (one undo on success).
  {
    op: "insertHeaderRow",
    build: async () =>
      TABLE_CELL
        ? {
            op: "insertHeaderRow",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
            },
          }
        : null,
  },
  {
    op: "removeHeaderRow",
    build: async ({ page }) => {
      if (!TABLE_CELL) return null;
      // Add a header row first so the removal is always legal +
      // reversible (no header to remove on a fresh body table).
      const made = await tryMutate(page, {
        op: "insertHeaderRow",
        args: { storyId: TABLE_CELL.storyId, tableId: TABLE_CELL.tableId },
      });
      return made.ok
        ? {
            op: "removeHeaderRow",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "insertFooterRow",
    build: async () =>
      TABLE_CELL
        ? {
            op: "insertFooterRow",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
            },
          }
        : null,
  },
  {
    op: "removeFooterRow",
    build: async ({ page }) => {
      if (!TABLE_CELL) return null;
      const made = await tryMutate(page, {
        op: "insertFooterRow",
        args: { storyId: TABLE_CELL.storyId, tableId: TABLE_CELL.tableId },
      });
      return made.ok
        ? {
            op: "removeFooterRow",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
            },
          }
        : null;
    },
    setupUndo: 1,
  },
  {
    op: "setCellSpan",
    build: async () =>
      TABLE_CELL
        ? {
            op: "setCellSpan",
            args: {
              storyId: TABLE_CELL.storyId,
              tableId: TABLE_CELL.tableId,
              row: TABLE_CELL.row,
              col: TABLE_CELL.col,
              rowSpan: 2,
              columnSpan: 2,
            },
          }
        : null,
  },
];

async function runProbes(
  page: Page,
  probes: Probe[],
  fx: LoadedFixture,
  results: ProbeResult[],
): Promise<void> {
  for (const probe of probes) {
    if (CAPTURE) process.stdout.write(`[probe] ${probe.op}\n`);
    const setup = probe.setupUndo ?? 0;
    let m: unknown | null;
    try {
      m = await probe.build({ page, fx });
    } catch (err) {
      await undoN(page, setup);
      results.push({
        op: probe.op,
        status: "unsupported",
        error: `build threw: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (m === null) {
      await undoN(page, setup);
      results.push({
        op: probe.op,
        status: "unsupported",
        skipped: "prerequisites missing in fixture",
      });
      continue;
    }
    const r = await tryMutate(page, m);
    if (r.ok) {
      results.push({ op: probe.op, status: "supported" });
      await undoN(page, (probe.undo ?? 1) + setup);
    } else {
      results.push({ op: probe.op, status: "unsupported", error: r.error });
      await undoN(page, setup);
    }
  }
}

test("AC-E2E-CAPS — every wire op's engine support matches the table", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const results: ProbeResult[] = [];
  if (CAPTURE) {
    // Surface worker panics live — a dead worker otherwise reads as
    // a silent tryMutate hang.
    page.on("console", (msg) => {
      const t = msg.text();
      if (/panic|error|unreachable/i.test(t))
        process.stdout.write(`[console] ${t.slice(0, 300)}\n`);
    });
    page.on("pageerror", (err) =>
      process.stdout.write(`[pageerror] ${String(err).slice(0, 300)}\n`),
    );
  }

  await openCanvas(page);
  const textFx = await loadFixture(page, "text");
  await runProbes(page, TEXT_PROBES, textFx, results);

  const geoFx = await loadFixture(page, "geometry");
  await runProbes(page, GEOMETRY_PROBES, geoFx, results);

  // ── v30 table ops on the `tables` fixture ──────────────────────
  const tableFx = await loadFixture(page, "tables");
  const p0 = tableFx.pages[0];
  TABLE_CELL = await firstTableCell(page, p0.pageId, p0.widthPt, p0.heightPt);
  if (CAPTURE) {
    process.stdout.write(`[tables] firstCell=${JSON.stringify(TABLE_CELL)}\n`);
  }
  await runProbes(page, TABLE_PROBES, tableFx, results);

  // ── report ────────────────────────────────────────────────────
  const table = results
    .map(
      (r) =>
        `${r.op.padEnd(28)} ${r.status}${r.error ? `  [${r.error.slice(0, 90)}]` : ""}${r.skipped ? `  (skipped: ${r.skipped})` : ""}`,
    )
    .join("\n");
  console.log(`\nCAPABILITY PROBE RESULTS\n${table}\n`);
  if (CAPTURE) {
    writeFileSync(
      "/tmp/paged-e2e-capabilities.json",
      JSON.stringify(results, null, 2),
    );
    return;
  }

  // Assert vs the checked-in table.
  const issues: string[] = [];
  for (const r of results) {
    if (r.skipped) continue; // prerequisite-skips don't gate
    const exp = expectedStatus(r.op);
    if (!exp) {
      issues.push(`${r.op}: probed but missing from CAPABILITIES table`);
      continue;
    }
    if (exp.status !== r.status) {
      issues.push(
        `${r.op}: table says ${exp.status}, engine says ${r.status}${r.error ? ` (${r.error.slice(0, 100)})` : ""} — update harness/capabilities.ts AND the domain test`,
      );
    }
  }
  // Table rows never probed (typo guard).
  for (const c of CAPABILITIES) {
    if (!results.find((r) => r.op === c.op)) {
      issues.push(`${c.op}: in CAPABILITIES table but never probed`);
    }
  }
  expect(issues, issues.join("\n")).toEqual([]);
});
