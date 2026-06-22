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

// Concept 2 — the Ink Manager: the production surface between
// swatches and export. One row per spot ink (derived from the spot
// swatches) with output-time settings — convert-to-process and
// alias-to-another-ink — plus the global "Use Standard Lab Values
// for Spots" toggle. None of these edit the swatch identity (AC-8):
// they are separations decisions, consumed by the PDF export
// (Concept 3) and, for standard-Lab, by the preview resolver.

import { useCallback, useEffect, useState } from "react";

import { useCanvasClient } from "@paged-media/shell";
import type { InkSummary } from "@paged-media/client";

export function InkManagerPanel() {
  const client = useCanvasClient();
  const [inks, setInks] = useState<InkSummary[]>([]);
  const [standardLab, setStandardLab] = useState(false);

  const refresh = useCallback(() => {
    void client
      .collection<InkSummary>("inks")
      .then((i) => setInks([...i]))
      .catch(() => setInks([]));
    void client
      .documentMeta()
      .then((m) => setStandardLab(m.useStandardLabForSpots ?? false))
      .catch(() => {});
  }, [client]);

  useEffect(() => {
    refresh();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "documentLoaded" ||
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refresh();
      }
    });
    return off;
  }, [client, refresh]);

  const setInk = (ink: InkSummary, patch: Partial<InkSummary>) => {
    void client
      .mutate({
        op: "setInkSetting",
        args: {
          spotId: ink.spotId,
          convertToProcess: patch.convertToProcess ?? ink.convertToProcess,
          aliasTo:
            patch.aliasTo !== undefined ? patch.aliasTo : ink.aliasTo ?? null,
        },
      })
      .catch(() => {});
  };

  const toggleStandardLab = (enabled: boolean) => {
    setStandardLab(enabled); // optimistic
    void client
      .mutate({ op: "setUseStandardLabForSpots", args: { enabled } })
      .catch(() => {});
  };

  return (
    <div className="p-3 text-sm flex flex-col gap-2" data-ink-manager="ready">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          data-action="standard-lab"
          checked={standardLab}
          onChange={(e) => toggleStandardLab(e.target.checked)}
        />
        Use Standard Lab Values for Spots
      </label>

      {/* Process plates — informational rows. */}
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">
        Inks
      </div>
      <ul className="text-xs">
        {["Cyan", "Magenta", "Yellow", "Black"].map((p) => (
          <li
            key={p}
            className="flex items-center gap-2 px-1 py-0.5 border-b border-input/30 text-muted-foreground"
            data-ink-process={p.toLowerCase()}
          >
            <span className="w-3 h-3 rounded-sm border border-input"
              style={{ background: { Cyan: "#00b7eb", Magenta: "#ec008c", Yellow: "#ffe600", Black: "#000" }[p] }}
            />
            <span className="flex-1">Process {p}</span>
          </li>
        ))}
        {inks.map((ink) => (
          <li
            key={ink.spotId}
            className="flex items-center gap-2 px-1 py-1 border-b border-input/30"
            data-ink-spot={ink.spotId}
          >
            <span
              className="w-3 h-3 rounded-full border border-input"
              title="Spot ink"
              style={{ background: "var(--status-draft)" }}
            />
            <span className="flex-1 truncate" title={ink.name}>
              {ink.name}
            </span>
            <label className="flex items-center gap-1 text-[10px]" title="Convert to process at output">
              <input
                type="checkbox"
                data-action="convert-to-process"
                checked={ink.convertToProcess}
                onChange={(e) =>
                  setInk(ink, { convertToProcess: e.target.checked })
                }
              />
              →CMYK
            </label>
            <select
              className="text-[10px] border border-input rounded max-w-[80px]"
              data-action="alias-ink"
              title="Output as another ink's plate"
              value={ink.aliasTo ?? ""}
              onChange={(e) => setInk(ink, { aliasTo: e.target.value || null })}
            >
              <option value="">own plate</option>
              {inks
                .filter((other) => other.spotId !== ink.spotId)
                .map((other) => (
                  <option key={other.spotId} value={other.spotId}>
                    {other.name}
                  </option>
                ))}
            </select>
          </li>
        ))}
        {inks.length === 0 && (
          <li className="px-1 py-1 text-muted-foreground" data-inks="empty">
            No spot inks in this document.
          </li>
        )}
      </ul>
      <div className="text-[10px] text-muted-foreground">
        Output-time settings — the swatches themselves are never
        modified. Consumed by PDF separations at export.
      </div>
    </div>
  );
}
