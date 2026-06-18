// The Designer — a thin page-object whose verbs read like a DTP/InDesign
// workflow. It composes the existing real-input harness (viewport.ts,
// ui.ts) with the journey oracle (context.ts). HYBRID by design: the
// interaction UNDER TEST uses real pointer/keyboard input + a context
// assertion; bulk setup rides the fast channel (`mutate`/`script`).

import { expect, type Page } from "@playwright/test";

import { openCanvas } from "../../fidelity/canvas-driver";
import { mutate, script, setCaret } from "../../e2e/harness/ui";
import {
  activateTool,
  dragMouse,
  screenPoint,
  treeCount,
  treeIds,
} from "../../e2e/harness/viewport";
import { expectContext } from "./context";
import type { ExpectedContext } from "./context-contract";

/** A rectangle in model-space points, {x0,y0} top-left → {x1,y1}. */
export interface PtRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface CanvasGlobal {
  __canvas: {
    ready: boolean;
    handle: { pageCount: number; pageIds: string[]; pageSizesPt: [number, number][] } | null;
    openPanel?: (id: string) => void;
    setElementSelection?: (
      ids: Array<{ kind: string; id: string }>,
      mode: string,
    ) => void;
    setElementGeometry?: (items: unknown[]) => void;
    setContentSelection?: (sel: unknown | null) => void;
    client: {
      requestSnapshot: (
        pageId: string,
        targetWidthPx: number,
        dpi?: number,
      ) => Promise<{ pngBytes: number[] }>;
      exportIdml: () => Promise<Uint8Array>;
      loadDocument: (bytes: Uint8Array) => Promise<{ pageCount: number }>;
      elementGeometry: (
        ids: Array<{ kind: string; id: string }>,
      ) => Promise<Array<{ hasImage?: boolean }>>;
      claimImageResource: (claim: {
        imageId: string;
        levels: number;
        tileSize: number;
        baseWidth: number;
        baseHeight: number;
        revision: number;
      }) => Promise<void>;
      submitResourceTiles: (
        imageId: string,
        level: number,
        tiles: Array<{
          x: number;
          y: number;
          width: number;
          height: number;
          rgba: number[];
        }>,
        generation: number,
      ) => Promise<void>;
      collection: (name: string) => Promise<Array<{ selfId: string }>>;
      layers: () => Promise<
        Array<{ selfId: string; name?: string; visible?: boolean; locked?: boolean }>
      >;
    };
    registries: {
      commands: {
        invoke?: (id: string) => Promise<void>;
        execute?: (id: string) => Promise<void>;
        run?: (id: string) => Promise<void>;
      };
    };
  };
}

export class Designer {
  constructor(private readonly page: Page) {}

  /** Boot the app and wait for the worker client. */
  async open(): Promise<void> {
    await openCanvas(this.page);
  }

  /** File ▸ New — mint a blank document via the real command path, wait
   *  for it to settle, ensure the Properties inspector is active, and
   *  fit page 0 to the viewport. */
  async newDocument(): Promise<void> {
    await this.page.evaluate(async () => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      const cmd = c.registries.commands;
      const invoke = cmd.invoke ?? cmd.execute ?? cmd.run;
      await invoke?.call(cmd, "paged.file.new");
    });
    await this.page.waitForFunction(
      () => (globalThis as unknown as CanvasGlobal).__canvas?.ready === true,
      null,
      { timeout: 15_000 },
    );
    await this.openPanel("paged.properties");
    await this.page.keyboard.press("Home"); // fit page 0
    await this.page.waitForTimeout(800);
  }

  async openPanel(id: string): Promise<void> {
    await this.page.evaluate(
      (pid) => (globalThis as unknown as CanvasGlobal).__canvas.openPanel?.(pid),
      id,
    );
  }

  /** Activate a tool through the real tool rail. */
  async activate(slot: string): Promise<void> {
    await activateTool(this.page, slot);
  }

  /** The current document handle. */
  async handle(): Promise<{
    pageCount: number;
    pageIds: string[];
    pageSizesPt: [number, number][];
  }> {
    return this.page.evaluate(() => {
      const h = (globalThis as unknown as CanvasGlobal).__canvas.handle;
      if (!h) throw new Error("no document loaded");
      return h;
    });
  }

  /** Insert a page after the last one. Returns the new page count
   *  (read off the mutation reply's `pageSizesPt`, which carries the
   *  fresh page list when the structure changes). */
  async addPage(): Promise<number> {
    const reply = (await mutate(this.page, {
      op: "insertPage",
      args: { afterPageId: null, masterId: null },
    })) as {
      payload?: {
        pageStructureChanged?: boolean;
        pageSizesPt?: [number, number][] | null;
      };
    };
    return reply.payload?.pageSizesPt?.length ?? 0;
  }

  /** Start a numbering section at a page. Returns true when applied. */
  async insertSection(
    pageId: string,
    opts: { prefix?: string; startAt?: number; numberingStyle?: string } = {},
  ): Promise<boolean> {
    const reply = (await mutate(this.page, {
      op: "insertSection",
      args: {
        atPage: pageId,
        prefix: opts.prefix ?? null,
        startAt: opts.startAt ?? null,
        numberingStyle: opts.numberingStyle ?? null,
      },
    })) as { kind?: string };
    return reply?.kind === "mutationApplied";
  }

  /** First story id (paged.stories()[0]). */
  async firstStoryId(): Promise<string | null> {
    const out = await script(this.page, "paged.stories()");
    const stories = JSON.parse(out[0] ?? "[]") as Array<{ selfId: string }>;
    return stories[0]?.selfId ?? null;
  }

  /**
   * HYBRID setup — channel-create a text frame (drawing one with the
   * Type tool is not the step under test here). Bounds are model-space
   * points; `insertTextFrame` takes [top,left,bottom,right]. Returns the
   * new frame id + its parent story.
   */
  async addTextFrame(
    rect: PtRect,
  ): Promise<{ frameId: string; storyId: string | null }> {
    const { pageIds } = await this.handle();
    const before = await treeIds(this.page, "textFrame");
    const reply = (await mutate(this.page, {
      op: "insertTextFrame",
      args: { pageId: pageIds[0], bounds: [rect.y0, rect.x0, rect.y1, rect.x1] },
    })) as { payload?: { createdId?: { id?: string } } };
    await expect
      .poll(() => treeCount(this.page, "textFrame"))
      .toBeGreaterThan(before.length);
    const after = await treeIds(this.page, "textFrame");
    const created = after.find((f) => !before.some((b) => b.id === f.id));
    const frameId = created?.id ?? reply.payload?.createdId?.id ?? "";
    const storyId = await this.firstStoryId();
    return { frameId, storyId };
  }

  /**
   * REAL INPUT — draw a rectangle by dragging the Rectangle tool ("shape"
   * slot) across the page, exactly as a user would. Maps model-space pts
   * to screen px through the live camera. Returns the new element id.
   */
  async drawRectangle(rect: PtRect): Promise<string> {
    await this.activate("shape");
    const before = await treeIds(this.page, "rectangle");
    const a = await screenPoint(this.page, rect.x0, rect.y0);
    const b = await screenPoint(this.page, rect.x1, rect.y1);
    await dragMouse(this.page, a, b);
    await expect
      .poll(() => treeCount(this.page, "rectangle"))
      .toBeGreaterThan(before.length);
    const after = await treeIds(this.page, "rectangle");
    const created = after.find((f) => !before.some((b2) => b2.id === f.id));
    return created?.id ?? "";
  }

  /** Select several page items at once (the multi-select the Align panel
   *  and group operations act on). Clears any text caret first. */
  async selectElements(
    refs: Array<{ kind: string; id: string }>,
  ): Promise<void> {
    await this.page.evaluate((refs) => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      c.setContentSelection?.(null);
      c.setElementSelection?.(refs, "replace");
    }, refs);
  }

  /** Apply a fill swatch to a frame. `colorRef` defaults to the blank
   *  document's built-in Black swatch so the shape becomes visible. */
  async applyFill(
    kind: string,
    id: string,
    colorRef = "Color/Black",
  ): Promise<void> {
    await mutate(this.page, {
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "frameFillColor",
        value: { type: "colorRef", value: colorRef },
      },
    });
  }

  /**
   * REAL INPUT — draw a path with the Pen tool: click an anchor per
   * point, then commit with Enter (the pen handler emits ONE insertPath).
   * Returns the new path element id (`polygon`).
   */
  async drawPath(points: Array<[number, number]>): Promise<string> {
    await this.activate("pen");
    const before = await treeIds(this.page, "polygon");
    for (const [x, y] of points) {
      const s = await screenPoint(this.page, x, y);
      await this.page.mouse.move(s.x, s.y);
      await this.page.mouse.down();
      await this.page.mouse.up();
    }
    await this.page.keyboard.press("Enter");
    await expect
      .poll(() => treeCount(this.page, "polygon"))
      .toBeGreaterThan(before.length);
    const after = await treeIds(this.page, "polygon");
    return after.find((p) => !before.some((b) => b.id === p.id))?.id ?? "";
  }

  /** Stroke a frame/path (colour + weight) — makes an open path visible. */
  async applyStroke(
    kind: string,
    id: string,
    colorRef = "Color/Black",
    weightPt = 3,
  ): Promise<void> {
    await mutate(this.page, {
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "frameStrokeColor",
        value: { type: "colorRef", value: colorRef },
      },
    });
    await mutate(this.page, {
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "frameStrokeWeight",
        value: { type: "length", value: weightPt },
      },
    });
  }

  /** Enable a drop shadow on a frame (Effects panel). */
  async applyDropShadow(kind: string, id: string, sizePt = 11): Promise<void> {
    await mutate(this.page, {
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "frameDropShadow",
        value: { type: "bool", value: true },
      },
    });
    await mutate(this.page, {
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "frameDropShadowSize",
        value: { type: "length", value: sizePt },
      },
    });
  }

  /** Channel-create a graphic frame; returns its created ElementId ref
   *  ({kind,id}). The fast-path counterpart to {@link drawRectangle}. */
  async addFrame(
    rect: PtRect,
  ): Promise<{ kind: string; id: string } | null> {
    const { pageIds } = await this.handle();
    const reply = (await mutate(this.page, {
      op: "insertFrame",
      args: { pageId: pageIds[0], bounds: [rect.y0, rect.x0, rect.y1, rect.x1] },
    })) as { payload?: { createdId?: { kind: string; id: string } } };
    return reply.payload?.createdId ?? null;
  }

  /** Select a page item (the React selection mirror the panels read).
   *  Clears any text caret/range first — selecting a frame with the
   *  Selection tool drops you out of text editing, the way a real click
   *  does (otherwise the Properties router, which prioritises a live
   *  caret, would stay in the Text context). */
  async selectElement(kind: string, id: string): Promise<void> {
    await this.page.evaluate(
      async ({ kind, id }) => {
        const c = (globalThis as unknown as CanvasGlobal).__canvas;
        c.setContentSelection?.(null);
        c.setElementSelection?.([{ kind, id }], "replace");
        // Populate the geometry mirror the Properties panel reads — its
        // `hasImage` flag selects the Image context. The real viewport
        // click path fetches this; we bypass the click, so fetch it.
        try {
          const items = await c.client.elementGeometry([{ kind, id }]);
          c.setElementGeometry?.(items);
        } catch {
          // best-effort — frame context still resolves from selection.
        }
      },
      { kind, id },
    );
  }

  /**
   * Visual checkpoint — read the page back through the deterministic CPU
   * snapshot path and diff against a committed baseline. An integral
   * px-per-pt width keeps the PNG dimension byte-stable.
   */
  async contentCheckpoint(
    name: string,
    opts: { widthPx?: number } = {},
  ): Promise<void> {
    // Visual baselines are committed per-platform (`{platform}` token).
    // Until Linux baselines are seeded in the CI container, skip the
    // pixel gate in CI so the cross-OS-stable context oracle still runs;
    // set JOURNEY_VISUAL=1 (with Linux baselines present) to enable it.
    if (process.env.CI && process.env.JOURNEY_VISUAL !== "1") {
      // eslint-disable-next-line no-console
      console.log(`[journey] content checkpoint "${name}" skipped in CI (no platform baseline)`);
      return;
    }
    const { pageIds, pageSizesPt } = await this.handle();
    const widthPx = opts.widthPx ?? 816; // 612pt Letter @ 96dpi
    const dpi = (widthPx * 72) / pageSizesPt[0][0];
    const b64 = await this.page.evaluate(
      async ({ pageId, widthPx, dpi }) => {
        const c = (globalThis as unknown as CanvasGlobal).__canvas;
        const snap = await c.client.requestSnapshot(pageId, widthPx, dpi);
        const arr = snap.pngBytes;
        let bin = "";
        for (let i = 0; i < arr.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, arr.slice(i, i + 0x8000));
        }
        return btoa(bin);
      },
      { pageId: pageIds[0], widthPx, dpi },
    );
    expect(Buffer.from(b64, "base64")).toMatchSnapshot(`${name}.png`);
  }

  /**
   * Read the page back through the deterministic CPU snapshot (the same
   * tiny-skia readback {@link contentCheckpoint} uses — it composites
   * native content AND any plugin sceneLayer) and return the raw PNG
   * bytes. Unlike `contentCheckpoint`, there is NO committed baseline:
   * pair two of these around an action and assert with
   * {@link expectRenderChanged} / {@link expectRenderStable}. That makes
   * "the plugin's output actually rendered" CI-runnable without seeding
   * per-platform baselines. An integral px-per-pt width keeps dims stable.
   */
  async renderBytes(
    opts: { widthPx?: number; pageIndex?: number } = {},
  ): Promise<Uint8Array> {
    const { pageIds, pageSizesPt } = await this.handle();
    const idx = opts.pageIndex ?? 0;
    const widthPx = opts.widthPx ?? 816; // 612pt Letter @ 96dpi
    const dpi = (widthPx * 72) / pageSizesPt[idx][0];
    const arr = await this.page.evaluate(
      async ({ pageId, widthPx, dpi }) => {
        const c = (globalThis as unknown as CanvasGlobal).__canvas;
        const snap = await c.client.requestSnapshot(pageId, widthPx, dpi);
        return Array.from(snap.pngBytes);
      },
      { pageId: pageIds[idx], widthPx, dpi },
    );
    return Uint8Array.from(arr);
  }

  /**
   * Count pixels that differ between two snapshots beyond an anti-aliasing
   * tolerance, decoding both PNGs in the (secure) page context via
   * `createImageBitmap` + `OffscreenCanvas` — no Node PNG decoder needed.
   * The CPU snapshot is deterministic (tiny-skia, same display list → same
   * bytes), so two snapshots of an UNCHANGED page diff to exactly 0; any
   * non-zero count is genuine rendered-content signal. A dimension change
   * counts as fully changed. Returns the changed-pixel count.
   */
  async renderDiffPixels(
    before: Uint8Array,
    after: Uint8Array,
    tol = 12,
  ): Promise<number> {
    return this.page.evaluate(
      async ({ before, after, tol }) => {
        const decode = async (bytes: number[]) => {
          const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
          const bmp = await createImageBitmap(blob);
          const cv = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = cv.getContext("2d");
          if (!ctx) throw new Error("no 2d context for snapshot diff");
          ctx.drawImage(bmp, 0, 0);
          return {
            data: ctx.getImageData(0, 0, bmp.width, bmp.height).data,
            w: bmp.width,
            h: bmp.height,
          };
        };
        const a = await decode(before);
        const b = await decode(after);
        if (a.w !== b.w || a.h !== b.h) return a.w * a.h; // resized = all-changed
        let changed = 0;
        for (let i = 0; i < a.data.length; i += 4) {
          if (
            Math.abs(a.data[i] - b.data[i]) > tol ||
            Math.abs(a.data[i + 1] - b.data[i + 1]) > tol ||
            Math.abs(a.data[i + 2] - b.data[i + 2]) > tol ||
            Math.abs(a.data[i + 3] - b.data[i + 3]) > tol
          ) {
            changed++;
          }
        }
        return changed;
      },
      { before: Array.from(before), after: Array.from(after), tol },
    );
  }

  /**
   * Assert the rendered page VISIBLY changed between two snapshots — the
   * core rendered-output oracle for plugin journeys. `minPixels` (default
   * 64) sits well above the deterministic-snapshot floor of 0 yet below any
   * real DTP edit (even a thin stroke or a single edited cell clears it).
   * Returns the changed-pixel count for logging/escalation.
   */
  async expectRenderChanged(
    before: Uint8Array,
    after: Uint8Array,
    minPixels = 64,
  ): Promise<number> {
    const changed = await this.renderDiffPixels(before, after);
    expect(
      changed,
      `rendered page should change by >${minPixels}px (got ${changed}px)`,
    ).toBeGreaterThan(minPixels);
    return changed;
  }

  /** Inverse of {@link expectRenderChanged}: assert the render did NOT
   *  change (a cleared preview, an undo, a no-op). `maxPixels` allows a
   *  small AA margin though the deterministic snapshot is usually exact. */
  async expectRenderStable(
    before: Uint8Array,
    after: Uint8Array,
    maxPixels = 16,
  ): Promise<number> {
    const changed = await this.renderDiffPixels(before, after);
    expect(
      changed,
      `rendered page should be stable (≤${maxPixels}px, got ${changed}px)`,
    ).toBeLessThanOrEqual(maxPixels);
    return changed;
  }

  /** Set a frame's placed-image LINK (the PlaceImage mutation). This
   *  flips the frame's `has_image` geometry flag → the Image inspector
   *  (Frame Fitting). It does NOT serve pixels — pair it with
   *  {@link serveTiledImage} to also render. `fit` is Rectangle-only. */
  async placeImageLink(
    frameId: string,
    uri = "x-paged-image:placed",
    fit: string | null = "FillProportionally",
  ): Promise<boolean> {
    const reply = (await mutate(this.page, {
      op: "placeImage",
      args: { elementId: frameId, uri, fit },
    })) as { kind?: string };
    return reply?.kind === "mutationApplied";
  }

  /**
   * Serve a placed image into a frame through the resource-tile provider
   * (the C-6 channel): claim the frame's image resource, then submit one
   * level-0 tile carrying a distinctive 4-quadrant pattern so the
   * checkpoint unmistakably shows IMAGE content (not a flat fill). A
   * single-tile pyramid (base = tileSize, levels = 1) keeps the mip pick
   * deterministic. NOTE: this renders an image but does NOT set the
   * frame's `has_image_element`, so the Image *context* doesn't trigger
   * (that's parse-time / IDML-embedded only).
   */
  async serveTiledImage(frameId: string): Promise<void> {
    await this.page.evaluate((frameId) => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas.client;
      const imageId = `x-paged-image:${frameId}`;
      const SIZE = 256;
      const rgba = new Array<number>(SIZE * SIZE * 4);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          const left = x < SIZE / 2;
          const top = y < SIZE / 2;
          const [r, g, b] = top
            ? left
              ? [220, 40, 40]
              : [40, 180, 60]
            : left
              ? [40, 80, 220]
              : [230, 200, 40];
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = 255;
        }
      }
      return (async () => {
        await c.claimImageResource({
          imageId,
          levels: 1,
          tileSize: SIZE,
          baseWidth: SIZE,
          baseHeight: SIZE,
          revision: 1,
        });
        await c.submitResourceTiles(
          imageId,
          0,
          [{ x: 0, y: 0, width: SIZE, height: SIZE, rgba }],
          1,
        );
      })();
    }, frameId);
    // Let the re-compose settle before the snapshot reads it back.
    await this.page.waitForTimeout(300);
  }

  /** Insert a table into a story (a text frame's story). Returns true
   *  when the mutation applied. */
  async insertTable(
    storyId: string,
    rows: number,
    cols: number,
  ): Promise<boolean> {
    const reply = (await mutate(this.page, {
      op: "insertTable",
      args: { storyId, rows, cols },
    })) as { kind?: string };
    return reply?.kind === "mutationApplied";
  }

  /**
   * Chrome visual checkpoint — screenshot the app DOM (default: the
   * Properties panel) to lock the context-sensitive UX appearance. This
   * is the second visual target: it captures that the RIGHT inspector
   * rendered for the user's intent (DOM chrome), complementing the
   * canvas-content checkpoint. CI-gated like {@link contentCheckpoint}
   * (DOM shots are more font/OS-sensitive — Linux baselines pending).
   */
  async chromeCheckpoint(
    name: string,
    selector = '[data-properties-panel="ready"]',
  ): Promise<void> {
    if (process.env.CI && process.env.JOURNEY_VISUAL !== "1") {
      // eslint-disable-next-line no-console
      console.log(`[journey] chrome checkpoint "${name}" skipped in CI`);
      return;
    }
    await expect(this.page.locator(selector)).toHaveScreenshot(`${name}.png`, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
  }

  /** Place a collapsed caret in a story (the content-selection state a
   *  Type-tool click produces), then drop DOM focus so the window-level
   *  text handler — not a panel input — receives keystrokes. */
  async placeCaret(storyId: string, offset = 0): Promise<void> {
    await setCaret(this.page, storyId, offset);
    await this.page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
  }

  /** Type through the REAL keyboard handler (useTextEditing). */
  async typeText(text: string): Promise<void> {
    await this.page.keyboard.type(text);
  }

  /** Select a text range (the content-selection state a drag / Cmd-A
   *  produces) — needed before changing a character property via a
   *  panel. Unlike {@link placeCaret} it does NOT blur, so the panel
   *  control can take focus. */
  async selectText(
    storyId: string,
    start: number,
    end: number,
  ): Promise<void> {
    await setCaret(this.page, storyId, start, end);
  }

  /**
   * GUI-DEEPENED — drive a real Properties-panel control by its binding
   * path (composition inputs carry `data-control="<path>"`), the way a
   * user edits a field: focus, type, commit with Enter. e.g.
   * `fillPanelControl("characterFontSize", 36)` types 36 into the
   * Character panel's size field.
   */
  async fillPanelControl(
    path: string,
    value: number | string,
  ): Promise<void> {
    const input = this.page.locator(`[data-control="${path}"] input`).first();
    await expect(input).toBeVisible();
    await input.fill(String(value));
    await input.press("Enter");
  }

  /** Apply a font size (points) to a text range — the everyday DTP
   *  styling action. Addresses the story via a `storyRange` ElementId. */
  async setFontSize(
    storyId: string,
    start: number,
    end: number,
    pt: number,
  ): Promise<void> {
    await mutate(this.page, {
      op: "setElementProperty",
      args: {
        elementId: { kind: "storyRange", id: { story_id: storyId, start, end } },
        path: "characterFontSize",
        value: { type: "length", value: pt },
      },
    });
  }

  /**
   * Export the built-from-scratch document to IDML and re-parse it
   * through the engine — proving the new document round-trips (Save As
   * IDML). Returns the byte length + the re-parsed page count.
   */
  async exportAndReload(): Promise<{ byteLength: number; pageCount: number }> {
    return this.page.evaluate(async () => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      const bytes = await c.client.exportIdml();
      const byteLength = bytes.length;
      const handle = await c.client.loadDocument(bytes);
      return { byteLength, pageCount: handle.pageCount };
    });
  }

  /** Story character count via paged.stories(). */
  async storyChars(storyId: string): Promise<number> {
    const out = await script(this.page, "paged.stories()");
    const stories = JSON.parse(out[0] ?? "[]") as Array<{
      selfId: string;
      characterCount: number;
    }>;
    return stories.find((s) => s.selfId === storyId)?.characterCount ?? 0;
  }

  /** Read a document collection (swatches, colorGroups, …). */
  async collection(name: string): Promise<Array<{ selfId: string }>> {
    return this.page.evaluate(
      (n) => (globalThis as unknown as CanvasGlobal).__canvas.client.collection(n),
      name,
    );
  }

  /** Read the layer list. */
  async layers(): Promise<
    Array<{ selfId: string; name?: string; visible?: boolean; locked?: boolean }>
  > {
    return this.page.evaluate(() =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.layers(),
    );
  }

  /** Create a process RGB swatch; returns its new selfId (usable as a
   *  colorRef for {@link applyFill}). */
  async createSwatch(
    name: string,
    rgb: [number, number, number],
  ): Promise<string> {
    const before = await this.collection("swatches");
    await mutate(this.page, {
      op: "createSwatch",
      args: {
        spec: {
          selfId: null,
          name,
          space: "RGB",
          value: rgb,
          model: "Process",
          alternateSpace: null,
          alternateValue: [],
          tint: null,
          alpha: null,
        },
      },
    });
    await expect
      .poll(async () => (await this.collection("swatches")).length)
      .toBeGreaterThan(before.length);
    const after = await this.collection("swatches");
    return after.find((s) => !before.some((b) => b.selfId === s.selfId))?.selfId ?? "";
  }

  /** Create an (empty) color group. */
  async createColorGroup(name: string): Promise<void> {
    await mutate(this.page, {
      op: "createColorGroup",
      args: { spec: { selfId: null, name, members: [] } },
    });
  }

  /** Create a linear gradient between the given stop swatches (the first
   *  at 0%, the last at 100%). Returns its new selfId — usable as a
   *  colorRef for {@link applyFill}. */
  async createGradient(name: string, stopSwatchIds: string[]): Promise<string> {
    const before = await this.collection("gradients");
    const stops = stopSwatchIds.map((stopColor, i) => ({
      stopColor,
      locationPct: i === 0 ? 0 : (i * 100) / (stopSwatchIds.length - 1),
      midpointPct: null,
    }));
    await mutate(this.page, {
      op: "createGradient",
      args: { spec: { selfId: null, name, kind: "Linear", stops } },
    });
    await expect
      .poll(async () => (await this.collection("gradients")).length)
      .toBeGreaterThan(before.length);
    const after = await this.collection("gradients");
    return after.find((g) => !before.some((b) => b.selfId === g.selfId))?.selfId ?? "";
  }

  /** Group several page items into one group; returns true when applied.
   *  `members` are ElementId refs ({kind,id}), the form the op expects. */
  async createGroup(
    members: Array<{ kind: string; id: string }>,
  ): Promise<boolean> {
    const reply = (await mutate(this.page, {
      op: "createGroup",
      args: { memberIds: members },
    })) as { kind?: string };
    return reply?.kind === "mutationApplied";
  }

  /** Count scene-tree elements of one kind. */
  async count(kind: string): Promise<number> {
    return treeCount(this.page, kind);
  }

  /** Insert a layer at `position`; returns its new selfId. */
  async addLayer(name: string, position = 0): Promise<string> {
    const before = await this.layers();
    await mutate(this.page, { op: "layerInsert", args: { position, name } });
    await expect
      .poll(async () => (await this.layers()).length)
      .toBeGreaterThan(before.length);
    const after = await this.layers();
    return after.find((l) => !before.some((b) => b.selfId === l.selfId))?.selfId ?? "";
  }

  /** Toggle a layer's visibility. */
  async setLayerVisible(layerId: string, visible: boolean): Promise<void> {
    await mutate(this.page, {
      op: "layerSetVisible",
      args: { layerId, visible },
    });
  }

  /** Assert the editor surfaced the expected context (the oracle). */
  async expectContext(exp: ExpectedContext): Promise<void> {
    await expectContext(this.page, exp);
  }
}
