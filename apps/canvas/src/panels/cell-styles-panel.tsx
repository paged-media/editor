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

// SDK Phase 5 / gallery pixel-parity — Cell Styles panel (deep1
// `CellStyles` card): "Applied" kicker + soft select over the REAL
// cell styles, the bordered swatch-row preview box, and the honest
// italic note. The apply path (AppliedCellStyle) is wire-shape only
// until the Table NodeId surface lands (engine gap 8).

import { Icon, displayName, useCollection } from "@paged-media/shell";
import type { CellStyleSummary } from "@paged-media/client";

export function CellStylesPanel() {
  const items = useCollection<CellStyleSummary>("cellStyles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-cell-styles-panel="loading"
      >
        Loading cell styles…
      </div>
    );
  }
  return (
    <div className="p-3" data-cell-styles-panel="ready">
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground" data-empty-cell-styles>
          No cell styles.
        </div>
      ) : (
        <>
          <div className="pg-label mb-2">Applied</div>
          <span className="relative mb-[10px] inline-flex w-full">
            <select
              disabled
              data-apply-select
              data-collection="cellStyles"
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
          <div
            className="overflow-hidden rounded-[8px] border border-input"
            data-cell-style-list
          >
            {items.map((s, i) => (
              <div
                key={s.selfId}
                data-style-id={s.selfId}
                className="flex items-center gap-[9px] px-[10px] py-2"
                style={{
                  borderTop: i ? "1px solid var(--pg-border)" : "none",
                }}
              >
                <span
                  className="h-4 w-5 shrink-0 rounded-[3px] border border-input"
                  style={{
                    background: i === 0 ? "var(--pg-muted)" : "transparent",
                  }}
                />
                <span
                  className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs"
                  style={{ color: "var(--pg-fg)" }}
                >
                  {displayName(s.name)}
                </span>
                {s.basedOn ? (
                  <span
                    className="shrink-0 text-[9px]"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--pg-muted-fg)",
                    }}
                  >
                    ← {displayName(s.basedOn)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div
            className="mt-2 text-[10.5px] italic"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            Apply a cell style from the Table panel (select a cell first).
          </div>
        </>
      )}
    </div>
  );
}
