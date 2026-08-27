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

// The format gallery (p72–p73) — the SAME 800 × 534 apples photograph
// through every raster codec the engine decodes: PNG, WebP, TIFF
// (LZW), GIF (adaptive 256), BMP, and a CMYK JPEG with core's default
// CMYK profile embedded. Identical frames, identical subject — so the
// only thing that differs between exhibits is the codec, which is the
// comparison the spread exists to make. Every placement goes in as
// INLINE bytes (the lane that survives the container round trip), and
// `replaceImageBytes` throwing on any of the six would fail the build:
// a green page IS six successful decodes.
//
// The seventh exhibit is the EPS, and the exhibit IS the refusal: the
// engine recognises the format and deliberately does not decode it —
// no PostScript interpreter exists, by declaration — so the frame
// renders its own fill and the label says exactly that.

import { statSync } from "node:fs";

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  ASSETS,
  attemptReplaceBytes,
  derived,
  replaceBytesFromFile,
} from "./00-support";
import { resolve as pathResolve } from "node:path";

/** Exhibit frame size: the image's own 800:534 at a 200 pt width. */
const W = 200;
const H = (200 * 534) / 800;

interface Exhibit {
  file: string;
  uri: string;
  name: string;
  facts: string;
}

const EXHIBITS: Exhibit[] = [
  {
    file: derived("apples.png"),
    uri: "assets/photos/derived/apples.png",
    name: "PNG",
    facts: "8-bit/channel RGB, lossless filters + DEFLATE. The reference print of the six.",
  },
  {
    file: derived("apples.webp"),
    uri: "assets/photos/derived/apples.webp",
    name: "WebP",
    facts: "VP8 lossy, YUV 4:2:0 — an eighth of the PNG's bytes; the chroma carries the cost.",
  },
  {
    file: derived("apples.tif"),
    uri: "assets/photos/derived/apples.tif",
    name: "TIFF",
    facts: "LZW, 8-bit RGB, little-endian — the prepress workhorse, lossless like the PNG.",
  },
  {
    file: derived("apples.gif"),
    uri: "assets/photos/derived/apples.gif",
    name: "GIF",
    facts: "87a, one adaptive 256-colour palette. Look at the apples' shoulders: continuous tone posterises where PNG keeps it smooth.",
  },
  {
    file: derived("apples.bmp"),
    uri: "assets/photos/derived/apples.bmp",
    name: "BMP",
    facts: "Windows 3.x, 24-bit, uncompressed — every pixel spelled out; the largest file for the same picture.",
  },
  {
    file: derived("apples-cmyk.jpg"),
    uri: "assets/photos/derived/apples-cmyk.jpg",
    name: "CMYK JPEG",
    facts: "baseline DCT, FOUR components, core's default CMYK profile embedded — decoded through the ICC lane, not assumed sRGB.",
  },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg72 = ctx.pageIds[0];
  const pg73 = ctx.pageIds[1];
  const elements: string[] = [];
  const notes: string[] = [];

  const beforeRecto = await doc.renderPage(p(73));

  // ── furniture ────────────────────────────────────────────────────
  const head = await proseFrame(ctx, p(72), [60, 58, 492, 88], [
    { text: "One photograph, six codecs", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(72), [60, 92, 492, 156], [
    {
      text:
        "Every exhibit on this spread is the same 800 × 534 photograph in " +
        "an identically sized frame; only the encoding differs. All six " +
        "went into the document as inline bytes and were decoded by the " +
        "engine itself — a page this green is six codecs answering. The " +
        "differences worth a loupe are qualitative and stated per label.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the six placements ───────────────────────────────────────────
  const place = async (
    pageIndex: number,
    pageId: string,
    box: [number, number, number, number],
    ex: Exhibit,
  ): Promise<void> => {
    const frame = await doc.rectangle(pageId, box);
    await assignLayer(ctx, "rectangle", frame, LAYER.content);
    await doc.mutate("placeImage", { elementId: frame, uri: ex.uri, fit: null });
    const bytes = await replaceBytesFromFile(ctx, frame, ex.file);
    const caption = await proseFrame(
      ctx,
      pageIndex,
      [box[0], box[3] + 6, box[0] + W, box[3] + 62],
      [
        {
          text: `${ex.name} · ${bytes.toLocaleString("en-US")} bytes · ${ex.facts}`,
          style: STYLE.specValue,
        },
      ],
    );
    elements.push(frame, caption.frameId);
  };

  // p72 — PNG, WebP, TIFF.
  await place(p(72), pg72, [60, 166, 60 + W, 166 + H], EXHIBITS[0]);
  await place(p(72), pg72, [292, 166, 292 + W, 166 + H], EXHIBITS[1]);
  await place(p(72), pg72, [60, 372, 60 + W, 372 + H], EXHIBITS[2]);
  const parity = await proseFrame(ctx, p(72), [292, 372, 492, 540], [
    {
      text:
        "Same pixels, five sizes: the byte counts on these labels are " +
        "read from the committed files at build time, not typed. PNG, " +
        "TIFF and BMP are lossless siblings — their renders should be " +
        "indistinguishable. WebP trades chroma for an order of " +
        "magnitude; GIF trades the whole palette.",
      style: STYLE.body,
    },
  ]);
  elements.push(parity.frameId);

  // p73 — GIF, BMP, CMYK JPEG, and the EPS.
  await place(p(73), pg73, [48, 166, 48 + W, 166 + H], EXHIBITS[3]);
  await place(p(73), pg73, [280, 166, 280 + W, 166 + H], EXHIBITS[4]);
  await place(p(73), pg73, [48, 372, 48 + W, 372 + H], EXHIBITS[5]);

  // ── the EPS — the honest refusal ─────────────────────────────────
  const epsPath = pathResolve(ASSETS, "annual-legacy.eps");
  const epsBox: [number, number, number, number] = [280, 372, 280 + W, 372 + H];
  const eps = await doc.rectangle(pg73, epsBox);
  await assignLayer(ctx, "rectangle", eps, LAYER.content);
  await doc.batch([
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: eps },
        path: "frameFillColor",
        value: { type: "colorRef", value: await doc.swatch(SWATCH.paperWarm) },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: eps },
        path: "frameStrokeColor",
        value: { type: "colorRef", value: await doc.swatch(SWATCH.slate) },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: eps },
        path: "frameStrokeWeight",
        value: { type: "length", value: 0.75 },
      },
    },
  ]);
  await doc.mutate("placeImage", {
    elementId: eps,
    uri: "assets/annual-legacy.eps",
    fit: null,
  });
  const epsOutcome = await attemptReplaceBytes(ctx, eps, epsPath);
  notes.push(
    epsOutcome.kind === "mutationApplied"
      ? "EPS bytes: the store accepted them (the wire is format-agnostic); " +
        "the RENDER declines the decode and falls back to the frame's own " +
        "fill — which is the exhibit"
      : `EPS bytes refused at the wire: ${epsOutcome.error ?? epsOutcome.kind}`,
  );
  const epsCaption = await proseFrame(
    ctx,
    p(73),
    [280, epsBox[3] + 6, 480, epsBox[3] + 74],
    [
      {
        text:
          `□ EPS · ${statSync(epsPath).size.toLocaleString("en-US")} bytes of ` +
          "EPSF-3.0 · recognised, NOT decoded — there is no PostScript " +
          "interpreter, by declaration. What you see is the frame's own " +
          "fill standing in: the honest render of content that exists but " +
          "cannot be rasterised.",
        style: STYLE.specValue,
      },
    ],
  );
  elements.push(eps, epsCaption.frameId);

  // The facing page carries half the gallery — its pixels must have
  // moved before the apparatus lands, so the change is the exhibits'.
  await doc.expectRenderChanged(p(73), beforeRecto);

  await marginNote(
    ctx,
    p(73),
    "EPS is recognised, not decoded (no PostScript interpreter, by declaration): the frame renders its own fill rather than a false missing-image badge over content that is present. → Appendix A",
  );
  elements.push(
    await specLabel(ctx, p(72), [
      "Specimen No. 111",
      "replaceImageBytes: PNG · WebP · TIFF",
      "inline bytes — the persistent lane",
    ]),
    await specLabel(ctx, p(73), [
      "Specimen No. 112",
      "replaceImageBytes: GIF · BMP · CMYK-JPEG (ICC)",
      "EPS — the honest non-decode",
    ]),
  );

  return {
    title: "The format gallery",
    covers: [
      "images-graphics.placed-images",
      "images-graphics.cmyk-jpeg-icc",
      "images-graphics.eps-decode",
    ],
    elements,
    notes,
  };
}
