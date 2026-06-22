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

// SDK Phase 5 / panel-gallery pass — Links panel.
//
// W2.12 — the W0.6 wire summaries land: each row now carries a status
// dot (`LinkSummary.status` ok/missing), a `missing` badge when the
// renderer fell back to the grey placeholder, the placed-image
// colourspace, and the effective PPI with a `lo-res` badge below the
// 150-ppi preflight convention. The toolbar (relink/update/go-to)
// stays a seam until the relocate/update/break Operations ship.

import {
  ListRows,
  PanelToolbar,
  ToolbarBtn,
  useCollection,
  type ListRowBadge,
} from "@paged-media/shell";
import type { LinkSummary } from "@paged-media/client";

/** Low-res convention — placed images whose effective PPI falls below
 *  this get the `lo-res` badge. The print floor is 300 ppi; 150 is the
 *  editor's "warn, not fail" threshold shared with Publication health. */
const LOW_RES_PPI = 150;

export function LinksPanel() {
  const links = useCollection<LinkSummary>("links");
  if (links === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-links-panel="loading"
      >
        Loading links…
      </div>
    );
  }
  return (
    <div data-links-panel="ready">
      <PanelToolbar>
        <ToolbarBtn
          icon="ui-return"
          label="Update link — awaiting engine support"
        />
        <ToolbarBtn
          icon="ui-history"
          label="Relink history — awaiting engine support"
        />
        <ToolbarBtn
          icon="ui-target"
          label="Go to link — awaiting engine support"
        />
      </PanelToolbar>
      {links.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-links>
          No image links in this document.
        </div>
      ) : (
        <div data-link-list>
          <ListRows
            search={links.length > 8}
            searchPlaceholder="Filter links"
            rows={links.map((link) => {
              // The displayed name strips path prefixes for
              // legibility — full URI lives in searchText.
              const filename = link.uri.split("/").pop() ?? link.uri;
              const missing = link.status === "missing";
              const lowRes =
                link.effectivePpi != null && link.effectivePpi < LOW_RES_PPI;
              // status dot: missing → error, resolved → ready, unknown
              // (older wasm) → no dot.
              const dot =
                link.status === "missing"
                  ? ("error" as const)
                  : link.status === "ok"
                    ? ("ok" as const)
                    : undefined;
              // The mono secondary line carries colourspace + PPI when
              // the IDML baked them (synthetic fixtures omit both).
              const meta: string[] = [];
              if (link.colorspace) meta.push(link.colorspace);
              if (link.effectivePpi != null) {
                meta.push(`${Math.round(link.effectivePpi)} ppi`);
              }
              const secondary =
                meta.length > 0 ? meta.join(" · ") : `${link.hostKind}`;
              // A single trailing badge — missing wins over lo-res.
              const badge: ListRowBadge | undefined = missing
                ? { label: "missing", tone: "error" }
                : lowRes
                  ? { label: "lo-res", tone: "warn" }
                  : undefined;
              return {
                key: link.hostSelfId,
                dot,
                icon: "panel-links",
                primary: filename,
                secondary,
                badge,
                searchText: `${filename} ${link.uri} ${link.colorspace ?? ""}`,
              };
            })}
          />
        </div>
      )}
    </div>
  );
}
