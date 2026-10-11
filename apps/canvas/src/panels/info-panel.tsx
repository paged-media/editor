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

// SDK Phase 5 / panel-gallery pass — Info panel.
//
// The gallery's readout shape over the singleton `DocumentMeta`:
// label · mono tabular value rows with hairline separators. Same
// six fields (the spec hooks key off the row labels); richer
// Document / Active page / Output sections arrive as the meta
// surface grows (per-page size, colour profile reads).

import { useCollection, useDocumentMeta } from "@paged-media/shell";

/** "Page 3", not the page's IDML id. */
function pageLabel(
  id: unknown,
  pages: ReadonlyArray<{ selfId?: string }> | null,
): string {
  if (!id) return "—";
  const i = pages?.findIndex((p) => p.selfId === String(id)) ?? -1;
  return i >= 0 ? `Page ${i + 1}` : String(id);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1.5 border-b border-input last:border-b-0"
      data-info-row={label}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="pg-value text-xs" data-info-value>
        {value}
      </span>
    </div>
  );
}

export function InfoPanel() {
  const meta = useDocumentMeta();
  const pages = useCollection<{ selfId?: string }>("pages");
  if (!meta) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-info-panel="loading"
      >
        Loading document info…
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col" data-info-panel="ready">
      <Row label="Document" value={meta.documentName || "—"} />
      <Row label="Pages" value={String(meta.pageCount)} />
      <Row
        label="Active page"
        value={pageLabel(meta.activePage, pages)}
      />
      <Row label="Units" value={meta.units || "—"} />
      <Row label="Color mode" value={meta.colorMode || "—"} />
      <Row label="Dirty" value={meta.dirty ? "yes" : "no"} />
    </div>
  );
}
