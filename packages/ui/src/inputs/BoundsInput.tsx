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

import { LengthInput } from "./LengthInput";
import type { LengthUnit } from "./units";

export interface BoundsInputProps {
  /** Bounds in points as `[top, left, bottom, right]` (IDML wire shape). */
  valuePt: [number, number, number, number];
  /** Initial display unit for all four cells. */
  defaultUnit?: LengthUnit;
  /** Cell labels in wire order `[top, left, bottom, right]`. */
  labels?: [string, string, string, string];
  /** Grid shape: the classic 2×2 ("grid2") or the design system's
   * 4-across row ("row4" — gallery `bounds` control: compact cell,
   * tiny label below, no unit picker). */
  layout?: "grid2" | "row4";
  /** Fires on every change. */
  onChangePt: (value: [number, number, number, number]) => void;
  /** Fires on Enter / blur / scrub commit. */
  onCommitPt?: (value: [number, number, number, number]) => void;
  disabled?: boolean;
}

/**
 * Inspector P1 — 4-cell length composite for a frame's
 * `[top, left, bottom, right]` bounds. Each cell is a
 * `LengthInput` (unit-aware + scrub-aware). The classic "grid2"
 * lays the cells out 2×2 with scrub-chip labels (the transform-
 * panel convention); "row4" is the kit's compact 4-across row
 * with the label under each cell (insets, offsets, crops).
 */
export function BoundsInput(props: BoundsInputProps) {
  const {
    valuePt,
    defaultUnit = "pt",
    labels = ["T", "L", "B", "R"],
    layout = "grid2",
    onChangePt,
    onCommitPt,
    disabled = false,
  } = props;
  const [top, left, bottom, right] = valuePt;

  const set = (idx: 0 | 1 | 2 | 3, next: number, commit: boolean) => {
    const out: [number, number, number, number] = [top, left, bottom, right];
    out[idx] = next;
    onChangePt(out);
    if (commit) onCommitPt?.(out);
  };

  if (layout === "row4") {
    return (
      <div className="grid grid-cols-4 gap-[5px]" data-bounds-input>
        {([0, 1, 2, 3] as const).map((idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            <LengthInput
              valuePt={valuePt[idx]}
              defaultUnit={defaultUnit}
              showUnit={false}
              disabled={disabled}
              className="w-full text-center [&>input]:text-center [&>input]:px-1"
              onChangePt={(v) => set(idx, v, false)}
              onCommitPt={(v) => set(idx, v, true)}
              aria-label={labels[idx]}
            />
            <span className="text-[8.5px] text-center text-muted-foreground select-none">
              {labels[idx]}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1" data-bounds-input>
      <LengthInput
        valuePt={top}
        defaultUnit={defaultUnit}
        label={labels[0]}
        disabled={disabled}
        onChangePt={(v) => set(0, v, false)}
        onCommitPt={(v) => set(0, v, true)}
        aria-label="top"
      />
      <LengthInput
        valuePt={left}
        defaultUnit={defaultUnit}
        label={labels[1]}
        disabled={disabled}
        onChangePt={(v) => set(1, v, false)}
        onCommitPt={(v) => set(1, v, true)}
        aria-label="left"
      />
      <LengthInput
        valuePt={bottom}
        defaultUnit={defaultUnit}
        label={labels[2]}
        disabled={disabled}
        onChangePt={(v) => set(2, v, false)}
        onCommitPt={(v) => set(2, v, true)}
        aria-label="bottom"
      />
      <LengthInput
        valuePt={right}
        defaultUnit={defaultUnit}
        label={labels[3]}
        disabled={disabled}
        onChangePt={(v) => set(3, v, false)}
        onCommitPt={(v) => set(3, v, true)}
        aria-label="right"
      />
    </div>
  );
}
