// Editor-ops (protocol v24) — end-to-end smoke over the new engine
// operations, driven through the dev `window.__canvas.client` hook so
// every assertion exercises the REAL wasm dispatch (same harness
// convention as translate/rotate-scale):
//
//   insertLine / insertPath{smooth} / insertFrame + createdId,
//   setDocumentDefaults (whole-triple, consulted by inserts),
//   pathOpenAt (Scissors), the shear worker gesture,
//   gradient angle/length authoring + gradient-feather authoring,
//   insertPage / resizePage / deletePage + the page-grid refresh
//   contract (pageStructureChanged + pageSizesPt on mutationApplied
//   AND on undo/redo replies, mirrored into `__canvas.handle`).

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

type ElementId = { kind: string; id: string };

interface MutationReply {
  kind: string;
  payload: {
    createdId?: ElementId | null;
    pageIds?: string[];
    pageStructureChanged?: boolean;
    pageSizesPt?: [number, number][] | null;
    error?: unknown;
  };
}

/** Run a mutation in the page and return the worker reply. */
async function mutate(page: Page, mutation: unknown): Promise<MutationReply> {
  return page.evaluate(async (m) => {
    const c = (globalThis as unknown as {
      __canvas: { client: { mutate: (x: unknown) => Promise<unknown> } };
    }).__canvas;
    return (await c.client.mutate(m)) as never;
  }, mutation);
}

async function firstPageId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = (globalThis as unknown as {
      __canvas: { handle: { pageIds: string[] } };
    }).__canvas;
    return c.handle.pageIds[0];
  });
}

async function propertyValue(
  page: Page,
  id: ElementId,
  path: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ id, path }) => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            elementProperties: (
              id: unknown,
            ) => Promise<{ entries: { path: string; value?: unknown }[] } | null>;
          };
        };
      }).__canvas;
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === path)?.value ?? null;
    },
    { id, path },
  );
}

async function pathAnchors(
  page: Page,
  id: ElementId,
): Promise<{
  anchors: { anchor: [number, number] }[];
  subpathStarts: number[];
  subpathOpen: boolean[];
} | null> {
  return page.evaluate(async (target) => {
    const c = (globalThis as unknown as {
      __canvas: { client: { pathAnchors: (id: unknown) => Promise<unknown> } };
    }).__canvas;
    return (await c.client.pathAnchors(target)) as never;
  }, id);
}

test.describe("Editor-ops — protocol v24 engine operations", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    // Load through the REACT path (file input → loadDocumentFile →
    // setHandle) — unlike `loadIdml`'s direct client call this keeps
    // `__canvas.handle` live, which the page-grid mirror assertions
    // need.
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
              .ready,
        ),
      )
      .toBe(true);
  });

  test("insertFrame returns createdId and undo removes the frame @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    const reply = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [50, 50, 150, 150] },
    });
    expect(reply.kind).toBe("mutationApplied");
    const created = reply.payload.createdId!;
    expect(created).toBeTruthy();
    expect(created.kind).toBe("rectangle");
    const bounds = (await propertyValue(page, created, "frameBounds")) as {
      type: string;
    };
    expect(bounds?.type).toBe("bounds");
    // Undo → the element is gone.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }).__canvas;
      await c.client.undo();
    });
    const after = await page.evaluate(async (id) => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: { elementProperties: (id: unknown) => Promise<unknown> };
        };
      }).__canvas;
      return c.client.elementProperties(id);
    }, created);
    expect(after).toBeNull();
  });

  test("insertLine creates a GraphicLine with the drag endpoints @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:gesture", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    const reply = await mutate(page, {
      op: "insertLine",
      args: { pageId, start: [10, 20], end: [110, 220] },
    });
    expect(reply.kind).toBe("mutationApplied");
    const created = reply.payload.createdId!;
    expect(created.kind).toBe("graphicLine");
    const result = await pathAnchors(page, created);
    expect(result?.anchors.length).toBe(2);
    expect(result?.anchors[0].anchor[0]).toBeCloseTo(10, 1);
    expect(result?.anchors[1].anchor[1]).toBeCloseTo(220, 1);
  });

  test("insertPath{smooth} compresses a polyline into fitted cubics @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    // A noisy sine arc — the Schneider fit should land far fewer
    // anchors than the 40 raw samples.
    const anchors = Array.from({ length: 40 }, (_, i) => {
      const x = 20 + i * 5;
      const y = 200 + Math.sin(i / 6) * 60;
      return { anchor: [x, y], left: [x, y], right: [x, y] };
    });
    const reply = await mutate(page, {
      op: "insertPath",
      args: { pageId, anchors, open: true, smooth: true },
    });
    expect(reply.kind).toBe("mutationApplied");
    const created = reply.payload.createdId!;
    expect(created.kind).toBe("polygon");
    const result = await pathAnchors(page, created);
    expect(result).toBeTruthy();
    expect(result!.anchors.length).toBeLessThan(20);
    expect(result!.subpathOpen[0]).toBe(true);
  });

  test("setDocumentDefaults is consulted by inserts and echoed by documentMeta @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    // Pick a real swatch so the fill ref resolves.
    const swatchId = await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<{ selfId: string; name: string }[]>;
          };
        };
      }).__canvas;
      const swatches = await c.client.collection("swatches");
      return swatches.find((s) => !/none|paper/i.test(s.name))!.selfId;
    });
    const set = await mutate(page, {
      op: "setDocumentDefaults",
      args: { fillColor: swatchId, strokeColor: null, strokeWeight: 2.5 },
    });
    expect(set.kind).toBe("mutationApplied");
    const meta = await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            documentMeta: () => Promise<{
              defaultFillColor?: string | null;
              defaultStrokeWeight?: number | null;
            }>;
          };
        };
      }).__canvas;
      return c.client.documentMeta();
    });
    expect(meta.defaultFillColor).toBe(swatchId);
    expect(meta.defaultStrokeWeight).toBeCloseTo(2.5, 3);
    // A fresh insert picks the default up engine-side.
    const reply = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [200, 200, 260, 260] },
    });
    const fill = (await propertyValue(
      page,
      reply.payload.createdId!,
      "frameFillColor",
    )) as { type: string; value: string | null };
    expect(fill.value).toBe(swatchId);
  });

  test("pathOpenAt opens a closed contour at the clicked anchor (Scissors) @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    const square = [
      { anchor: [300, 300], left: [300, 300], right: [300, 300] },
      { anchor: [400, 300], left: [400, 300], right: [400, 300] },
      { anchor: [400, 400], left: [400, 400], right: [400, 400] },
      { anchor: [300, 400], left: [300, 400], right: [300, 400] },
    ];
    const insert = await mutate(page, {
      op: "insertPath",
      args: { pageId, anchors: square, open: false, smooth: false },
    });
    const created = insert.payload.createdId!;
    const before = await pathAnchors(page, created);
    expect(before!.subpathOpen[0]).toBe(false);
    const cut = await mutate(page, {
      op: "pathOpenAt",
      args: { elementId: created, index: 1 },
    });
    expect(cut.kind).toBe("mutationApplied");
    const after = await pathAnchors(page, created);
    expect(after!.subpathOpen[0]).toBe(true);
    // Closed→open twins the seam anchor.
    expect(after!.anchors.length).toBe(square.length + 1);
  });

  test("shear worker gesture commits a skewed transform @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:gesture", async ({ page }) => {
    const pageId = await firstPageId(page);
    const insert = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [100, 100, 200, 200] },
    });
    const created = insert.payload.createdId!;
    const transform = await page.evaluate(
      async ({ created, pageId }) => {
        const c = (globalThis as unknown as {
          __canvas: {
            client: {
              beginGesture: (
                nodes: unknown[],
                gesture: unknown,
                anchor: unknown,
              ) => Promise<number>;
              updateGesture: (
                handle: number,
                delta: [number, number],
                modifiers: { shift: boolean; alt: boolean },
              ) => Promise<unknown>;
              commitGesture: (handle: number) => Promise<unknown>;
              elementProperties: (
                id: unknown,
              ) => Promise<{ entries: { path: string; value?: unknown }[] } | null>;
            };
          };
        }).__canvas;
        // Anchor on the frame's top edge — well off the centroid
        // pivot so the shear factor k = dx / (anchor.y − pivot.y)
        // is defined.
        const handle = await c.client.beginGesture(
          [created],
          { kind: "shear" },
          { pageId, pointInPage: [150, 100] },
        );
        await c.client.updateGesture(handle, [25, 0], {
          shift: false,
          alt: false,
        });
        await c.client.commitGesture(handle);
        const props = await c.client.elementProperties(created);
        return props?.entries.find((e) => e.path === "frameTransform")?.value as {
          type: string;
          value: number[] | null;
        };
      },
      { created, pageId },
    );
    expect(transform?.type).toBe("transform");
    const m = transform!.value!;
    // Horizontal shear lands in the c (skew-x) slot; the diagonal
    // stays untouched.
    expect(Math.abs(m[2])).toBeGreaterThan(1e-3);
    expect(m[0]).toBeCloseTo(1, 3);
    expect(m[3]).toBeCloseTo(1, 3);
  });

  test("gradient axis + gradient feather author and read back @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    const insert = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [50, 300, 150, 420] },
    });
    const created = insert.payload.createdId!;
    // Axis (Gradient Swatch tool's commit shape): batched angle +
    // length, one undo step.
    const axis = await mutate(page, {
      op: "batch",
      args: {
        ops: [
          {
            op: "setElementProperty",
            args: {
              elementId: created,
              path: "frameGradientFillAngle",
              value: { type: "length", value: 45 },
            },
          },
          {
            op: "setElementProperty",
            args: {
              elementId: created,
              path: "frameGradientFillLength",
              value: { type: "length", value: 120 },
            },
          },
        ],
      },
    });
    expect(axis.kind).toBe("mutationApplied");
    const angle = (await propertyValue(
      page,
      created,
      "frameGradientFillAngle",
    )) as { value: number | null };
    expect(angle.value).toBeCloseTo(45, 3);
    // Feather (Gradient Feather tool's commit shape): whole-struct.
    const feather = await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: created,
        path: "frameGradientFeather",
        value: {
          type: "gradientFeather",
          value: {
            gradientType: "Linear",
            angleDeg: 30,
            stops: [
              { stopColor: null, locationPct: 0, alphaPct: 100, midpointPct: 50 },
              { stopColor: null, locationPct: 100, alphaPct: 0, midpointPct: 50 },
            ],
          },
        },
      },
    });
    expect(feather.kind).toBe("mutationApplied");
    const readBack = (await propertyValue(
      page,
      created,
      "frameGradientFeather",
    )) as { value: { angleDeg?: number; stops?: unknown[] } | null };
    expect(readBack.value?.angleDeg).toBeCloseTo(30, 3);
    expect(readBack.value?.stops?.length).toBe(2);
    // Clear → null reads back.
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: created,
        path: "frameGradientFeather",
        value: { type: "gradientFeather", value: null },
      },
    });
    const cleared = (await propertyValue(
      page,
      created,
      "frameGradientFeather",
    )) as { value: unknown };
    expect(cleared.value).toBeNull();
  });

  test("fill/stroke cluster writes DOCUMENT defaults when nothing is selected @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:happy", async ({
    page,
  }) => {
    // No selection → the cluster's D button routes to
    // `setDocumentDefaults` (AC-7's empty-selection clause): no fill,
    // black stroke.
    await expect(
      page.locator('[data-fill-stroke-cluster="ready"]'),
    ).toBeVisible();
    const dBtn = page.locator("[data-fs-default]");
    await expect(dBtn).toBeEnabled();
    await dBtn.click();
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const c = (globalThis as unknown as {
            __canvas: {
              client: {
                documentMeta: () => Promise<{
                  defaultFillColor?: string | null;
                  defaultStrokeColor?: string | null;
                }>;
              };
            };
          }).__canvas;
          const m = await c.client.documentMeta();
          return `${m.defaultFillColor ?? "null"}|${m.defaultStrokeColor ?? "null"}`;
        }),
      )
      .toMatch(/^null\|Color\//);
    // A fresh frame picks the pair up engine-side.
    const pageId = await firstPageId(page);
    const reply = await mutate(page, {
      op: "insertFrame",
      args: { pageId, bounds: [10, 10, 60, 60] },
    });
    const fill = (await propertyValue(
      page,
      reply.payload.createdId!,
      "frameFillColor",
    )) as { value: string | null };
    expect(fill.value).toBeNull();
    const strokeColor = (await propertyValue(
      page,
      reply.payload.createdId!,
      "frameStrokeColor",
    )) as { value: string | null };
    expect(strokeColor.value).toMatch(/^Color\//);
  });

  test("page insert/resize/delete refresh the page grid, incl. undo @feat:color-swatches.document-defaults @feat:frames-paths.frame.insert @feat:frames-paths.line.insert @feat:frames-paths.path.insert @level:gesture", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    const initial = await page.evaluate(
      () =>
        (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } })
          .__canvas.handle.pageIds.length,
    );
    // Insert — the reply carries the full refreshed grid.
    const insert = await mutate(page, {
      op: "insertPage",
      args: { afterPageId: pageId, masterId: null },
    });
    expect(insert.kind).toBe("mutationApplied");
    expect(insert.payload.pageStructureChanged).toBe(true);
    expect(insert.payload.pageSizesPt?.length).toBe(initial + 1);
    const newPageId = insert.payload.pageIds!.find((p) => p !== pageId)!;
    // The shell mirrors the refresh into the document handle (the
    // page grid re-renders without a reload).
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as unknown as {
              __canvas: { handle: { pageIds: string[] } };
            }).__canvas.handle.pageIds.length,
        ),
      )
      .toBe(initial + 1);
    // Resize the new page.
    const resize = await mutate(page, {
      op: "resizePage",
      args: { pageId: newPageId, bounds: [0, 0, 500, 350] },
    });
    expect(resize.kind).toBe("mutationApplied");
    expect(resize.payload.pageStructureChanged).toBe(true);
    const resized = resize.payload.pageSizesPt!.find(
      ([, h]) => Math.abs(h - 500) < 0.5,
    );
    expect(resized?.[0]).toBeCloseTo(350, 1);
    // Delete it again.
    const del = await mutate(page, {
      op: "deletePage",
      args: { pageId: newPageId },
    });
    expect(del.kind).toBe("mutationApplied");
    expect(del.payload.pageSizesPt?.length).toBe(initial);
    // Undo the delete — the UNDO reply must also carry the grid
    // refresh (the v24 undo/redo contract).
    const undo = (await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }).__canvas;
      return c.client.undo();
    })) as { kind: string; payload: { pageStructureChanged?: boolean } };
    expect(undo.kind).toBe("undoApplied");
    expect(undo.payload.pageStructureChanged).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as unknown as {
              __canvas: { handle: { pageIds: string[] } };
            }).__canvas.handle.pageIds.length,
        ),
      )
      .toBe(initial + 1);
    // Deleting the ONLY remaining page after removing the extra one
    // is rejected engine-side (guard).
    await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: { client: { redo: () => Promise<unknown> } };
      }).__canvas;
      await c.client.redo(); // re-delete the extra page
    });
    if (initial === 1) {
      const lastDelete = await mutate(page, {
        op: "deletePage",
        args: { pageId },
      });
      expect(lastDelete.kind).toBe("mutationFailed");
    }
  });
});
