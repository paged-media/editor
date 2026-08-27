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

// Colour management, worked (p64, B-Body verso).
//
// Four benches, each an op applied and then READ BACK through the
// document's own doors, with the read-back printed on the page in
// Spec Value — the page states what the document now says, not what
// the test hoped:
//
//   1. setColorSettings — a real ICC profile (core's default CMYK,
//      registered live) plus rendering intent and black-point
//      compensation; changing the working space changes what every
//      CMYK chip on this page PAINTS.
//   2. setProofSetup — the soft-proof condition, profile + paper
//      white + intent. Prepress state: it configures the proof, it
//      does not repaint a composite page.
//   3. setInkSetting — a fresh spot ink aliased to Vermilion, read
//      back from the inks collection. setUseStandardLabForSpots
//      rides the same bench.
//   4. setDocumentDefaults — and then a rectangle inserted with NO
//      property writes at all, which arrives already wearing the
//      defaults. That naked rectangle is the proof.

import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { CORE } from "../../chapter";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { chip, documentMeta } from "./00-support";

const PROFILE_NAME = "Paged Default CMYK";
const EMBER_ID = "Color/AnnualEmber";

/** One ink row as the inks collection reports it. */
interface InkRead {
  spotId: string;
  name: string;
  convertToProcess: boolean;
  aliasTo: string | null;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg = p(64);
  const elements: string[] = [];

  // ── 1. colour settings, with a real profile ──────────────────────
  // The profile bytes travel as base64 through one evaluate — 187 KB,
  // paid once. Registration is live: the CMM cache clears and every
  // CMYK swatch re-resolves through the new working space.
  const iccPath = pathResolve(CORE, "corpus", "profiles", "default_cmyk.icc");
  const iccB64 = readFileSync(iccPath).toString("base64");
  await page.evaluate(
    async ({ name, b64 }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              registerColorProfile: (
                name: string,
                bytes: Uint8Array,
              ) => Promise<void>;
            };
          };
        }
      ).__canvas;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      await c.client.registerColorProfile(name, bytes);
    },
    { name: PROFILE_NAME, b64: iccB64 },
  );
  await doc.mutate("setColorSettings", {
    cmykProfileName: PROFILE_NAME,
    rgbPolicy: null,
    intent: "Perceptual",
    bpc: true,
  });

  // ── 2. proof setup ───────────────────────────────────────────────
  await doc.mutate("setProofSetup", {
    profileName: PROFILE_NAME,
    simulatePaperWhite: true,
    intent: "RelativeColorimetric",
  });

  // ── 3. the ink manager ───────────────────────────────────────────
  // A second spot to manage: Annual Ember, aliased to Vermilion so the
  // two print on ONE plate. spotId on this door is the spot swatch's
  // own self id, and a non-spot is refused.
  await doc.mutate("createSwatch", {
    spec: {
      selfId: EMBER_ID,
      name: "Annual Ember",
      space: "CMYK",
      value: [0, 60, 100, 0],
      model: "Spot",
      alternateSpace: "CMYK",
      alternateValue: [0, 60, 100, 0],
      tint: null,
      alpha: null,
    },
  });
  const vermilionId = await doc.swatch(SWATCH.vermilion);
  await doc.mutate("setInkSetting", {
    spotId: EMBER_ID,
    convertToProcess: false,
    aliasTo: vermilionId,
  });
  await doc.mutate("setUseStandardLabForSpots", { enabled: true });

  // ── 4. document defaults, then the naked rectangle ───────────────
  const slateId = await doc.swatch(SWATCH.slate);
  const tintId = await doc.swatch(SWATCH.vermilionTint);
  await doc.mutate("setDocumentDefaults", {
    fillColor: tintId,
    strokeColor: slateId,
    strokeWeight: 1,
  });

  // ── the read-backs the page prints ───────────────────────────────
  const meta = await documentMeta(page);
  expect(meta.renderingIntent).toBe("Perceptual");
  expect(meta.blackPointCompensation).toBe(true);
  expect(meta.cmykProfileName).toBe(PROFILE_NAME);
  expect(meta.proofProfileName).toBe(PROFILE_NAME);
  expect(meta.useStandardLabForSpots).toBe(true);
  expect(meta.defaultFillColor).toBe(tintId);
  const inks = (await doc.designer.collection(
    "inks",
  )) as unknown as InkRead[];
  const ember = inks.find((i) => i.name === "Annual Ember");
  expect(ember?.aliasTo).toBe(vermilionId);

  // ── the page ─────────────────────────────────────────────────────
  const head = await proseFrame(ctx, pg, [60, 58, 492, 90], [
    { text: "The prepress bench", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const intro = await proseFrame(ctx, pg, [60, 96, 492, 158], [
    {
      text:
        "Everything on this page is a setting, not a shape. Each bench " +
        "below applies one management op and then prints what the document " +
        "reports back — the read is the exhibit. Where the effect lives at " +
        "the proof or the press rather than in this composite, the label " +
        "says so.",
      style: STYLE.body,
    },
  ]);
  elements.push(intro.frameId);

  const bench = async (
    y: number,
    title: string,
    lines: string[],
  ): Promise<void> => {
    const t = await proseFrame(ctx, pg, [60, y, 492, y + 24], [
      { text: title, style: STYLE.head2 },
    ]);
    const b = await proseFrame(
      ctx,
      pg,
      [60, y + 26, 492, y + 26 + lines.length * 14 + 12],
      lines.map((text) => ({ text, style: STYLE.specValue })),
    );
    elements.push(t.frameId, b.frameId);
  };

  await bench(164, "1 · setColorSettings", [
    `working CMYK profile — ${meta.cmykProfileName} (registered live, active: ${String(meta.cmykProfileActive ?? false)})`,
    `rendering intent — ${meta.renderingIntent} · black-point compensation — ${String(meta.blackPointCompensation)}`,
    "every CMYK chip in this chapter now resolves through this working space.",
  ]);

  await bench(254, "2 · setProofSetup", [
    `proof profile — ${meta.proofProfileName} · simulate paper white — ${String(meta.proofSimulatePaperWhite)}`,
    "proof intent — RelativeColorimetric. Prepress state: the soft proof reads it; a composite page does not repaint.",
  ]);

  await bench(330, "3 · setInkSetting + setUseStandardLabForSpots", [
    `Annual Ember (spot) — aliasTo ${ember?.aliasTo ?? "(none)"} · convertToProcess ${String(ember?.convertToProcess)}`,
    "two vermilions, one plate: the alias merges the separations at output time.",
    `useStandardLabForSpots — ${String(meta.useStandardLabForSpots)}: Lab-primary spots now paint from the standard Lab book values.`,
  ]);

  await bench(420, "4 · setDocumentDefaults", [
    `default fill — ${meta.defaultFillColor} · default stroke — ${meta.defaultStrokeColor} at ${String(meta.defaultStrokeWeight)} pt`,
    "the rectangle below was inserted with no property writes at all — it arrived wearing these defaults.",
  ]);

  // The naked rectangle: minted AFTER the defaults, styled by nobody.
  const naked = await doc.rectangle(ctx.pageIds[0], [60, 494, 200, 546]);
  await assignLayer(ctx, "rectangle", naked, LAYER.content);
  elements.push(naked);
  // Beside it, the ember chip the ink bench manages.
  elements.push(
    ...(await chip(
      ctx,
      pg,
      [232, 494, 294, 546],
      { id: EMBER_ID },
      [306, 494, 492, 558],
      "Annual Ember — the aliased spot, previewing through its CMYK build.",
    )),
  );
  const nakedCaption = await proseFrame(ctx, pg, [60, 552, 294, 604], [
    {
      text:
        "Born dressed: no fill or stroke was ever set on this rectangle.",
      style: STYLE.caption,
    },
  ]);
  elements.push(nakedCaption.frameId);

  await marginNote(
    ctx,
    pg,
    "Colour settings, proof setup, ink aliases and document defaults are app-level, non-undoable session state; their full effect belongs to the proof and the separations, and this composite carries only what repaints. → Appendix A",
  );
  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 93",
      "registerColorProfile",
      "setColorSettings · setProofSetup",
      "setInkSetting · setUseStandardLabForSpots",
      "setDocumentDefaults",
      "documentMeta + inks (live read-back)",
    ]),
  );

  return {
    title: "The prepress bench — colour management",
    covers: [
      "color-swatches.icc-cmm",
      "color-swatches.ink-manager",
      "color-swatches.document-defaults",
    ],
    elements,
  };
}
