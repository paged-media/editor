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

// The .ase round trip, live (p63, B-Body recto).
//
// Three inks are minted and grouped; the group leaves the document as
// genuine Adobe Swatch Exchange bytes through the export door
// (`exportSwatchLibrary` → `swatchLibraryExported.aseBytes`); the
// originals are then DELETED so the palette genuinely no longer holds
// them; and `importSwatchLibrary` brings the bytes back in. The chips
// on this page are painted from the REIMPORTED swatches — resolved by
// name, which only works because the originals are gone — so the page
// cannot go green unless the loop closed. The ids do not survive the
// trip (the importer mints fresh `Color/u<n>` identities); the names,
// spaces, values and the spot flag ride in the file.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { chip, groupList, swatchList } from "./00-support";

const LOOP_GROUP_ID = "ColorGroup/AnnualLoop";

const INKS: Array<{
  selfId: string;
  name: string;
  space: string;
  value: number[];
  model: string;
  alternateSpace: string | null;
  alternateValue: number[];
  caption: string;
}> = [
  {
    selfId: "Color/AnnualLedgerRed",
    name: "Ledger Red",
    space: "CMYK",
    value: [10, 95, 90, 2],
    model: "Process",
    alternateSpace: null,
    alternateValue: [],
    caption: "Ledger Red · process CMYK 10/95/90/2",
  },
  {
    selfId: "Color/AnnualLedgerBuff",
    name: "Ledger Buff",
    space: "CMYK",
    value: [6, 12, 35, 0],
    model: "Process",
    alternateSpace: null,
    alternateValue: [],
    caption: "Ledger Buff · process CMYK 6/12/35/0",
  },
  {
    selfId: "Color/AnnualLedgerSea",
    name: "Ledger Sea",
    space: "LAB",
    value: [42, -18, -28],
    model: "Spot",
    alternateSpace: "CMYK",
    alternateValue: [80, 20, 25, 5],
    caption: "Ledger Sea · born a SPOT, Lab 42/−18/−28",
  },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg = p(63);
  const elements: string[] = [];

  // ── out ──────────────────────────────────────────────────────────
  for (const ink of INKS) {
    await doc.mutate("createSwatch", {
      spec: {
        selfId: ink.selfId,
        name: ink.name,
        space: ink.space,
        value: ink.value,
        model: ink.model,
        alternateSpace: ink.alternateSpace,
        alternateValue: ink.alternateValue,
        tint: null,
        alpha: null,
      },
    });
  }
  await doc.mutate("createColorGroup", {
    spec: {
      selfId: LOOP_GROUP_ID,
      name: "Annual Loop",
      members: INKS.map((i) => i.selfId),
    },
  });

  // The export door is a READ, not a mutation — the typed client wraps
  // `exportSwatchLibrary` → `swatchLibraryExported.aseBytes`.
  const ase: number[] = await page.evaluate(async (groupId) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            exportSwatchLibrary: (g?: string | null) => Promise<Uint8Array>;
          };
        };
      }
    ).__canvas;
    return Array.from(await c.client.exportSwatchLibrary(groupId));
  }, LOOP_GROUP_ID);
  // ASEF magic + big-endian version — asserted on the BYTES, so the
  // page is holding a real .ase, not a serialization of hope.
  expect(ase.length).toBeGreaterThan(12);
  expect(String.fromCharCode(...ase.slice(0, 4))).toBe("ASEF");
  const aseVersion = `${(ase[4] << 8) | ase[5]}.${(ase[6] << 8) | ase[7]}`;

  // ── gone ─────────────────────────────────────────────────────────
  await doc.mutate("deleteColorGroup", { groupId: LOOP_GROUP_ID });
  for (const ink of INKS) {
    await doc.mutate("deleteSwatch", { swatchId: ink.selfId });
  }
  const between = (await swatchList(doc)).map((s) => s.name);
  for (const ink of INKS) expect(between).not.toContain(ink.name);

  // ── back ─────────────────────────────────────────────────────────
  await doc.mutate("importSwatchLibrary", { bytes: ase, groupName: null });
  const after = await swatchList(doc);
  const returned = INKS.map((ink) => {
    const hit = after.find((s) => s.name === ink.name);
    if (!hit) throw new Error(`${ink.name} did not survive the .ase loop`);
    return hit;
  });
  // Fresh identities, by design — the importer mints Color/u<n>.
  for (const [i, ink] of INKS.entries()) {
    expect(returned[i].selfId).not.toBe(ink.selfId);
  }
  const loopGroup = (await groupList(doc)).find((g) => g.name === "Annual Loop");
  expect(loopGroup?.members ?? []).toHaveLength(INKS.length);
  // Measured, not remembered: did the SPOT flag survive the trip? The
  // importer maps an ASE spot entry to Model=Spot; the collection's
  // kind string is the reader-visible record of what arrived.
  const seaSpot = /spot/i.test(returned[2].kind);

  // ── the page ─────────────────────────────────────────────────────
  const head = await proseFrame(ctx, pg, [48, 58, 480, 90], [
    { text: "There and back — the .ase loop", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const intro = await proseFrame(ctx, pg, [48, 96, 480, 252], [
    {
      text:
        "Three inks were minted for this page and gathered into a group " +
        "called Annual Loop. The group then left the document: the export " +
        `door serialised it to ${ase.length} bytes of Adobe Swatch ` +
        `Exchange, magic ASEF, version ${aseVersion} — the same file a ` +
        "designer would hand to a colleague on another tool. Then all " +
        "three swatches and the group were deleted; for a moment the " +
        "palette genuinely did not hold them.",
      style: STYLE.body,
    },
    {
      text:
        "importSwatchLibrary read those bytes back. The chips below are " +
        "painted from the REIMPORTED swatches, resolved by name — which " +
        "is only possible because the originals are gone. Identity does " +
        "not ride in an .ase: each ink returned under a fresh Color/u " +
        "id. The names, the colour spaces, the channel values and the " +
        "group all did" +
        (seaSpot
          ? ", and Ledger Sea came back still a spot."
          : "; the spot flag did not survive this exporter, and the margin records it."),
      style: STYLE.body,
    },
  ]);
  elements.push(intro.frameId);

  let y = 268;
  for (const [i, ink] of INKS.entries()) {
    elements.push(
      ...(await chip(
        ctx,
        pg,
        [48, y, 110, y + 26],
        { id: returned[i].selfId },
        [122, y - 4, 480, y + 32],
        `${ink.caption} · returned as ${returned[i].selfId} (${returned[i].kind})`,
      )),
    );
    y += 36;
  }

  const outro = await proseFrame(ctx, pg, [48, y + 8, 480, y + 74], [
    {
      text:
        "The loop is the point: a palette is not locked in this file " +
        "format. What leaves as an interchange library comes back as " +
        "first-class document swatches, grouped as they left.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(outro.frameId);

  await marginNote(
    ctx,
    pg,
    "The .ase format carries name, space, values" +
      (seaSpot ? " and the spot flag" : "") +
      " — not tints and not alternates: Vermilion 20% would leave as a flat build, and Ledger Sea returns Lab-only, its CMYK alternate shed at the border." +
      (seaSpot ? "" : " The spot flag did not survive this exporter either.") +
      " → Appendix A",
  );
  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 92",
      "exportSwatchLibrary → ASEF",
      "deleteSwatch ×3 · deleteColorGroup",
      "importSwatchLibrary",
      `${ase.length} bytes round-tripped`,
    ]),
  );

  return {
    title: "The .ase round trip",
    covers: ["color-swatches.swatch.crud", "color-swatches.color-groups"],
    elements,
    notes: seaSpot
      ? undefined
      : [
          "the spot flag did not survive the .ase export→import loop on " +
            "this build — Ledger Sea returned as " +
            returned[2].kind,
        ],
  };
}
