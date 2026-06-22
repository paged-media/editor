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

// SDK Phase 5 / gallery pixel-parity — Table Styles panel (deep1
// `TableStyles` card): "Applied" kicker + soft select over the REAL
// table styles, the striped header/body/alt/footer preview box, and
// the part chips. Apply is wire-shape only until the Table NodeId
// surface lands (engine gap 8).

import { Icon, displayName, useCollection } from "@paged-media/shell";
import type { TableStyleSummary } from "@paged-media/client";

const PARTS = ["Header", "Body", "Alt", "Border"];

export function TableStylesPanel() {
  const items = useCollection<TableStyleSummary>("tableStyles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-table-styles-panel="loading"
      >
        Loading table styles…
      </div>
    );
  }
  return (
    <div className="p-3" data-table-styles-panel="ready">
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground" data-empty-table-styles>
          No table styles.
        </div>
      ) : (
        <>
          <div className="pg-label mb-2">Applied</div>
          <span className="relative mb-3 inline-flex w-full">
            <select
              disabled
              data-apply-select
              data-collection="tableStyles"
              className="h-[30px] w-full appearance-none rounded-[6px] border border-input bg-background pl-2.5 pr-7 text-[12.5px] opacity-55"
              style={{ color: "var(--pg-muted-fg)" }}
            >
              <option>—</option>
            </select>
            <Icon
              name="ui-chevron-down"
              size={13}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--pg-muted-fg)" }}
            />
          </span>
          {/* The REAL style names inside the card's striped preview. */}
          <div
            className="mb-[10px] overflow-hidden rounded-[8px] border border-input"
            data-table-style-list
          >
            <div
              className="px-[10px] py-[6px] text-[9px] font-bold uppercase"
              style={{
                background: "var(--pg-muted)",
                letterSpacing: "0.08em",
                color: "var(--pg-muted-fg)",
              }}
            >
              Header
            </div>
            {items.map((s, i) => (
              <div
                key={s.selfId}
                data-style-id={s.selfId}
                className="px-[10px] py-[6px] text-[11px]"
                style={{
                  borderTop: "1px solid var(--pg-border)",
                  background:
                    i % 2 === 1
                      ? "color-mix(in srgb, var(--pg-fg) 4%, transparent)"
                      : "transparent",
                  color: "var(--pg-fg)",
                }}
              >
                {displayName(s.name)}
              </div>
            ))}
            <div
              className="px-[10px] py-[6px] text-[10px] italic"
              style={{
                borderTop: "1px solid var(--pg-border)",
                color: "var(--pg-muted-fg)",
              }}
            >
              Footer · notes
            </div>
          </div>
          <div className="flex gap-[6px]">
            {PARTS.map((p) => (
              <span
                key={p}
                className="rounded-[5px] border border-input px-[7px] py-[3px] text-[10px]"
                style={{ color: "var(--pg-muted-fg)" }}
              >
                {p}
              </span>
            ))}
          </div>
          <div
            className="mt-2 text-[10.5px] italic"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            Apply a table style from the Table panel (select a cell first).
          </div>
        </>
      )}
    </div>
  );
}
