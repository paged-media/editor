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

// Shared vocabulary for the colour chapter (165). Geometry follows the
// annual contract (AUTHORING.md "Geometry order"): boxes handed to the
// driver/annual-support helpers are page-space (x0, y0, x1, y1).

import type { Page } from "@playwright/test";

import { plate, proseFrame } from "../../annual-support";
import { LAYER, STYLE } from "../../names-annual";
import type { ShowcaseDoc } from "../../driver";
import type { PageContext } from "../../types";

/** Run `fn` with its ops tallied as transient (demonstrated-then-removed). */
export async function transient<T>(
  doc: ShowcaseDoc,
  fn: () => Promise<T>,
): Promise<T> {
  if (doc.ledger) return doc.ledger.transient(fn);
  return fn();
}

/** One swatch entry as the swatches collection reports it. */
export interface SwatchRead {
  selfId: string;
  name: string;
  kind: string;
}

export async function swatchList(doc: ShowcaseDoc): Promise<SwatchRead[]> {
  return (await doc.designer.collection("swatches")) as unknown as SwatchRead[];
}

/** One colour group as the colorGroups collection reports it. */
export interface GroupRead {
  selfId: string;
  name: string;
  members: string[];
}

export async function groupList(doc: ShowcaseDoc): Promise<GroupRead[]> {
  return (await doc.designer.collection(
    "colorGroups",
  )) as unknown as GroupRead[];
}

/** The document meta the colour-management ops write into. */
export interface MetaRead {
  cmykProfileName?: string | null;
  cmykProfileActive?: boolean;
  renderingIntent?: string | null;
  blackPointCompensation?: boolean | null;
  proofProfileName?: string | null;
  proofSimulatePaperWhite?: boolean | null;
  useStandardLabForSpots?: boolean | null;
  defaultFillColor?: string | null;
  defaultStrokeColor?: string | null;
  defaultStrokeWeight?: number | null;
}

export async function documentMeta(page: Page): Promise<MetaRead> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { documentMeta: () => Promise<unknown> } };
      }
    ).__canvas;
    return (await c.client.documentMeta()) as never;
  });
}

/**
 * A labeled swatch chip: the filled plate on the Content layer plus a
 * caption beside or below it. Returns both element ids.
 */
export async function chip(
  ctx: PageContext,
  pageIndex: number,
  box: [number, number, number, number],
  swatchIdOrName: { name: string } | { id: string },
  captionBox: [number, number, number, number],
  captionText: string,
  captionStyle: string = STYLE.caption,
): Promise<string[]> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(pageIndex)];
  let plateId: string;
  if ("name" in swatchIdOrName) {
    plateId = await plate(ctx, pageIndex, box, swatchIdOrName.name, LAYER.content);
  } else {
    plateId = await doc.rectangle(pageId, box);
    await doc.setProperty("rectangle", plateId, "frameFillColor", {
      type: "colorRef",
      value: swatchIdOrName.id,
    });
    await doc.setProperty("rectangle", plateId, "itemLayer", {
      type: "text",
      value: await doc.layerId(LAYER.content),
    });
  }
  const caption = await proseFrame(ctx, pageIndex, captionBox, [
    { text: captionText, style: captionStyle },
  ]);
  return [plateId, caption.frameId];
}
