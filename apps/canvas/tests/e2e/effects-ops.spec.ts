// E2E op suite — Effects panel apply layer (W2.2). Each per-effect
// disclosure the panel ships emits a `setElementProperty` per field;
// this proves the whole family round-trips through the document the
// canvas renders.
//
// Sandwich per family: enable (the pill's `frame*Enabled` / the
// legacy `frameDropShadow` bool) → set one representative field →
// assert both land + the affected region repaints → undo ×2 (field +
// enable) restores the model byte-for-byte and the canvas
// byte-identically → redo returns the effect.
//
// Targets the geometry fixture's rectangle — the kind whose apply
// arms reach every frame-effect struct (Rectangle / Oval / TextFrame).
// Effects bleed outside the fill box (shadow/glow/feather), so no
// containment assertion.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpElement } from "./harness/model-dump";
import { opSandwich, type PtRect } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

/** Read one PropertyEntry's value from elementProperties. */
async function readProp(
  page: Page,
  ref: ElementRef,
  path: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ id, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: unknown }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  );
}

interface EffectCase {
  label: string;
  /** The pill's enable bool path. */
  enablePath: string;
  /** A representative per-field path the disclosure writes. */
  fieldPath: string;
  /** A Value the field accepts. */
  fieldValue: { type: string; value: unknown };
  /** Assert the field read-back equals what we set. */
  assertField: (v: unknown) => void;
  /** KNOWN engine render gap — the effect round-trips on the wire
   *  (model + undo asserted) but core's frame effect compositor does
   *  not paint it yet, so the frame repaints with NO pixel delta.
   *  noRenderChange asserts zero pixels and flips loudly the day core
   *  wires the effect. */
  renderGap?: boolean;
}

const EFFECT_CASES: EffectCase[] = [
  {
    label: "inner shadow",
    enablePath: "frameInnerShadowEnabled",
    fieldPath: "frameInnerShadowSize",
    fieldValue: { type: "length", value: 9 },
    assertField: (v) => expect((v as { value: number }).value).toBe(9),
  },
  {
    label: "outer glow",
    enablePath: "frameOuterGlowEnabled",
    fieldPath: "frameOuterGlowSize",
    fieldValue: { type: "length", value: 7 },
    assertField: (v) => expect((v as { value: number }).value).toBe(7),
    // Sibling effects (drop/inner shadow, bevel, satin, feather)
    // composite, but core's effect path doesn't paint the glow blur
    // yet — model + undo round-trip, render is a known gap.
    renderGap: true,
  },
  {
    label: "inner glow",
    enablePath: "frameInnerGlowEnabled",
    fieldPath: "frameInnerGlowSize",
    fieldValue: { type: "length", value: 6 },
    assertField: (v) => expect((v as { value: number }).value).toBe(6),
    // Same glow render gap as outer glow.
    renderGap: true,
  },
  {
    label: "bevel and emboss",
    enablePath: "frameBevelEnabled",
    fieldPath: "frameBevelDepth",
    fieldValue: { type: "length", value: 80 },
    assertField: (v) => expect((v as { value: number }).value).toBe(80),
  },
  {
    label: "satin",
    enablePath: "frameSatinEnabled",
    fieldPath: "frameSatinSize",
    fieldValue: { type: "length", value: 18 },
    assertField: (v) => expect((v as { value: number }).value).toBe(18),
  },
  {
    label: "feather",
    enablePath: "frameFeatherEnabled",
    fieldPath: "frameFeatherWidth",
    fieldValue: { type: "length", value: 8 },
    assertField: (v) => expect((v as { value: number }).value).toBe(8),
  },
  {
    label: "directional feather",
    enablePath: "frameDirectionalFeatherEnabled",
    fieldPath: "frameDirectionalFeatherLeftWidth",
    fieldValue: { type: "length", value: 12 },
    assertField: (v) => expect((v as { value: number }).value).toBe(12),
  },
];

test.describe("E2E effects op round-trips", () => {
  let fx: LoadedFixture;
  let rect: ElementRef;
  let pageInfo: { pageId: string; widthPt: number };
  let region: PtRect;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    rect = fx.firstRectangle!;
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    pageInfo = fx.pages[target.pageIndex];
    region = (await elementPageRectPt(page, rect))!;
  });

  // Drop shadow — the original live family; enable rides the legacy
  // `frameDropShadow` bool, fields ride `frameDropShadow*`.
  test("AC-E2E-FX-drop — enable + size land, undo ×2 restores", async ({
    page,
  }) => {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      undoSteps: 2,
      dumpModel: () => dumpElement(page, rect),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: rect,
            path: "frameDropShadow",
            value: { type: "bool", value: true },
          },
        });
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: rect,
            path: "frameDropShadowSize",
            value: { type: "length", value: 11 },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, rect, "frameDropShadow")) as {
              value: boolean;
            }
          ).value,
        ).toBe(true);
        expect(
          (
            (await readProp(page, rect, "frameDropShadowSize")) as {
              value: number;
            }
          ).value,
        ).toBe(11);
      },
    });
  });

  for (const c of EFFECT_CASES) {
    test(`AC-E2E-FX-${c.label.replace(/\s+/g, "-")} — enable + field land, undo ×2 restores`, async ({
      page,
    }) => {
      await opSandwich(page, {
        pageId: pageInfo.pageId,
        pageWidthPt: pageInfo.widthPt,
        region,
        containment: false,
        undoSteps: 2,
        noRenderChange: c.renderGap ?? false,
        dumpModel: () => dumpElement(page, rect),
        apply: async () => {
          await mutate(page, {
            op: "setElementProperty",
            args: {
              elementId: rect,
              path: c.enablePath,
              value: { type: "bool", value: true },
            },
          });
          await mutate(page, {
            op: "setElementProperty",
            args: { elementId: rect, path: c.fieldPath, value: c.fieldValue },
          });
        },
        expectModel: async () => {
          expect(
            (
              (await readProp(page, rect, c.enablePath)) as { value: boolean }
            ).value,
          ).toBe(true);
          c.assertField(await readProp(page, rect, c.fieldPath));
        },
      });
    });
  }
});
