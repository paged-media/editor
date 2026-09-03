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

// THE COLOPHON — p133/p134 (A·7/A·8), ending on the book's final
// verso. The numbers are READ, not remembered: the ledger fragments
// each chapter wrote at its close (whatever of them are present at
// THIS build — a solo run may hold few or none, and the page says so),
// the op and property-path universes the assembly diffs against, the
// container's live part count, and the installed engine package
// itself. Everything is labelled "as of this chapter's build; the
// assembly ledger is definitive", because a colophon that pretended
// to be the final tally before the final build would be the one
// dishonest page in the book.
//
// The last page carries a single centered line, and nothing else.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PROTOCOL_VERSION } from "@paged-media/client";

import { proseFrame, specLabel } from "../../annual-support";
import { APP_ROOT, CORE, LEDGER_DIR } from "../../chapter";
import { mergeFragments, opUniverse, propertyPathUniverse, readFragments } from "../../ledger";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { listParts } from "./00-support";

const FACES =
  "Source Serif 4 · Fraunces · Space Grotesk · EB Garamond · JetBrains Mono · Noto Sans Arabic · Noto Sans JP";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];

  // ── the numbers, read from what is present ───────────────────────
  const fragments = readFragments(LEDGER_DIR);
  const merged = mergeFragments(fragments);
  const rowsClaimed = new Set(merged.claims.flatMap((c) => c.covers));
  const families = new Map<string, number>();
  for (const id of rowsClaimed) {
    const fam = id.split(".")[0];
    families.set(fam, (families.get(fam) ?? 0) + 1);
  }
  const topFamilies = [...families.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([fam, n]) => `${fam} ×${n}`)
    .join(" · ");
  const ops = opUniverse();
  const opsUsed = [...merged.ops.keys()].filter((op) => ops.includes(op));
  const paths = propertyPathUniverse(CORE);
  const pathsUsed = [...merged.paths.keys()].filter((path) =>
    paths.includes(path),
  );
  const parts = await listParts(ctx.page, "paged/");
  const wasm = JSON.parse(
    readFileSync(
      join(APP_ROOT, "node_modules", "@paged-media", "canvas-wasm", "package.json"),
      "utf8",
    ),
  ) as { version: string };
  // The wire protocol is a property of the ENGINE, not of a version
  // string. Deriving it from `0.<protocol>.<patch>` printed "protocol 0"
  // the first time the book was built against a locally-built wasm —
  // a colophon that lied about the very thing it exists to record.
  // `PROTOCOL_VERSION` is the number the editor speaks, and CI
  // (`scripts/check-protocol-version.sh`) checks it against the
  // installed wasm, so it cannot drift from the engine in the package.
  const protocol = PROTOCOL_VERSION;
  notes.push(
    `colophon numbers — chapters ${fragments.length} · rows ${rowsClaimed.size} · ` +
      `ops ${opsUsed.length}/${ops.length} · paths ${pathsUsed.length}/${paths.length} · ` +
      `parts ${parts.length} · canvas-wasm ${wasm.version} (protocol ${protocol})`,
  );

  // ── A·7: the colophon ────────────────────────────────────────────
  const head = await proseFrame(ctx, p(133), [48, 54, 480, 88], [
    { text: "Colophon", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const ledgerLines: Array<{ text: string; style: string }> =
    fragments.length === 0
      ? [
          {
            text:
              "Chapters built — none recorded at this build: the ledger directory holds no chapter fragments (a solo run builds one chapter against the base fixture and writes its fragment only at its own close). The counts below that depend on fragments print as absent rather than invented.",
            style: STYLE.colophon,
          },
        ]
      : [
          {
            text: `Chapters built — ${fragments.length}, ${fragments[0].chapter} through ${fragments[fragments.length - 1].chapter}, each reloading its predecessor's .paged checkpoint through the ordinary open door.`,
            style: STYLE.colophon,
          },
          {
            text: `Registry rows claimed — ${rowsClaimed.size}, led by ${topFamilies}.`,
            style: STYLE.colophon,
          },
          {
            text: `Wire mutation ops exercised — ${opsUsed.length} of the capability table's ${ops.length}.`,
            style: STYLE.colophon,
          },
          {
            text: `Property paths written — ${pathsUsed.length} of the introspect catalog's ${paths.length}.`,
            style: STYLE.colophon,
          },
        ];

  const body = await proseFrame(ctx, p(133), [48, 100, 480, 560], [
    {
      text:
        "This annual was set by the engine it describes. Its numbers below are read at build time from the campaign's own records — the per-chapter ledger fragments, the capability table, the introspect catalog, the container itself — and none of them is typed from memory.",
      style: STYLE.bodyFirst,
    },
    ...ledgerLines,
    {
      text: `Container parts — ${parts.length} riding in this document's paged/ namespace as it stands on this page.`,
      style: STYLE.colophon,
    },
    {
      text: `The faces — seven families: ${FACES}.`,
      style: STYLE.colophon,
    },
    {
      text:
        "The measure — 540 × 720 pt trim, facing pages; a six-column body grid with 12 pt gutters on a 432 pt measure, twelve columns on the data pages, and a 13 pt baseline rhythm every leading in the style battery is a multiple of.",
      style: STYLE.colophon,
    },
    {
      text: `The toolchain — the paged engine at wire protocol ${protocol}, @paged-media/canvas-wasm ${wasm.version}, driven end to end through the editor's own mutation wire; no page in this book was drawn by anything else.`,
      style: STYLE.colophon,
    },
    {
      text:
        "As of this chapter's build; the assembly ledger is definitive.",
      style: STYLE.footnote,
    },
  ]);
  elements.push(body.frameId);

  elements.push(
    await specLabel(ctx, p(133), [
      "Specimen No. 195",
      "readFragments · opUniverse · propertyPathUniverse",
      "listPagedParts live",
    ]),
  );

  // ── A·8: the last page — one line, alone, centered ───────────────
  const last = await proseFrame(ctx, p(134), [60, 336, 492, 384], [
    { text: "Set entirely by the engine it describes.", style: STYLE.deck },
  ]);
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(
      last.storyId,
      0,
      "Set entirely by the engine it describes.".length,
    ),
    "paragraphJustification",
    { type: "text", value: "CenterAlign" },
  );
  elements.push(last.frameId);

  return {
    title: "Colophon — and the last line",
    covers: ["package-anatomy.paged-parts-door"],
    elements,
    notes,
  };
}
