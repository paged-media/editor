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

// The editor's first-party plugin bundles, one dynamic `import()` each so
// every bundle is its own chunk (ADR 222). The order is the activation order
// (it was the order of the static imports this replaces).
//
// `lane: "onDemand"` is reserved for a bundle whose whole user-facing surface
// is importers: nothing registers until the user hands the editor a file of
// that type, so nothing can be missing from a menu, the palette, a panel or a
// document restore while it is not loaded.

import type { loadBundle } from "@paged-media/plugin-sdk";

import type { BundleEntry } from "./plugin-bundle-loader";

export type PluginBundle = Parameters<typeof loadBundle>[1];

export const PLUGIN_BUNDLES: readonly BundleEntry<PluginBundle>[] = [
  {
    id: "media.paged.draw",
    lane: "boot",
    load: () => import("@paged-media/draw").then((m) => m.drawBundle),
  },
  {
    id: "media.paged.web",
    lane: "boot",
    load: () => import("@paged-media/web").then((m) => m.webBundle),
  },
  // paged.data (the §7.1 PROVIDER — publishes a governed query) + paged.sheet
  // (the consumer, S-15). Both rendezvous through the host's `dataProviders`.
  // Engines boot lazily; a missing engine / DuckDB degrades honestly in-panel.
  {
    id: "media.paged.data",
    lane: "boot",
    load: () => import("@paged-media/data").then((m) => m.dataBundle),
  },
  {
    id: "media.paged.sheet",
    lane: "boot",
    load: () => import("@paged-media/sheet").then((m) => m.sheetBundle),
  },
  // paged.image: placed bytes → engine-wasm decode → GPU adjustments →
  // in-frame composite. The engine wasm boots lazily on first ingest.
  {
    id: "media.paged.image",
    lane: "boot",
    load: () => import("@paged-media/image").then((m) => m.imageBundle),
  },
  // paged.publish: the IDML importer + exporter. Boot, not on demand: its
  // exporter is a row in the Export Center, which lists what is registered.
  {
    id: "media.paged.publish",
    lane: "boot",
    load: () => import("@paged-media/publish").then((m) => m.publishBundle),
  },
  // paged.pdf: one importer (pdf.js reconstruction → nativeDocument.open) and
  // nothing else — the File ▸ Open PDF… entry is the host's. The placeholder
  // restates the importer the bundle registers in `contributePdfIo`.
  {
    id: "media.paged.pdf",
    lane: "onDemand",
    load: () => import("@paged-media/pdf").then((m) => m.pdfBundle),
    importers: [
      {
        id: "media.paged.pdf.importer.pdf",
        title: "PDF",
        extensions: [".pdf"],
        mimeTypes: ["application/pdf"],
      },
    ],
  },
  // paged.doc — Word/DOCX: importer, Insert Word document…, the outline panel,
  // the wordDocument edit context and part types. Boot: a document carrying
  // its parts must find it active.
  {
    id: "media.paged.doc",
    lane: "boot",
    // The cast: @paged-media/doc is a `link:` to a checkout that resolves its
    // own (older) plugin-api, so its bundle type is a structurally different
    // copy of the same contract until its first publish.
    load: () =>
      import("@paged-media/doc").then((m) => m.docBundle as unknown as PluginBundle),
  },
];
