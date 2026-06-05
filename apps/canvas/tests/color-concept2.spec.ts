// Concept 2 (protocol v25) — end-to-end smoke over the colour
// engine + panels, driven through the dev `window.__canvas.client`
// hook (real wasm dispatch) and the DOM for the panel surfaces.
// Covers: colorCompute (live mixer values + gamut), swatch
// edit/rename round-trip via editSwatch, gradient detail + whole-
// gradient edits, .ase import (the bundled HLC bytes) as ONE
// undoable op, ink manager settings (AC-8), colour settings +
// soft-proof round-trips via documentMeta.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/gradients.idml`;
const FIXTURE_FALLBACK = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

async function loadFixture(page: Page) {
  const { existsSync } = await import("node:fs");
  const path = existsSync(FIXTURE) ? FIXTURE : FIXTURE_FALLBACK;
  await page.setInputFiles('input[type="file"]', path);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
}

test.describe("Concept 2 — colour engine + panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadFixture(page);
  });

  test("colorCompute resolves arbitrary values across spaces", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              colorCompute: (a: {
                space: string;
                value: number[];
                tint?: number | null;
              }) => Promise<{
                rgbHex: string;
                cmyk: number[] | null;
                outOfGamut: boolean;
              }>;
            };
          };
        }
      ).__canvas;
      const lab = await c.client.colorCompute({
        space: "LAB",
        value: [50, 29.5, 5.2],
      });
      const cmyk = await c.client.colorCompute({
        space: "CMYK",
        value: [0, 50, 100, 0],
      });
      const tinted = await c.client.colorCompute({
        space: "CMYK",
        value: [100, 0, 0, 0],
        tint: 50,
      });
      return { lab, cmyk, tinted };
    });
    // Lab resolves analytically (not the grey placeholder).
    expect(result.lab.rgbHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.lab.rgbHex).not.toBe("#808080");
    // CMYK echoes the effective channels in percent.
    expect(result.cmyk.cmyk).toEqual([0, 50, 100, 0]);
    // Tint folds before resolution.
    expect(result.tinted.cmyk).toEqual([50, 0, 0, 0]);
  });

  test("swatch create → edit → rename round-trips through the raw channels", async ({
    page,
  }) => {
    const out = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{ kind: string }>;
              collection: (
                n: string,
              ) => Promise<{ selfId: string; name: string }[]>;
              colorPreview: (id: string) => Promise<{
                name: string;
                space?: string | null;
                value?: number[] | null;
                rgbHex: string;
              } | null>;
            };
          };
        }
      ).__canvas;
      // Create a Lab swatch (the lossless-seed case).
      await c.client.mutate({
        op: "createSwatch",
        args: {
          spec: {
            name: "Test Lab",
            space: "LAB",
            value: [50, 30, -20],
            model: "Process",
          },
        },
      });
      const created = (await c.client.collection("swatches")).find(
        (s) => s.name === "Test Lab",
      )!;
      const before = await c.client.colorPreview(created.selfId);
      // Edit the channels (the mixer's commit shape).
      await c.client.mutate({
        op: "editSwatch",
        args: {
          swatchId: created.selfId,
          spec: {
            selfId: created.selfId,
            name: "Test Lab",
            space: "LAB",
            value: [70, 10, 10],
            model: "Process",
          },
        },
      });
      const after = await c.client.colorPreview(created.selfId);
      // Rename only — channels must not move.
      await c.client.mutate({
        op: "editSwatch",
        args: {
          swatchId: created.selfId,
          spec: {
            selfId: created.selfId,
            name: "Renamed Lab",
            space: "LAB",
            value: [70, 10, 10],
            model: "Process",
          },
        },
      });
      const renamed = await c.client.colorPreview(created.selfId);
      return { before, after, renamed };
    });
    expect(out.before?.space).toBe("LAB");
    expect(out.before?.value).toEqual([50, 30, -20]);
    expect(out.after?.value).toEqual([70, 10, 10]);
    expect(out.after?.rgbHex).not.toBe(out.before?.rgbHex);
    expect(out.renamed?.name).toBe("Renamed Lab");
    expect(out.renamed?.rgbHex).toBe(out.after?.rgbHex);
  });

  test("gradient detail reads stops; editGradient round-trips stop edits", async ({
    page,
  }) => {
    const out = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{ kind: string }>;
              collection: (n: string) => Promise<{ selfId: string }[]>;
              colorPreview: (id: string) => Promise<unknown>;
              gradientDetail: (id: string) => Promise<{
                kind: string;
                stops: {
                  stopColorRef: string;
                  resolvedRgbHex: string;
                  locationPct: number;
                  midpointPct: number | null;
                }[];
              } | null>;
            };
          };
        }
      ).__canvas;
      // Ensure two swatches exist for the stops.
      await c.client.mutate({
        op: "createSwatch",
        args: {
          spec: {
            name: "GA",
            space: "CMYK",
            value: [100, 0, 0, 0],
            model: "Process",
          },
        },
      });
      await c.client.mutate({
        op: "createSwatch",
        args: {
          spec: {
            name: "GB",
            space: "CMYK",
            value: [0, 100, 0, 0],
            model: "Process",
          },
        },
      });
      const swatches = await c.client.collection("swatches");
      const a = swatches[swatches.length - 2].selfId;
      const b = swatches[swatches.length - 1].selfId;
      await c.client.mutate({
        op: "createGradient",
        args: {
          spec: {
            name: "Test Ramp",
            kind: "Linear",
            stops: [
              { stopColor: a, locationPct: 0, midpointPct: 30 },
              { stopColor: b, locationPct: 100 },
            ],
          },
        },
      });
      const gradients = await c.client.collection("gradients");
      const gid = gradients[gradients.length - 1].selfId;
      const before = await c.client.gradientDetail(gid);
      // Move the first stop + its midpoint (the ramp editor's commit).
      await c.client.mutate({
        op: "editGradient",
        args: {
          gradientId: gid,
          spec: {
            selfId: gid,
            name: "Test Ramp",
            kind: "Radial",
            stops: [
              { stopColor: a, locationPct: 10, midpointPct: 70 },
              { stopColor: b, locationPct: 90 },
            ],
          },
        },
      });
      const after = await c.client.gradientDetail(gid);
      return { before, after };
    });
    expect(out.before?.stops).toHaveLength(2);
    expect(out.before?.stops[0].midpointPct).toBe(30);
    expect(out.before?.stops[0].resolvedRgbHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(out.after?.kind).toBe("radial");
    expect(out.after?.stops[0].locationPct).toBe(10);
    expect(out.after?.stops[0].midpointPct).toBe(70);
  });

  test(".ase import lands swatches+group as ONE undoable op (HLC bytes)", async ({
    page,
  }) => {
    // Use the BUNDLED HLC asset — fetch its dev-server URL from the
    // app module graph by reading a small slice through the page.
    const out = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{ kind: string }>;
              collection: (
                n: string,
              ) => Promise<{ selfId: string; name: string }[]>;
              undo: () => Promise<unknown>;
            };
          };
        }
      ).__canvas;
      // Minimal hand-built ASEF (1 group, 2 LAB colours) — the
      // bundled-asset URL isn't importable from test scope, and the
      // wire path is identical.
      const enc = (s: string) => {
        const units: number[] = [];
        for (const ch of s) units.push(ch.charCodeAt(0));
        units.push(0);
        const out = [units.length >> 8, units.length & 0xff];
        for (const u of units) out.push(u >> 8, u & 0xff);
        return out;
      };
      const f32 = (v: number) => {
        const b = new ArrayBuffer(4);
        new DataView(b).setFloat32(0, v, false);
        return [...new Uint8Array(b)];
      };
      const color = (name: string, l: number, a: number, bb: number) => {
        const body = [
          ...enc(name),
          0x4c,
          0x41,
          0x42,
          0x20, // "LAB "
          ...f32(l / 100),
          ...f32(a),
          ...f32(bb),
          0,
          0, // global
        ];
        return [
          0x00,
          0x01,
          (body.length >> 24) & 0xff,
          (body.length >> 16) & 0xff,
          (body.length >> 8) & 0xff,
          body.length & 0xff,
          ...body,
        ];
      };
      const group = enc("HLC Test");
      const bytes = [
        0x41,
        0x53,
        0x45,
        0x46,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        4,
        0xc0,
        0x01,
        (group.length >> 24) & 0xff,
        (group.length >> 16) & 0xff,
        (group.length >> 8) & 0xff,
        group.length & 0xff,
        ...group,
        ...color("HLC H010_L50_C030", 50, 29.5, 5.2),
        ...color("HLC H090_L70_C040", 70, 0.0, 40.0),
        0xc0,
        0x02,
        0,
        0,
        0,
        0,
      ];
      const swatchesBefore = (await c.client.collection("swatches")).length;
      const reply = await c.client.mutate({
        op: "importSwatchLibrary",
        args: { bytes, groupName: null },
      });
      const swatchesAfter = await c.client.collection("swatches");
      const groups = await c.client.collection("colorGroups");
      await c.client.undo();
      const swatchesUndone = (await c.client.collection("swatches")).length;
      return {
        kind: reply.kind,
        before: swatchesBefore,
        after: swatchesAfter.length,
        names: swatchesAfter.map((s) => s.name),
        groups: groups.map((g) => g.name),
        undone: swatchesUndone,
      };
    });
    expect(out.kind).toBe("mutationApplied");
    expect(out.after).toBe(out.before + 2);
    expect(out.names).toContain("HLC H010_L50_C030");
    expect(out.groups).toContain("HLC Test");
    expect(out.undone).toBe(out.before);
  });

  test("ink settings + standard-Lab toggle round-trip (AC-8)", async ({
    page,
  }) => {
    const out = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{ kind: string }>;
              collection: (n: string) => Promise<
                {
                  spotId?: string;
                  name: string;
                  convertToProcess?: boolean;
                }[]
              >;
              documentMeta: () => Promise<{
                useStandardLabForSpots?: boolean | null;
              }>;
            };
          };
        }
      ).__canvas;
      // Create a spot swatch so the ink list has a row.
      await c.client.mutate({
        op: "createSwatch",
        args: {
          spec: {
            name: "Spot Test",
            space: "LAB",
            value: [48, 64, 47],
            model: "Spot",
            alternateSpace: "CMYK",
            alternateValue: [0, 91, 76, 0],
          },
        },
      });
      const inks = await c.client.collection("inks");
      const spot = inks.find((i) => i.name === "Spot Test")!;
      await c.client.mutate({
        op: "setInkSetting",
        args: { spotId: spot.spotId, convertToProcess: true, aliasTo: null },
      });
      const after = (await c.client.collection("inks")).find(
        (i) => i.name === "Spot Test",
      )!;
      await c.client.mutate({
        op: "setUseStandardLabForSpots",
        args: { enabled: true },
      });
      const meta = await c.client.documentMeta();
      return {
        converted: after.convertToProcess,
        standardLab: meta.useStandardLabForSpots,
      };
    });
    expect(out.converted).toBe(true);
    expect(out.standardLab).toBe(true);
  });

  test("colour settings + soft-proof surface through documentMeta", async ({
    page,
  }) => {
    const out = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (
                m: unknown,
              ) => Promise<{ kind: string; payload?: unknown }>;
              documentMeta: () => Promise<{
                renderingIntent?: string | null;
                blackPointCompensation?: boolean | null;
                proofProfileName?: string | null;
              }>;
            };
          };
        }
      ).__canvas;
      // Intent/BPC are settable without a profile.
      await c.client.mutate({
        op: "setColorSettings",
        args: {
          cmykProfileName: null,
          rgbPolicy: null,
          intent: "Perceptual",
          bpc: false,
        },
      });
      const meta = await c.client.documentMeta();
      // Unknown profile names fail loudly.
      const bad = await c.client.mutate({
        op: "setColorSettings",
        args: {
          cmykProfileName: "No Such Profile",
          rgbPolicy: null,
          intent: null,
          bpc: null,
        },
      });
      // Proof with an unregistered profile also fails.
      const badProof = await c.client.mutate({
        op: "setProofSetup",
        args: {
          profileName: "No Such Profile",
          simulatePaperWhite: false,
          intent: null,
        },
      });
      return { meta, bad: bad.kind, badProof: badProof.kind };
    });
    expect(out.meta.renderingIntent).toBe("Perceptual");
    expect(out.meta.blackPointCompensation).toBe(false);
    expect(out.bad).toBe("mutationFailed");
    expect(out.badProof).toBe("mutationFailed");
  });

  test("panels mount: mixer, ink manager, colour settings, libraries menu", async ({
    page,
  }) => {
    // Color panel hosts the mixer (activate its dock tab first).
    await openPanel(page, "paged.color");
    await expect(page.locator('[data-color-mixer="ready"]')).toBeVisible();
    await expect(page.locator("[data-mixer-preview]")).toBeVisible();
    // Swatches panel: grid + libraries menu with attribution.
    await openPanel(page, "paged.swatches");
    await expect(
      page.locator('[data-swatch-collection="ready"]'),
    ).toBeVisible();
    await page.locator('[data-action="open-libraries"]').click();
    await expect(page.locator("[data-libraries-menu]")).toBeVisible();
    await expect(page.locator("[data-hlc-attribution]")).toContainText(
      "freieFarbe",
    );
    await expect(
      page.locator('[data-library-id="hlc-colour-atlas"]'),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    // Soft-proof toggle present in the rail foot (off by default).
    await expect(page.locator('[data-soft-proof="off"]')).toBeVisible();
  });
});
