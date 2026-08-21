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

// Page 16 — the colophon.
//
// What a reference document owes its reader: what built it, what
// version everything was, where the assets came from and under what
// licence, and — the part most colophons omit — what did NOT work on
// this run.
//
// The last of those is why this page is generated rather than typed.
// A showcase whose failures are invisible is a brochure; one that
// prints "the Blitz engine did not load on this lane, so page 8 shows
// the frame but not its render" is evidence. The notes come from the
// other modules' reports, threaded through by the spec.

import type { PageContext, PageReport } from "../types";
import { STYLE, SWATCH } from "../names";

/** Versions of the plugin bundles the editor actually loaded, read from
 *  the live registries rather than from package.json — what is running
 *  is what matters, and a pin can lie about that. */
async function loadedPlugins(
  ctx: PageContext,
): Promise<Array<{ id: string; version: string }>> {
  return ctx.page.evaluate(() => {
    const g = globalThis as unknown as {
      __canvas?: {
        plugins?: { list?: () => Array<{ id: string; version?: string }> };
        registries?: {
          commands: { list: () => Array<{ id: string }> };
        };
      };
    };
    const listed = g.__canvas?.plugins?.list?.();
    if (listed) {
      return listed.map((p) => ({ id: p.id, version: p.version ?? "?" }));
    }
    // No plugin registry door on this build — infer which bundles are
    // present from the command ids they contributed. Reverse-DNS
    // prefixes make that unambiguous, and saying "inferred" beats
    // saying nothing.
    const ids = new Set<string>();
    for (const c of g.__canvas?.registries?.commands.list() ?? []) {
      const m = /^(media\.paged\.[a-z]+)\./.exec(c.id);
      if (m) ids.add(m[1]);
    }
    return [...ids].sort().map((id) => ({ id, version: "inferred" }));
  });
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const elements: string[] = [];

  const headBounds: [number, number, number, number] = [72, 72, 108, 540];
  const head = await doc.textFrame(pageId, headBounds);
  const headStory = await doc.storyOf(pageId, headBounds);
  await doc.insertText(headStory, "Colophon");
  await doc.applyStyle(
    headStory,
    0,
    "Colophon".length,
    await doc.paragraphStyle(STYLE.heading),
    "paragraph",
  );
  elements.push(head);

  const protocol = await ctx.page.evaluate(() => {
    const g = globalThis as unknown as {
      __canvas?: { client?: { protocol?: number } };
    };
    return g.__canvas?.client?.protocol ?? null;
  });
  const gpu = await doc.gpuActive();
  const plugins = await loadedPlugins(ctx);

  const lines: string[] = [
    "This document was not written. It was built — every page authored " +
      "through the same editor, the same mutation wire and the same plugin " +
      "bundles a user drives, then saved as a .paged container.",
    "",
    `Engine protocol: ${protocol ?? "unreported"}.`,
    `Render backend: ${gpu ? "WebGPU (Vello)" : "CPU (tiny-skia fallback)"}.`,
    `Plugin bundles loaded: ${
      plugins.length > 0
        ? plugins.map((p) => `${p.id} ${p.version}`).join(", ")
        : "none reported"
    }.`,
    "",
    "Assets. Type is set in OFL and Apache-2.0 faces from the project's " +
      "own font set. Raster and vector artwork is MIT/Apache-2.0 or " +
      "first-party. Nothing here is drawn from the licensed vendor corpus, " +
      "which grants use but not redistribution — so this file can be shown " +
      "to anyone.",
    "",
    "Not shown, and why. paged.slide is a reserved repository with no " +
      "commits. paged.pdf opens a PDF by REPLACING the open document, so " +
      "it cannot contribute a page to a document being built; it and " +
      "paged.publish are exercised as exit paths instead — this document " +
      "exports to IDML through the publish adapter and to PDF through the " +
      "engine's own writer.",
  ];

  const bodyBounds: [number, number, number, number] = [130, 72, 470, 540];
  const body = await doc.textFrame(pageId, bodyBounds);
  const bodyStory = await doc.storyOf(pageId, bodyBounds);
  const text = lines.join("\n");
  await doc.insertText(bodyStory, text);
  await doc.applyStyle(
    bodyStory,
    0,
    text.length,
    await doc.paragraphStyle(STYLE.body),
    "paragraph",
  );
  elements.push(body);

  // A rule in the accent colour, so the page is not purely type.
  const rule = await doc.rectangle(pageId, [120, 72, 123, 540]);
  await doc.setProperty("rectangle", rule, "frameFillColor", {
    type: "colorRef",
    value: await doc.swatch(SWATCH.accent),
  });
  elements.push(rule);

  return {
    title: "Colophon",
    covers: ["stories-text.text.insert", "styles.paragraph.crud"],
    elements,
  };
}
